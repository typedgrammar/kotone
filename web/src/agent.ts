// In-app annotation: the user's Codex (via `codex app-server`, on their ChatGPT plan) annotates
// lines while they listen. Lines appear in the player as soon as they pass the checker.

import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import guide from "../../docs/annotation-guide.md?raw";
import { annotate, type AnnotationRun } from "../../core/annotator.ts";
import { CodexClient, type RateLimits } from "../../core/codex.ts";
import { specText } from "../../core/spec.ts";
import type { Line, Song } from "../../core/types.ts";
import { bridge, type CodexProbe } from "./bridge.ts";
import type { Key } from "./i18n.ts";
import { app } from "./state.ts";

export type AgentStatus = "off" | "starting" | "login" | "ready" | "working" | "error";

/** Worded by the UI in the current language; `raw` errors (from Codex itself) are shown as-is. */
export type AgentError = { key: Key; params?: Record<string, string | number> } | { raw: string };

const INSTALL: AgentError = { key: "agent.err.install" };

/**
 * Measured on 8 test lines (all passing first time): writing the annotation JSON is the bottleneck,
 * so each session submits its whole batch in one call and the batches run in parallel. medium effort
 * is as accurate here as the user's global xhigh at half the time; Fast is ~1.6x on top.
 */
function plan(lines: number, redo: boolean) {
  const sessions = Math.min(8, Math.ceil(lines / 3));
  return {
    spec: specText(guide),
    // a redo is one line someone found wrong: worth the slower, more careful pass
    effort: redo ? "high" : "medium",
    serviceTier: app.settings.codexFast ? "priority" : undefined,
    concurrency: sessions,
    batch: Math.ceil(lines / sessions),
  };
}

export const agent = createRoot(() => {
  const [state, setState] = createStore({
    status: "off" as AgentStatus,
    error: null as AgentError | null,
    plan: "",
    email: "",
    model: "",
    limits: null as RateLimits | null,
    songId: null as string | null,
    /** line ids of the current job, in order */
    queue: [] as string[],
    saved: [] as string[],
    /** lines a Codex session is working on right now (several sessions run in parallel) */
    working: [] as string[],
    /** rejected submissions per line, so the UI can say it's being fixed */
    retries: {} as Record<string, number>,
    message: "",
    probe: null as CodexProbe | null,
    probing: false,
    /** Lines redone this session, by `${songId}/${lineId}`: the annotation before, to go back to, and what Codex says it changed */
    redone: {} as Record<string, { before: Line; summary?: string }>,
  });

  let client: CodexClient | null = null;
  let connecting: Promise<CodexClient | null> | null = null;
  let run: AnnotationRun | null = null;
  const lineListeners: ((l: string) => void)[] = [];
  bridge.agent.onLine((l) => lineListeners.forEach((f) => f(l)));
  let expectExit = false; // set when we stop the process ourselves
  bridge.agent.onExit(({ code, stderr }) => {
    client?.close("Codex 进程已退出");
    client = null;
    connecting = null;
    if (expectExit) return void (expectExit = false);
    const missing = code === 127 || /No such file|not found/.test(stderr);
    setState({ status: "error", error: missing ? INSTALL : { key: "agent.err.exited", params: { code, detail: stderr.trim().split("\n").at(-1) ?? "" } } });
  });

  async function readAccount(c: CodexClient) {
    const { account } = await c.request<{ account: { type: string; email?: string | null; planType?: string } | null }>("account/read", {});
    if (!account) return void setState({ status: "login" });
    setState({ plan: account.planType ?? account.type, email: account.email ?? "", status: run ? "working" : "ready" });
    const r = await c.request<{ rateLimits: RateLimits }>("account/rateLimits/read", {}).catch(() => null);
    if (r) setState({ limits: r.rateLimits });
  }

  function connect(): Promise<CodexClient | null> {
    connecting ??= (async () => {
      setState({ status: "starting", error: null });
      try {
        await bridge.agent.start(app.settings.codexPath);
        const c = new CodexClient({ send: bridge.agent.send, onLine: (cb) => lineListeners.push(cb) });
        await c.initialize({ name: "kotone", title: "Kotone", version: "0.1.0" });
        c.on(({ method, params }) => {
          if (method === "account/rateLimits/updated") {
            const next = params.rateLimits as RateLimits;
            setState("limits", (prev) => ({ primary: next.primary ?? prev?.primary ?? null, secondary: next.secondary ?? prev?.secondary ?? null }));
          } else if (method === "account/login/completed" || method === "account/updated") void readAccount(c);
        });
        client = c;
        await readAccount(c);
        return c;
      } catch (e) {
        connecting = null;
        const msg = e instanceof Error ? e.message : String(e);
        // new web assets on an old native binary (the app was rebuilt while running)
        const stale = /unknown method/.test(msg);
        const browser = msg === "agent.err.browser";
        setState({
          status: "error",
          error: stale
            ? { key: "agent.err.stale" }
            : browser
              ? { key: "agent.err.browser" }
              : /codex/i.test(msg) && /找不到|not found|No such/.test(msg)
                ? INSTALL
                : { raw: msg },
        });
        return null;
      }
    })();
    return connecting;
  }

  return {
    state,
    connect,
    /** Settings panel: is codex there, which version, which account, how much quota is left */
    async check() {
      setState({ probing: true });
      try {
        setState({ probe: await bridge.agent.probe(app.settings.codexPath) });
        if (state.probe?.version && !run) await connect();
      } finally {
        setState({ probing: false });
      }
    },
    /** A new codex path: drop the running process so the next start uses it */
    restart() {
      if (run) return;
      if (client) expectExit = true;
      bridge.agent.stop();
      client?.close("重新启动 Codex");
      client = null;
      connecting = null;
      setState({ status: "off", error: null, plan: "", email: "", limits: null });
    },
    async logout() {
      const c = await connect();
      if (!c) return;
      await c.request("account/logout", {}).catch(() => {});
      setState({ status: "login", plan: "", email: "", limits: null });
    },
    /** Sign in with ChatGPT in the browser; account/login/completed brings us back. */
    async login() {
      const c = await connect();
      if (!c) return;
      const r = await c.request<{ type: string; authUrl?: string }>("account/login/start", { type: "chatgpt" });
      if (r.authUrl) bridge.openURL(r.authUrl);
    },
    isQueued: (songId: string, lineId: string) => state.songId === songId && state.queue.includes(lineId) && !state.saved.includes(lineId),
    isWorking: (songId: string, lineId: string) => state.songId === songId && state.working.includes(lineId),
    /** Annotate one line again, keeping the current annotation to go back to */
    redo(song: Song, line: Line) {
      return this.annotate(song, [line.id], line);
    },
    /** Put back the annotation a redo replaced */
    async undoRedo(song: Song, lineId: string) {
      const key = `${song.id}/${lineId}`;
      const before = state.redone[key]?.before;
      if (!before) return;
      await app.updateSong({ ...song, lines: song.lines.map((l) => (l.id === lineId ? before : l)) });
      setState("redone", produce((r) => void delete r[key]));
    },
    async annotate(song: Song, lineIds: string[], redoing?: Line) {
      if (run || !lineIds.length) return;
      const c = await connect();
      if (!c || state.status === "login") return void app.setSettingsOpen(true);
      setState({ status: "working", songId: song.id, queue: lineIds, saved: [], working: [], retries: {}, message: "", error: null });
      run = annotate(
        c,
        song,
        lineIds,
        {
          save: (s) => app.updateSong(s),
          onEvent(e) {
            if (e.type === "started") setState({ model: e.model });
            else if (e.type === "claimed") setState("working", (w) => [...w, ...e.lineIds]);
            else if (e.type === "released") setState("working", (w) => w.filter((id) => !e.lineIds.includes(id)));
            else if (e.type === "rejected") setState("retries", e.lineId, (n) => (n ?? 0) + 1);
            else if (e.type === "saved")
              setState(
                produce((s) => {
                  s.saved.push(e.lineId);
                  s.working = s.working.filter((id) => id !== e.lineId);
                  if (redoing) s.redone[`${song.id}/${redoing.id}`] = { before: redoing };
                }),
              );
            else if (e.type === "message") setState({ message: e.text });
            else if (e.type === "finished") {
              run = null;
              // Codex's closing sentence says what it changed
              const redone = redoing && state.redone[`${song.id}/${redoing.id}`];
              if (redone && state.message) setState("redone", `${song.id}/${redoing!.id}`, "summary", state.message);
              const error: AgentError | null = e.failure
                ? { raw: e.failure }
                : e.skipped.length && !e.stopped
                  ? { key: "agent.err.skipped", params: { n: e.skipped.length, ids: e.skipped.join(", ") } }
                  : null;
              setState({ status: "ready", working: [], error });
            }
          },
        },
        plan(lineIds.length, !!redoing),
      );
    },
    stop() {
      run?.stop();
    },
  };
});
