// In-app annotation through Codex: the agent gets the spec, the song for context and three tools.
// `submit_lines` runs the same checker as `kotone check`; a line is saved (and shows up in the
// player) only once it passes, otherwise the agent gets the errors back and resubmits. Nothing
// else is exposed: no shell, no files, no web — and every `zh` is the agent's own translation.

import { analyzeLine, isAnnotated, POS_ZH } from "./analyze.ts";
import type { CodexClient, DynamicTool } from "./codex.ts";
import { CLASS_INFO, derive, STEP_IDS, STEP_INFO } from "./conjugate.ts";
import { GRAMMAR } from "./grammar.ts";
import type { Line, Song, StepId, Token, WordClass } from "./types.ts";

export type AnnotatorEvent =
  | { type: "started"; model: string }
  /** a session took these lines for its next turn / gave them back unfinished */
  | { type: "claimed"; lineIds: string[] }
  | { type: "released"; lineIds: string[] }
  | { type: "submitted"; lineId: string }
  | { type: "rejected"; lineId: string; errors: string[] }
  | { type: "saved"; lineId: string; warnings: string[] }
  | { type: "message"; text: string }
  /** `failure`: Codex's own error text; `skipped`: lines that failed the check twice */
  | { type: "finished"; saved: string[]; remaining: string[]; stopped: boolean; skipped: string[]; failure?: string };

export interface AnnotatorHooks {
  /** Persist the song (and show it); called after every accepted line */
  save(song: Song): Promise<void>;
  onEvent(e: AnnotatorEvent): void;
}

/** Default lines per turn: submitted together in one submit_lines call */
const BATCH = 8;
/** A line that fails this many turns is skipped rather than retried forever */
const MAX_TURNS_PER_LINE = 2;
const str = { type: "string" };

const TOKEN_SCHEMA = {
  type: "object",
  properties: {
    text: str,
    reading: { type: "string", description: "全假名读音；text 含汉字时必填" },
    pos: { type: "string", enum: Object.keys(POS_ZH) },
    gloss: { type: "string", description: "本句里的中文意思" },
    lemma: {
      type: "object",
      properties: { text: str, reading: str, class: { type: "string", enum: Object.keys(CLASS_INFO) } },
      required: ["text", "class"],
    },
    steps: { type: "array", items: { type: "string", enum: STEP_IDS } },
    jlpt: { type: "string", enum: ["N5", "N4", "N3", "N2", "N1"] },
    ruby: { type: "array", items: { type: "array", items: str }, description: "熟字训等自动对齐失败时手写 [[字, 读音], …]" },
    note: str,
  },
  required: ["text", "pos"],
};

const SUBMIT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "行 id，如 L03" },
    zh: { type: "string", description: "你自己的中文翻译" },
    tokens: { type: "array", items: TOKEN_SCHEMA },
    chunks: {
      type: "array",
      items: {
        type: "object",
        properties: { ja: str, zh: { anyOf: [str, { type: "array", items: str }] }, role: str, note: str },
        required: ["ja", "role"],
      },
    },
    grammar: {
      type: "array",
      items: { type: "object", properties: { id: str, ja: str, nth: { type: "integer" }, note: str }, required: ["id", "ja"] },
    },
    note: str,
  },
  required: ["id", "zh", "tokens", "chunks"],
};

const fmtIssue = (i: { at?: string; message: string }) => (i.at ? `${i.at} ${i.message}` : i.message);

/** The tools, bound to a mutable view of the song so accepted lines accumulate. */
export function annotatorTools(state: { song: Song; targets: Set<string>; saved: Set<string> }, hooks: AnnotatorHooks): DynamicTool[] {
  return [
    {
      name: "submit_lines",
      description:
        "一次提交多行的完整标注（每行 zh / tokens / chunks / grammar / note）。App 用 kotone check 的同一套规则逐行校验：通过的行立即保存并显示给用户；没通过的行返回错误列表，把它们修正后再一次性提交。",
      inputSchema: { type: "object", properties: { lines: { type: "array", items: SUBMIT_SCHEMA, minItems: 1 } }, required: ["lines"] },
      async run(raw) {
        const entries = ((raw as { lines?: unknown[] })?.lines ?? []) as (Partial<Line> & { id?: string })[];
        if (!entries.length) return { ok: false, text: "lines 是空的" };
        const report: string[] = [];
        let accepted = 0;
        for (const a of entries) {
          const old = state.song.lines.find((l) => l.id === a.id);
          if (!old || !a.id) {
            report.push(`✗ 没有 id 为「${a.id}」的行`);
            continue;
          }
          if (!state.targets.has(a.id)) {
            report.push(`✗ ${a.id} 不在这次的任务里，不要提交它`);
            continue;
          }
          hooks.onEvent({ type: "submitted", lineId: a.id });
          const line: Line = { id: old.id, ...(old.time !== undefined ? { time: old.time } : {}), ja: old.ja };
          for (const k of ["zh", "tokens", "chunks", "grammar", "note"] as const) if (a[k] !== undefined && a[k] !== "") Object.assign(line, { [k]: a[k] });
          const issues = analyzeLine(line, state.song.customGrammar).issues;
          const errors = issues.filter((i) => i.level === "error").map(fmtIssue);
          if (!line.tokens?.length) errors.unshift("缺少 tokens");
          if (!line.zh?.trim()) errors.unshift("缺少 zh（你自己的中文翻译）");
          if (errors.length) {
            hooks.onEvent({ type: "rejected", lineId: a.id, errors });
            report.push(`✗ ${a.id} 没有通过，${errors.length} 个错误：\n${errors.map((e) => `  - ${e}`).join("\n")}`);
            continue;
          }
          const warnings = issues.filter((i) => i.level === "warning").map(fmtIssue);
          state.song = { ...state.song, lines: state.song.lines.map((l) => (l.id === a.id ? line : l)) };
          state.saved.add(a.id);
          accepted++;
          hooks.onEvent({ type: "saved", lineId: a.id, warnings });
          report.push(`✓ ${a.id} 已保存${warnings.length ? `（提醒：${warnings.join("；")}）` : ""}`);
        }
        if (accepted) await hooks.save(state.song);
        const failed = report.filter((r) => r.startsWith("✗")).length;
        return { ok: failed === 0, text: report.join("\n") + (failed ? `\n把 ${failed} 行没通过的修正后，用一次 submit_lines 重新提交。` : "") };
      },
    },
    {
      name: "conj",
      description: "按 lemma + class + steps 推导变形，返回每一步的形式、读音和规则。不确定 steps 时先用它验证。",
      inputSchema: {
        type: "object",
        properties: { lemma: str, reading: str, class: { type: "string", enum: Object.keys(CLASS_INFO) }, steps: { type: "array", items: { type: "string", enum: STEP_IDS } } },
        required: ["lemma", "class", "steps"],
      },
      run(raw) {
        const a = raw as { lemma: string; reading?: string; class: WordClass; steps: StepId[] };
        const d = derive({ text: a.lemma, reading: a.reading, class: a.class }, a.steps ?? []);
        const lines = d.steps.map((s) => `→ ${s.text}（${s.reading}） ${s.step}/${STEP_INFO[s.step].label}：${s.rule}`);
        return { ok: d.ok, text: [`${a.lemma}（${CLASS_INFO[a.class] ?? a.class}）`, ...lines, ...(d.ok ? [] : [`✗ ${d.error}`])].join("\n") };
      },
    },
    {
      name: "grammar_search",
      description: "按关键词（日语、中文或 id 片段）查语法大纲里的语法点 id。",
      inputSchema: { type: "object", properties: { query: str }, required: ["query"] },
      run(raw) {
        const q = String((raw as { query?: string })?.query ?? "");
        const hits = GRAMMAR.filter((g) => [g.id, g.title, g.zh, g.summary, g.pattern ?? ""].some((s) => s.includes(q))).slice(0, 15);
        return { ok: true, text: hits.length ? hits.map((g) => `${g.id}  ${g.level} ${g.title} — ${g.zh}`).join("\n") : `没有匹配「${q}」的语法点` };
      },
    },
  ];
}

export function developerInstructions(spec: string): string {
  return `你在 Kotone（帮中文母语者通过日语歌学日语的播放器）里为歌词逐行写学习用标注，读者是 N5–N4 水平的中文母语学习者。用户正在 App 里看着，每通过一行就会立刻显示出来。

本次会话的规则：
- 只用提供的工具：submit_lines 提交标注（App 当场逐行校验，通过的即保存；没通过的返回错误），conj 验证变形，grammar_search 查语法点 id。没有 shell、文件和网络。
- 规范里出现的 kotone CLI 命令在这里不可用：check 就是 submit_lines 的返回结果，conj / grammar 用同名工具。
- zh 必须是你自己的翻译：不得引用、改写或搜索任何歌词平台、网站上的现成译文。
- 不要修改 id、time、ja，只提交任务列表里的行；已经标注好的行可以作为风格参考。
- 速度要紧：把这一轮的所有行写好后，用**一次** submit_lines 全部提交；有没通过的，只把那几行修正后再一次性提交。只在真的拿不准时才用 conj / grammar_search。全部通过后用一句话收尾，不要在回复里复述歌词。

以下是完整的标注规范：

${spec}`;
}

function lyricSheet(song: Song): string {
  return song.lines.map((l) => `${l.id}  ${l.ja}${isAnnotated(l) && l.zh ? `  ｜已标注，译文：${l.zh}` : ""}`).join("\n");
}

const tokenBrief = (t: Token) =>
  [
    t.text + (t.reading ? `（${t.reading}）` : ""),
    POS_ZH[t.pos] ?? t.pos,
    t.lemma && t.lemma.text !== t.text ? `原形 ${t.lemma.text}` : "",
    t.steps?.length ? t.steps.join("+") : "",
    t.gloss ? `「${t.gloss}」` : "",
  ]
    .filter(Boolean)
    .join(" ");

/**
 * Lines in the batch that already have an annotation are ones the user asked to redo: they found
 * something wrong while listening. The old version is shown so the agent checks it word by word
 * rather than writing the same thing again.
 */
function redoNote(song: Song, batch: string[]): string {
  const old = batch.flatMap((id) => song.lines.filter((l) => l.id === id && isAnnotated(l)));
  if (!old.length) return "";
  const shown = old.map((l) => `${l.id}  ${l.ja}\n  旧译文：${l.zh ?? ""}\n  旧分词：${(l.tokens ?? []).map(tokenBrief).join(" / ")}`);
  return `\n\n其中 ${old.map((l) => l.id).join("、")} 已经有标注，但用户边听边看时发现不准确（可能是某个词的读音、词义、词性、原形或变形步骤，也可能是分段、语法点或译文）。请结合上下文逐词重新核对，写出一份新的完整标注：旧标注只作对照，不要照抄，拿不准的变形用 conj 验证。\n${shown.join("\n")}`;
}

export function firstPrompt(song: Song, batch: string[]): string {
  return `歌曲：《${song.title}》— ${song.artist}

全曲歌词（供理解上下文：跨行的主语、省略、倒装都要结合上下文判断；已标注的行附有译文，保持风格一致）：
${lyricSheet(song)}

这一轮请标注 ${batch.length} 行：${batch.join("、")}。写好后用一次 submit_lines 提交。${redoNote(song, batch)}`;
}

export const nextPrompt = (song: Song, batch: string[]) =>
  `继续，这一轮请标注 ${batch.length} 行：${batch.join("、")}。写好后用一次 submit_lines 提交。${redoNote(song, batch)}`;

/** Replaces Codex's coding-agent system prompt: this session only writes annotations. */
export const BASE_INSTRUCTIONS =
  "You are a Japanese-lyrics annotator inside the Kotone app. You only produce annotations through the provided tools. Follow the developer instructions exactly. Be concise.";

/**
 * Per-thread config: no web search, and none of the user's Codex extras (hooks run on every tool
 * call, plugins/memories/apps add context and startup time, shell tools are never wanted here).
 */
export const THREAD_CONFIG = {
  web_search: "disabled",
  features: Object.fromEntries(
    ["hooks", "plugins", "apps", "memories", "multi_agent", "browser_use", "computer_use", "image_generation", "shell_tool", "unified_exec", "skill_search", "tool_suggest", "goals"].map(
      (f) => [f, false],
    ),
  ),
};

export interface AnnotationRun {
  done: Promise<{ saved: string[]; remaining: string[] }>;
  stop(): void;
}

/** Annotate `targets` in a fresh ephemeral thread, a batch per turn, until done or stuck. */
export interface AnnotateOptions {
  spec: string;
  cwd?: string;
  /** Reasoning effort per turn; the user's global default (often xhigh) is far slower than needed */
  effort?: string;
  serviceTier?: string;
  /** Parallel Codex sessions pulling lines from one queue (wall-clock time divides, quota doesn't grow) */
  concurrency?: number;
  /** Lines per turn */
  batch?: number;
  /** Replace Codex's own system prompt and disable the user's extras (default true) */
  lean?: boolean;
}

/** Annotate `targets` with parallel ephemeral threads, a few lines per turn, until done or stuck. */
export function annotate(client: CodexClient, song: Song, targets: string[], hooks: AnnotatorHooks, opts: AnnotateOptions): AnnotationRun {
  const state = { song, targets: new Set(targets), saved: new Set<string>() };
  // sessions save concurrently: chain the writes and always write the newest song
  let writes = Promise.resolve();
  const save = () => (writes = writes.then(() => hooks.save(state.song)));
  const tools = annotatorTools(state, { ...hooks, save });
  client.provide(tools);
  const queue = [...targets];
  const turnsTried = new Map<string, number>();
  const skipped: string[] = [];
  const live = new Set<{ threadId: string; turnId: string }>();
  let stopped = false;
  let started = false;
  let failure: string | undefined;

  async function session() {
    let threadId: string | null = null;
    let first = true; // each thread gets the whole lyric sheet on its first turn
    while (!stopped && queue.length) {
      const batch = queue.splice(0, opts.batch ?? BATCH);
      try {
        if (!threadId) {
          const r = await client.request<{ thread: { id: string }; model: string }>("thread/start", {
            ephemeral: true,
            cwd: opts.cwd,
            sandbox: "read-only",
            approvalPolicy: "never",
            config: opts.lean === false ? { web_search: "disabled" } : THREAD_CONFIG,
            ...(opts.lean === false ? {} : { baseInstructions: BASE_INSTRUCTIONS }),
            developerInstructions: developerInstructions(opts.spec),
            dynamicTools: tools.map(({ name, description, inputSchema }) => ({ type: "function", name, description, inputSchema })),
          });
          threadId = r.thread.id;
          if (!started) hooks.onEvent({ type: "started", model: r.model });
          started = true;
        }
        hooks.onEvent({ type: "claimed", lineIds: batch });
        const finished = waitTurn(client, threadId, hooks);
        const { turn } = await client.request<{ turn: { id: string } }>("turn/start", {
          threadId,
          input: [{ type: "text", text: first ? firstPrompt(state.song, batch) : nextPrompt(state.song, batch), text_elements: [] }],
          ...(opts.effort ? { effort: opts.effort } : {}),
          ...(opts.serviceTier ? { serviceTier: opts.serviceTier } : {}),
        });
        first = false;
        const handle = { threadId, turnId: turn.id };
        live.add(handle);
        const result = await finished;
        live.delete(handle);
        if (result.status === "failed") throw new Error(result.error ?? "Codex 这一轮失败了");
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
        stopped = true; // the same failure (auth, quota, network) would hit every session
      }
      const unfinished = batch.filter((id) => !state.saved.has(id));
      if (unfinished.length) hooks.onEvent({ type: "released", lineIds: unfinished });
      for (const id of unfinished) {
        const n = (turnsTried.get(id) ?? 0) + 1;
        turnsTried.set(id, n);
        if (stopped || n < MAX_TURNS_PER_LINE) queue.push(id);
        else skipped.push(id);
      }
    }
  }

  const done = (async () => {
    const n = Math.max(1, Math.min(opts.concurrency ?? 1, Math.ceil(targets.length / (opts.batch ?? BATCH))));
    await Promise.all(Array.from({ length: n }, session));
    await writes;
    const remaining = targets.filter((id) => !state.saved.has(id));
    const out = { saved: targets.filter((id) => state.saved.has(id)), remaining };
    // a failure also sets `stopped` (to halt the other sessions); report only a user stop as stopped
    hooks.onEvent({ type: "finished", ...out, stopped: stopped && !failure, skipped, failure });
    return out;
  })();

  return {
    done,
    stop() {
      stopped = true;
      for (const t of live) void client.request("turn/interrupt", t).catch(() => {});
    },
  };
}

/** Resolves when the thread's turn completes; relays agent messages meanwhile. */
function waitTurn(client: CodexClient, threadId: string, hooks: AnnotatorHooks): Promise<{ status: string; error?: string }> {
  return new Promise((resolve) => {
    const off = client.on(({ method, params }) => {
      if (params.threadId !== threadId) return;
      if (method === "item/completed") {
        const item = params.item as { type: string; text?: string };
        if (item.type === "agentMessage" && item.text) hooks.onEvent({ type: "message", text: item.text });
      } else if (method === "turn/completed") {
        off();
        const turn = params.turn as { status: string; error: { message: string } | null };
        resolve({ status: turn.status, error: turn.error?.message });
      }
    });
  });
}
