// The annotation loop against a scripted fake app-server (no Codex, no network; invented lines).

import assert from "node:assert/strict";
import { test } from "node:test";
import { annotate } from "./annotator.ts";
import { CodexClient, type LineTransport } from "./codex.ts";
import type { Line, Song } from "./types.ts";

const good: Partial<Line> = {
  zh: "猫在叫",
  tokens: [
    { text: "猫", reading: "ねこ", pos: "noun", gloss: "猫" },
    { text: "が", pos: "particle", gloss: "（主语）" },
    { text: "鳴く", reading: "なく", pos: "verb", gloss: "叫", lemma: { text: "鳴く", reading: "なく", class: "godan" } },
  ],
  chunks: [
    { ja: "猫が", zh: "猫", role: "主语" },
    { ja: "鳴く", zh: "在叫", role: "谓语" },
  ],
};

/** A fake server: answers thread/turn requests, then plays `script` as tool calls in the first turn. */
function fakeServer(script: unknown[]) {
  let toClient: (line: string) => void = () => {};
  const toolResults: { success: boolean; text: string }[] = [];
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  let callId = 1000;
  const pendingTool = new Map<number, () => void>();
  const out = (m: unknown) => queueMicrotask(() => toClient(JSON.stringify(m)));
  async function playTurn(threadId: string, turnId: string, calls: unknown[]) {
    for (const args of calls) {
      const id = ++callId;
      await new Promise<void>((resolve) => {
        pendingTool.set(id, resolve);
        out({ id, method: "item/tool/call", params: { threadId, turnId, callId: String(id), namespace: null, tool: "submit_lines", arguments: { lines: [args] } } });
      });
    }
    out({ method: "item/completed", params: { threadId, item: { type: "agentMessage", text: "完成" } } });
    out({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed", error: null } } });
  }
  let turns = 0;
  const transport: LineTransport = {
    onLine: (cb) => (toClient = cb),
    send(line) {
      const m = JSON.parse(line);
      if (m.method) requests.push({ method: m.method, params: m.params });
      if (m.result && pendingTool.has(m.id)) {
        toolResults.push({ success: m.result.success, text: m.result.contentItems[0].text });
        pendingTool.get(m.id)!();
        return;
      }
      if (m.method === "thread/start") out({ id: m.id, result: { thread: { id: "t1" }, model: "fake-model" } });
      if (m.method === "turn/start") {
        const turnId = `u${++turns}`;
        out({ id: m.id, result: { turn: { id: turnId } } });
        void playTurn("t1", turnId, turns === 1 ? script : []);
      }
    },
  };
  return { transport, toolResults, requests };
}

const song: Song = {
  version: 1,
  id: "test",
  title: "小さな歌",
  artist: "テスト",
  lines: [
    { id: "L01", time: 1, ja: "猫が鳴く" },
    { id: "L02", time: 3, ja: "犬が鳴く" },
  ],
};

test("rejects a wrong line with checker errors, saves the fixed one", async () => {
  const bad = { id: "L01", ...good, tokens: [...good.tokens!.slice(0, 2), { ...good.tokens![2], steps: ["Ta"] }] };
  const server = fakeServer([bad, { id: "L01", ...good }, { id: "L02", ...good }]);
  const client = new CodexClient(server.transport);
  const saves: Song[] = [];
  const events: string[] = [];
  const run = annotate(client, song, ["L01"], { save: async (s) => void saves.push(s), onEvent: (e) => events.push(e.type) }, { spec: "SPEC" });
  const result = await run.done;

  assert.deepEqual(result, { saved: ["L01"], remaining: [] });
  assert.equal(server.toolResults[0].success, false);
  assert.match(server.toolResults[0].text, /鳴いた/);
  assert.equal(server.toolResults[1].success, true);
  assert.equal(server.toolResults[2].success, false, "L02 is not part of the job");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].lines[0].zh, "猫在叫");
  assert.equal(saves[0].lines[0].time, 1, "id/time/ja come from the song, not the agent");
  assert.equal(saves[0].lines[1], song.lines[1], "untouched lines keep their identity");
  assert.deepEqual(events, ["started", "claimed", "submitted", "rejected", "submitted", "saved", "message", "finished"]);

  const start = server.requests.find((r) => r.method === "thread/start")!.params;
  assert.equal(start.sandbox, "read-only");
  assert.equal((start.config as { web_search: string }).web_search, "disabled");
  assert.equal((start.config as { features: Record<string, boolean> }).features.hooks, false);
  assert.ok(start.baseInstructions);
  assert.deepEqual(
    (start.dynamicTools as { name: string }[]).map((t) => t.name),
    ["submit_lines", "conj", "grammar_search"],
  );
  assert.match(String(start.developerInstructions), /不得引用、改写或搜索任何歌词平台/);
});

test("retries an unfinished line once, then skips it", async () => {
  const server = fakeServer([]);
  const client = new CodexClient(server.transport);
  let skipped: string[] = [];
  const result = await annotate(client, song, ["L01", "L02"], { save: async () => {}, onEvent: (e) => e.type === "finished" && (skipped = e.skipped) }, { spec: "" })
    .done;
  assert.deepEqual(result.remaining, ["L01", "L02"]);
  assert.deepEqual(skipped, ["L01", "L02"]);
  assert.equal(server.requests.filter((r) => r.method === "turn/start").length, 2);
});

test("parallel sessions split the queue and the last write has every line", async () => {
  // a cooperative fake: every turn submits a passing annotation for each line its prompt asks for
  let toClient: (line: string) => void = () => {};
  const threads: string[] = [];
  const perThreadIds = new Map<string, string[]>();
  let callId = 0;
  const waiting = new Map<number, () => void>();
  const out = (m: unknown) => queueMicrotask(() => toClient(JSON.stringify(m)));
  const transport: LineTransport = {
    onLine: (cb) => (toClient = cb),
    send(line) {
      const m = JSON.parse(line);
      if (m.result && waiting.has(m.id)) return waiting.get(m.id)!();
      if (m.method === "thread/start") {
        const id = `t${threads.push("x")}`;
        out({ id: m.id, result: { thread: { id }, model: "fake" } });
      }
      if (m.method === "turn/start") {
        const threadId = m.params.threadId as string;
        const ids = [...String(m.params.input[0].text).matchAll(/L\d\d/g)].map((x) => x[0]).filter((id) => !/已标注/.test(id));
        const asked = String(m.params.input[0].text).split("这一轮请标注")[1].match(/L\d\d/g)!;
        perThreadIds.set(threadId, [...(perThreadIds.get(threadId) ?? []), ...asked]);
        out({ id: m.id, result: { turn: { id: `${threadId}-${ids.length}` } } });
        void (async () => {
          for (const id of asked)
            await new Promise<void>((resolve) => {
              const cid = ++callId;
              waiting.set(cid, resolve);
              out({ id: cid, method: "item/tool/call", params: { threadId, turnId: "x", callId: String(cid), namespace: null, tool: "submit_lines", arguments: { lines: [{ id, ...good }] } } });
            });
          out({ method: "turn/completed", params: { threadId, turn: { id: "x", status: "completed", error: null } } });
        })();
      }
    },
  };
  const lines = Array.from({ length: 8 }, (_, i) => ({ id: `L0${i + 1}`, time: i, ja: "猫が鳴く" }));
  const big: Song = { ...song, lines };
  let last: Song | null = null;
  const result = await annotate(new CodexClient(transport), big, lines.map((l) => l.id), { save: async (s) => void (last = s), onEvent: () => {} }, { spec: "", concurrency: 2, batch: 4 }).done;

  assert.equal(threads.length, 2);
  assert.equal(result.saved.length, 8);
  const asked = [...perThreadIds.values()].flat().sort();
  assert.deepEqual(asked, lines.map((l) => l.id), "each line asked for exactly once");
  assert.equal(last!.lines.filter((l) => l.tokens).length, 8);
});

test("a line that already has an annotation is a redo: the prompt shows the old one to check", async () => {
  const { firstPrompt, nextPrompt } = await import("./annotator.ts");
  const song: Song = {
    version: 1,
    id: "t",
    title: "テスト",
    artist: "テスター",
    lines: [
      { id: "L01", ja: "猫が鳴く", ...good },
      { id: "L02", ja: "犬が走る" },
    ],
  };
  const redo = firstPrompt(song, ["L01"]);
  assert.match(redo, /L01 已经有一份通过校验的标注/);
  assert.match(redo, /修订\*\*，不是重写/);
  // the whole old annotation, phrases included, so its structure can be kept
  const old = JSON.parse(redo.split("L01  ").at(-1)!);
  assert.deepEqual(old.chunks, good.chunks);
  assert.equal(old.zh, "猫在叫");
  assert.doesNotMatch(firstPrompt(song, ["L02"]), /已经有一份/);
  assert.match(nextPrompt(song, ["L01"]), /旧标注：/);
});
