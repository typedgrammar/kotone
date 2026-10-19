// Host bridge. Inside the macOS shell it talks to Swift through WKScriptMessageHandlerWithReply
// (AVPlayer, file panels, the on-disk library); in a plain browser it falls back to web APIs so
// `pnpm dev` works too.

import type { Http } from "../../core/lyrics/index.ts";
import { base64ToBytes } from "../../core/lyrics/sources.ts";
import type { Favorites, Song } from "../../core/types.ts";

export interface SongRecord {
  id: string;
  song?: Song;
  error?: string;
  /** Resolved audio location: a file path (native) or object URL (browser) */
  audio?: string | null;
  bundled?: boolean;
  /** The JSON as read, to skip re-rendering unchanged songs on refresh */
  raw?: string;
}

export type PlayerEvent =
  | { type: "state"; time: number; duration: number; playing: boolean }
  | { type: "ended" }
  | { type: "error"; message: string };

/** The user's `codex app-server`, as lines of JSON-RPC (see core/codex.ts) */
export interface CodexProbe {
  path: string | null;
  version?: string;
  error?: string;
}

export interface AgentProcess {
  /** `path` overrides where codex is; empty means the shell PATH */
  start(path: string): Promise<void>;
  probe(path: string): Promise<CodexProbe>;
  send(line: string): void;
  stop(): void;
  onLine(cb: (line: string) => void): void;
  onExit(cb: (e: { code: number; stderr: string }) => void): void;
}

export interface Bridge {
  native: boolean;
  listSongs(): Promise<SongRecord[]>;
  loadFavorites(): Promise<Favorites | null>;
  saveFavorites(f: Favorites): Promise<void>;
  pickAudio(songId: string): Promise<string | null>;
  importSong(): Promise<string | null>;
  revealLibrary(): Promise<void>;
  /** Write a song into the library; an existing id is only replaced with `overwrite` */
  saveSong(song: Song, overwrite: boolean): Promise<void>;
  /** HTTP for the lyric sources, which need headers a page can't send */
  http: Http;
  agent: AgentProcess;
  openURL(url: string): void;
  /** The app menu's Settings… (⌘,) */
  onOpenSettings(cb: () => void): void;
  /** Native menus and messages follow the UI language */
  setLanguage(lang: "zh" | "en"): void;
  load(src: string, meta: { title: string; artist: string }): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;
  onEvent(cb: (e: PlayerEvent) => void): void;
}

// Demo songs ship inside the bundle; library songs with the same id override them.
export const songJson = (song: Song) => JSON.stringify(song, null, 2) + "\n";

const bundled = import.meta.glob("../../songs/*/song.json", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;

function parseRecord(id: string, json: string, extra: Partial<SongRecord> = {}): SongRecord {
  try {
    return { id, song: JSON.parse(json) as Song, raw: json, ...extra };
  } catch (e) {
    return { id, error: (e as Error).message, raw: json, ...extra };
  }
}

function mergeRecords(library: SongRecord[]): SongRecord[] {
  const out = new Map<string, SongRecord>();
  for (const [file, json] of Object.entries(bundled)) {
    const r = parseRecord(file.split("/").at(-2)!, json, { bundled: true });
    out.set(r.song?.id ?? r.id, r);
  }
  for (const r of library) out.set(r.song?.id ?? r.id, r);
  return [...out.values()];
}

type Listener = (e: PlayerEvent) => void;
type AgentEvent = { type: "agent"; line: string } | { type: "agentExit"; code: number; stderr: string };
type UiEvent = { type: "openSettings" };

/** Fan agent events out to line / exit listeners. */
function agentHub() {
  const lines: ((l: string) => void)[] = [];
  const exits: ((e: { code: number; stderr: string }) => void)[] = [];
  return {
    dispatch(e: AgentEvent) {
      if (e.type === "agent") lines.forEach((l) => l(e.line));
      else exits.forEach((l) => l(e));
    },
    onLine: (cb: (l: string) => void) => void lines.push(cb),
    onExit: (cb: (e: { code: number; stderr: string }) => void) => void exits.push(cb),
  };
}

function nativeBridge(handler: { postMessage(m: unknown): Promise<unknown> }): Bridge {
  const call = <T,>(method: string, params: Record<string, unknown> = {}) => handler.postMessage({ method, params }) as Promise<T>;
  const listeners: Listener[] = [];
  const hub = agentHub();
  const settings: (() => void)[] = [];
  (window as unknown as { __kotone: unknown }).__kotone = {
    emit: (e: PlayerEvent | AgentEvent | UiEvent) =>
      e.type === "agent" || e.type === "agentExit" ? hub.dispatch(e) : e.type === "openSettings" ? settings.forEach((f) => f()) : listeners.forEach((l) => l(e)),
  };
  return {
    native: true,
    agent: {
      start: async (path) => void (await call("agent.start", { path })),
      probe: (path) => call<CodexProbe>("agent.probe", { path }),
      send: (line) => void call("agent.send", { line }),
      stop: () => void call("agent.stop"),
      onLine: hub.onLine,
      onExit: hub.onExit,
    },
    openURL: (url) => void call("app.openURL", { url }),
    onOpenSettings: (cb) => void settings.push(cb),
    setLanguage: (lang) => void call("app.setLanguage", { lang }),
    async listSongs() {
      // `links` holds audio picked in the app, including for bundled demo songs
      const { songs, links } = await call<{ songs: { id: string; json: string; audio: string | null }[]; links: Record<string, string> }>(
        "library.list",
      );
      return mergeRecords(songs.map((r) => parseRecord(r.id, r.json, { audio: r.audio }))).map((r) => ({
        ...r,
        audio: r.audio ?? links[r.song?.id ?? r.id] ?? null,
      }));
    },
    async loadFavorites() {
      const s = await call<string | null>("favorites.load");
      return s ? (JSON.parse(s) as Favorites) : null;
    },
    async saveFavorites(f) {
      await call("favorites.save", { json: JSON.stringify(f, null, 2) });
    },
    pickAudio: (songId) => call<string | null>("audio.pick", { songId }),
    importSong: () => call<string | null>("library.import"),
    revealLibrary: () => call("library.reveal"),
    saveSong: async (song, overwrite) => void (await call("library.save", { json: songJson(song), overwrite })),
    async http(req) {
      const r = await call<{ status: number; body: string }>("net.fetch", { ...req });
      return { status: r.status, body: base64ToBytes(r.body) };
    },
    load: (src, meta) => call("player.load", { path: src, ...meta }),
    play: () => void call("player.play"),
    pause: () => void call("player.pause"),
    seek: (time) => void call("player.seek", { time }),
    onEvent: (cb) => void listeners.push(cb),
  };
}

function webBridge(): Bridge {
  const audio = new Audio();
  const links = new Map<string, string>();
  const listeners: Listener[] = [];
  const emit = (e: PlayerEvent) => listeners.forEach((l) => l(e));
  const state = () =>
    emit({ type: "state", time: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0, playing: !audio.paused });
  for (const ev of ["play", "pause", "seeked", "loadedmetadata", "timeupdate"]) audio.addEventListener(ev, state);
  audio.addEventListener("ended", () => emit({ type: "ended" }));
  audio.addEventListener("error", () => audio.src && emit({ type: "error", message: "player.err.play" }));
  const FAV = "kotone.favorites";
  const hub = agentHub();
  let events: EventSource | null = null;
  const post = (path: string, body?: unknown) => fetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  return {
    native: false,
    // the dev server runs codex for the browser (web/vite.config.ts)
    agent: {
      async start(path) {
        events ??= Object.assign(new EventSource("./__agent/events"), {
          onmessage: (m: MessageEvent<string>) => hub.dispatch(JSON.parse(m.data) as AgentEvent),
        });
        const res = await post("./__agent/start", { path });
        if (!res.ok) throw new Error(res.status === 404 ? "agent.err.browser" : await res.text());
      },
      async probe(path) {
        const res = await post("./__agent/probe", { path }).catch(() => null);
        return res?.ok ? ((await res.json()) as CodexProbe) : { path: null, error: "agent.err.browser" };
      },
      send: (line) => void post("./__agent/send", { line }),
      stop: () => void post("./__agent/stop"),
      onLine: hub.onLine,
      onExit: hub.onExit,
    },
    openURL: (url) => void window.open(url, "_blank"),
    onOpenSettings: () => {},
    setLanguage: () => {},
    async listSongs() {
      let library: SongRecord[] = [];
      try {
        const res = await fetch("./__library");
        if (res.ok && res.headers.get("content-type")?.includes("json"))
          library = ((await res.json()) as { id: string; json: string }[]).map((r) => parseRecord(r.id, r.json));
      } catch {
        // static build without the dev middleware
      }
      return mergeRecords(library).map((r) => ({ ...r, audio: links.get(r.id) ?? null }));
    },
    async loadFavorites() {
      try {
        const s = localStorage.getItem(FAV);
        return s ? (JSON.parse(s) as Favorites) : null;
      } catch {
        return null;
      }
    },
    async saveFavorites(f) {
      try {
        localStorage.setItem(FAV, JSON.stringify(f));
      } catch {
        // storage unavailable (private mode): favorites live for this session only
      }
    },
    pickAudio(songId) {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          const url = URL.createObjectURL(file);
          links.set(songId, url);
          resolve(url);
        };
        input.click();
      });
    },
    async importSong() {
      return null;
    },
    async revealLibrary() {},
    // the dev server (web/vite.config.ts) stands in for the native side
    async saveSong(song, overwrite) {
      const res = await fetch("./__library", { method: "POST", body: JSON.stringify({ json: songJson(song), overwrite }) });
      if (!res.ok) throw new Error((await res.text()) || "search.err.save");
    },
    async http(req) {
      const res = await fetch("./__fetch", { method: "POST", body: JSON.stringify(req) });
      if (!res.ok) throw new Error(res.status === 404 ? "search.err.dev" : await res.text());
      const r = (await res.json()) as { status: number; body: string };
      return { status: r.status, body: base64ToBytes(r.body) };
    },
    async load(src) {
      audio.src = src;
      audio.load();
    },
    play: () => void audio.play().catch(() => {}),
    pause: () => audio.pause(),
    seek: (time) => {
      audio.currentTime = time;
    },
    onEvent: (cb) => void listeners.push(cb),
  };
}

const handler = (window as unknown as { webkit?: { messageHandlers?: { kotone?: { postMessage(m: unknown): Promise<unknown> } } } })
  .webkit?.messageHandlers?.kotone;

export const bridge: Bridge = handler ? nativeBridge(handler) : webBridge();
