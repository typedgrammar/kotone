#!/usr/bin/env node
// kotone — CLI for agents (and humans) preparing annotated lyrics for the Kotone player.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeLine, isAnnotated, type Issue } from "../core/analyze.ts";
import { checkSong } from "../core/check.ts";
import { specText } from "../core/spec.ts";
import { libraryHome } from "./home.ts";
import { CLASS_INFO, conjugationTable, derive, STEP_IDS, STEP_INFO } from "../core/conjugate.ts";
import { alignRuby } from "../core/furigana.ts";
import { CATEGORIES, GRAMMAR, grammarById } from "../core/grammar.ts";
import { lyricKey, parseLyrics, skeletonLines, type LrcLine } from "../core/lrc.ts";
import { fetchHttp, fetchLyrics, parseRef, refOf, searchLyrics, sourceName, sourceNote, SOURCES, toLrc, type SourceId } from "../core/lyrics/index.ts";
import type { Line, Song, StepId, WordClass } from "../core/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = libraryHome();
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = c(31);
const yellow = c(33);
const green = c(32);
const dim = c(2);
const bold = c(1);

class UsageError extends Error {}

// ---- tiny arg parser: positionals + --flag value / --bool ----------------------------------

type Args = { _: string[]; [k: string]: string | boolean | string[] };
const BOOL = new Set(["json", "strict", "force", "write", "copy-audio", "help"]);

function parse(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") out.help = true;
    else if (a === "-o") out.out = argv[++i];
    else if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out[k] = v;
      else if (BOOL.has(k)) out[k] = true;
      else if (k === "reuse") out.reuse = [...((out.reuse as string[]) ?? []), argv[++i]];
      else out[k] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const str = (a: Args, k: string): string | undefined => (typeof a[k] === "string" ? (a[k] as string) : undefined);

function readSong(file: string): Song {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new UsageError(`无法读取 ${file}: ${(e as Error).message}`);
  }
}

/** A song.json path, or the id of a song already in the library. */
function songFile(arg: string): string {
  if (fs.existsSync(arg) || !/^[a-z0-9][a-z0-9-]*$/.test(arg)) return arg;
  const lib = path.join(HOME, "songs", arg, "song.json");
  return fs.existsSync(lib) ? lib : arg;
}

const writeJson = (file: string, data: unknown) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

const fmtTime = (t?: number) =>
  t === undefined ? "  --:--" : `${String(Math.floor(t / 60)).padStart(3)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

// ---- commands -------------------------------------------------------------------------

function cmdSpec() {
  console.log(specText(fs.readFileSync(path.join(ROOT, "docs", "annotation-guide.md"), "utf8")));
}

async function cmdInit(a: Args) {
  const [file] = a._;
  if (!file)
    throw new UsageError("用法：kotone init <lyrics.lrc|.txt|歌词引用> --id <slug> --title <标题> --artist <歌手> [-o out.json] [--reuse old.json]");
  let src: { lines: LrcLine[]; title?: string; artist?: string; source?: string };
  if (parseRef(file)) {
    const f = await fetchLyrics(fetchHttp, file);
    src = { lines: f.lines, title: f.title, artist: f.artist, source: sourceNote(f) };
  } else {
    const parsed = parseLyrics(fs.readFileSync(file, "utf8"));
    src = { lines: parsed.lines, title: parsed.meta.ti, artist: parsed.meta.ar };
  }
  const title = str(a, "title") ?? src.title;
  const artist = str(a, "artist") ?? src.artist;
  const id = str(a, "id");
  if (!id || !title || !artist) throw new UsageError("需要 --id、--title、--artist（LRC 里有 [ti:] [ar:]、或从歌词引用下载时可省略 title/artist）");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new UsageError("--id 只能用小写字母、数字和连字符");

  const reuse = ((a.reuse as string[]) ?? []).flatMap((f) => readSong(songFile(f)).lines);
  const { lines, reused } = skeletonLines(src.lines, reuse);
  const song: Song = {
    version: 1,
    id,
    title,
    ...(str(a, "title-reading") ? { titleReading: str(a, "title-reading") } : {}),
    artist,
    ...(src.source ? { source: src.source } : {}),
    lines,
  };
  const out = str(a, "out") ?? `${id}.song.json`;
  if (fs.existsSync(out) && !a.force) throw new UsageError(`${out} 已存在（加 --force 覆盖）`);
  writeJson(out, song);
  console.log(
    `${green("✓")} ${out}：${lines.length} 行${lines[0]?.time !== undefined ? "（带时间轴）" : "（无时间轴）"}${reused ? `，复用了 ${reused} 行已有标注` : ""}`,
  );
  console.log(dim(`下一步：kotone spec 了解标注格式，逐行补全后运行 kotone check ${out}`));
}

function printIssues(file: string, issues: Issue[]) {
  for (const i of issues) {
    const mark = i.level === "error" ? red("✗") : yellow("⚠");
    const where = [i.lineId, i.at].filter(Boolean).join(" ");
    console.log(`  ${mark} ${where ? bold(where) + " " : ""}${i.message}`);
  }
}

function cmdCheck(a: Args) {
  if (!a._.length) throw new UsageError("用法：kotone check <song.json...> [--json] [--strict]");
  let failed = false;
  const reports = [];
  for (const file of a._.map(songFile)) {
    const r = checkSong(readSong(file));
    const bad = r.errors > 0 || (!!a.strict && r.warnings > 0);
    failed ||= bad;
    if (a.json) {
      reports.push({ file, ...r });
      continue;
    }
    console.log(`${bad ? red("✗") : green("✓")} ${bold(file)}  ${r.annotated}/${r.lines} 行已标注 · ${r.errors} 错误 · ${r.warnings} 提醒`);
    printIssues(file, r.issues);
  }
  if (a.json) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  process.exitCode = failed ? 1 : 0;
}

function cmdStatus(a: Args) {
  const file = a._[0] && songFile(a._[0]);
  if (!file) throw new UsageError("用法：kotone status <song.json|资料库 id>");
  const song = readSong(file);
  const r = checkSong(song);
  console.log(`${bold(song.title)} — ${song.artist}  ${r.annotated}/${r.lines} 行已标注 · ${r.errors} 错误 · ${r.warnings} 提醒`);
  for (const line of song.lines ?? []) {
    const n = r.issues.filter((i) => i.lineId === line.id && i.level === "error").length;
    const state = !isAnnotated(line) ? yellow("待标注") : n ? red(`${n} 错误`) : green("✓");
    console.log(`  ${line.id.padEnd(4)} ${dim(fmtTime(line.time))}  ${state.padEnd(tty ? 12 : 4)}  ${line.ja}`);
  }
}

function cmdGrammar(a: Args) {
  const q = a._[0];
  const exact = q ? grammarById(q) : undefined;
  if (exact) {
    if (a.json) return console.log(JSON.stringify(exact, null, 2));
    console.log(`${bold(exact.id)}  ${exact.level}  ${exact.title} — ${exact.zh}`);
    if (exact.pattern) console.log(`  接续：${exact.pattern}`);
    console.log(`  ${exact.summary}`);
    if (exact.example) console.log(dim(`  例：${exact.example.ja} ／ ${exact.example.zh}`));
    return;
  }
  const hits = GRAMMAR.filter((g) => !q || [g.id, g.title, g.zh, g.summary, g.pattern ?? ""].some((s) => s.includes(q)));
  if (a.json) return console.log(JSON.stringify(hits, null, 2));
  for (const cat of CATEGORIES) {
    const list = hits.filter((g) => g.category === cat.id);
    if (!list.length) continue;
    console.log(bold(`${cat.zh} (${cat.id})`));
    for (const g of list) console.log(`  ${g.id.padEnd(24)} ${dim(g.level)}  ${g.title} — ${g.zh}`);
  }
  if (!hits.length) console.log(`没有匹配「${q}」的语法点`);
}

function cmdConj(a: Args) {
  const [lemmaArg, cls, ...steps] = a._;
  if (!lemmaArg || !cls) throw new UsageError("用法：kotone conj <辞书形[:读音]> <class> [steps...]   例：kotone conj 奪う:うばう godan Passive Ta");
  if (!(cls in CLASS_INFO)) throw new UsageError(`class 只能是：${Object.keys(CLASS_INFO).join(" / ")}`);
  const [text, reading] = lemmaArg.split(/[:／/]/);
  const lemma = { text, reading, class: cls as WordClass };
  if (!steps.length) {
    for (const row of conjugationTable(lemma)) console.log(`  ${row.step.padEnd(16)} ${row.text}  ${dim(row.reading)}`);
    return;
  }
  const d = derive(lemma, steps as StepId[]);
  if (a.json) return console.log(JSON.stringify(d, null, 2));
  console.log(`  ${text}${reading ? dim(`（${reading}）`) : ""} ${dim(CLASS_INFO[lemma.class])}`);
  for (const s of d.steps) console.log(`  → ${bold(s.text)} ${dim(s.reading)}  ${s.step}: ${s.rule}`);
  if (!d.ok) {
    console.log(red(`  ✗ ${d.error}`));
    process.exitCode = 1;
  }
}

function cmdRuby(a: Args) {
  const [text, reading] = a._;
  if (!text || !reading) throw new UsageError("用法：kotone ruby <文字> <读音>");
  const segs = alignRuby(text, reading);
  if (!segs) {
    console.log(red(`✗ 「${reading}」和「${text}」中的假名对不上（若是熟字训/当て字，用 token.ruby 手动指定）`));
    process.exitCode = 1;
    return;
  }
  console.log(segs.map((s) => (s.ruby ? `${s.text}(${s.ruby})` : s.text)).join(""));
}

function cmdTimes(a: Args) {
  const [arg, lrc] = a._;
  if (!arg || !lrc) throw new UsageError("用法：kotone times <song.json|资料库 id> <lyrics.lrc> [--write]");
  const file = songFile(arg);
  const song = readSong(file);
  const timed = parseLyrics(fs.readFileSync(lrc, "utf8")).lines.filter((l) => l.time !== undefined);
  let from = 0;
  let hit = 0;
  for (const line of song.lines) {
    const key = lyricKey(line.ja);
    let j = timed.findIndex((l, i) => i >= from && lyricKey(l.text) === key);
    if (j < 0) j = timed.findIndex((l) => lyricKey(l.text) === key);
    if (j < 0) {
      console.log(`  ${yellow("?")} ${line.id} ${line.ja}`);
      continue;
    }
    line.time = timed[j].time;
    from = j + 1;
    hit++;
    console.log(`  ${green("✓")} ${line.id} ${dim(fmtTime(line.time))} ${line.ja}`);
  }
  if (a.write) writeJson(file, song);
  console.log(`${hit}/${song.lines.length} 行对上了时间轴${a.write ? `，已写入 ${file}` : "（预览；加 --write 写入）"}`);
}

function cmdAdd(a: Args) {
  const [file] = a._;
  if (!file) throw new UsageError("用法：kotone add <song.json> [--audio <音频文件>] [--copy-audio] [--force]");
  const song = readSong(file);
  const r = checkSong(song);
  if (r.errors && !a.force) {
    printIssues(file, r.issues.filter((i) => i.level === "error"));
    throw new UsageError(`${file} 还有 ${r.errors} 个错误，先修好（或 --force 强制导入）`);
  }
  const dir = path.join(HOME, "songs", song.id);
  fs.mkdirSync(dir, { recursive: true });
  const audio = str(a, "audio");
  if (audio) {
    if (!fs.existsSync(audio)) throw new UsageError(`找不到音频 ${audio}`);
    if (a["copy-audio"]) {
      const name = `audio${path.extname(audio)}`;
      fs.copyFileSync(audio, path.join(dir, name));
      song.audio = name;
    } else song.audio = path.resolve(audio);
  } else if (song.audio && !path.isAbsolute(song.audio)) {
    // keep a relative audio path working after the move
    song.audio = path.resolve(path.dirname(file), song.audio);
  }
  writeJson(path.join(dir, "song.json"), song);
  console.log(`${green("✓")} 已导入 ${bold(song.title)} → ${dir}${song.audio ? `\n  音频：${song.audio}` : ""}`);
  console.log(dim("切回 Kotone 窗口即可看到（窗口获得焦点时会刷新资料库）"));
}

function cmdLibrary() {
  const dir = path.join(HOME, "songs");
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "song.json"))) : [];
  console.log(dim(dir));
  if (!ids.length) console.log("  （空）用 kotone add <song.json> 导入");
  for (const id of ids) {
    const song = readSong(path.join(dir, id, "song.json"));
    const done = song.lines.filter(isAnnotated).length;
    console.log(`  ${id.padEnd(24)} ${song.title} — ${song.artist}  ${dim(`${done}/${song.lines.length} 行`)}${song.audio ? "" : dim(" · 无音频")}`);
  }
}

const fmtDur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

async function cmdLyrics(a: Args) {
  const q = a._.join(" ").trim();
  if (!q)
    throw new UsageError(
      "用法：kotone lyrics <关键词> [--source netease,qq,kugou,lrclib] [--limit 8] [--json]\n      kotone lyrics <歌词引用> [-o out.lrc] [--json]",
    );
  if (parseRef(q)) {
    const f = await fetchLyrics(fetchHttp, q);
    if (a.json) return console.log(JSON.stringify(f, null, 2));
    const summary = `${f.title ?? "?"} — ${f.artist ?? "?"}  ${f.lines.length} 行 · ${f.synced ? "带时间轴" : "无时间轴"}`;
    const out = str(a, "out");
    if (!out) {
      process.stdout.write(toLrc(f));
      return console.error(dim(summary));
    }
    fs.writeFileSync(out, toLrc(f));
    console.log(`${green("✓")} ${out}：${summary}`);
    console.log(dim(`下一步：kotone init ${out} --id <slug>`));
    return;
  }
  const ids = SOURCES.map((s) => s.id);
  const sources = str(a, "source")?.split(",") as SourceId[] | undefined;
  const bad = sources?.find((s) => !ids.includes(s));
  if (bad) throw new UsageError(`--source 只能是：${ids.join(" / ")}`);
  const { hits, failed } = await searchLyrics(fetchHttp, q, { sources, limit: Number(str(a, "limit") ?? 8) });
  if (a.json) return console.log(JSON.stringify({ hits: hits.map((h) => ({ ref: refOf(h), ...h })), failed }, null, 2));
  const width = Math.max(0, ...hits.map((h) => refOf(h).length)) + 2;
  for (const s of SOURCES) {
    const list = hits.filter((h) => h.source === s.id);
    const err = failed.find((f) => f.source === s.id);
    if (!list.length && !err) continue;
    console.log(bold(s.zh));
    if (err) console.log(`  ${yellow("⚠")} ${err.error}`);
    for (const h of list) console.log(`  ${refOf(h).padEnd(width)}${h.title} — ${h.artist}  ${dim([h.album, fmtDur(h.duration)].filter(Boolean).join(" · "))}`);
  }
  if (!hits.length) return void (process.exitCode = 1);
  console.log(dim("下一步：kotone init <引用> --id <slug> 直接生成骨架，或 kotone lyrics <引用> -o 歌词.lrc 先看看"));
}

function cmdPrompt(a: Args) {
  const file = a._[0] && songFile(a._[0]);
  if (!file) throw new UsageError("用法：kotone prompt <song.json|资料库 id>");
  const song = readSong(file);
  const abs = path.resolve(file);
  const pending = song.lines.filter((l) => !isAnnotated(l) || analyzeLine(l, song.customGrammar).issues.some((i) => i.level === "error"));
  // `kotone` when installed as a bin (pnpm link), otherwise the absolute script path
  const cli = path.basename(process.argv[1]) === "kotone" ? "kotone" : `node ${path.join(ROOT, "cli", "kotone.ts")}`;
  console.log(`你要为日语歌曲《${song.title}》（${song.artist}）准备学习用的歌词标注，读者是母语为中文、日语 N5–N4 水平的学习者。

1. 先运行 \`${cli} spec\` 读完标注规范（格式、分词粒度、变形 steps、语法点 id、讲解写法）。
2. 编辑 ${abs}，为下面 ${pending.length} 行补全 zh / tokens / chunks / grammar / note（已经通过检查的行不要改动）：
${pending.map((l) => `   - ${l.id}  ${l.ja}`).join("\n")}
3. 每标完几行就运行 \`${cli} check ${abs}\`，按报错修正，直到 0 错误；提醒（⚠）也尽量处理。
   不确定变形时用 \`${cli} conj <辞书形:读音> <class> <steps...>\` 验证，找语法点 id 用 \`${cli} grammar <关键词>\`。
4. 全部通过后运行 \`${cli} add ${abs}\` 导入播放器。`);
}

const HELP = `kotone — 为 Kotone 播放器准备日语歌词标注

  kotone spec                         打印给 agent 的标注规范（含 steps 与语法点 id 附录）
  kotone lyrics <关键词> [--source …] [--json]
                                       在网易云 / QQ音乐 / 酷狗 / LRCLIB 搜索歌词，列出引用
  kotone lyrics <引用> [-o out.lrc]    下载原文歌词（如 netease:1409311773），不含任何平台译文
  kotone init <lrc|txt|引用> --id [--title --artist] [-o out] [--reuse old.json]
                                       从歌词生成待标注骨架（带时间轴；zh 一律留空，由 agent 翻译）
  kotone check <song.json...> [--json] [--strict]
                                       校验：分词还原原句、读音与假名一致、变形可推导、
                                       chunk 对应的中文片段存在、语法点 id 有效
  kotone status <song.json|id>        每行的标注进度（id 指资料库里的歌）
  kotone prompt <song.json|id>        生成交给外部 agent 的任务说明
  kotone grammar [关键词|id] [--json]   查语法大纲
  kotone conj <辞书形[:读音]> <class> [steps...]
                                       推导变形（不给 steps 则列出所有单步变形）
  kotone ruby <文字> <读音>            预览注音切分
  kotone times <song.json|id> <lrc> [--write]
                                       按歌词文本把 LRC 时间轴合并进标注
  kotone add <song.json> [--audio file] [--copy-audio]
                                       导入播放器资料库（${HOME.replace(os.homedir(), "~")}）
  kotone library                      列出资料库中的歌曲`;

const COMMANDS: Record<string, (a: Args) => void | Promise<void>> = {
  spec: cmdSpec,
  lyrics: cmdLyrics,
  init: cmdInit,
  check: cmdCheck,
  status: cmdStatus,
  prompt: cmdPrompt,
  grammar: cmdGrammar,
  conj: cmdConj,
  ruby: cmdRuby,
  times: cmdTimes,
  add: cmdAdd,
  library: cmdLibrary,
};

/**
 * Node's fetch only honours https_proxy when NODE_USE_ENV_PROXY is set at startup, so commands
 * that go online re-run themselves with it (like curl, a configured proxy just works).
 */
function respawnForProxy(): boolean {
  const env = process.env;
  if (env.NODE_USE_ENV_PROXY || !(env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY)) return false;
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...env, NODE_USE_ENV_PROXY: "1" } });
  process.exitCode = r.status ?? 1;
  return true;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parse(rest);
const online = cmd === "lyrics" || (cmd === "init" && !!parseRef(args._[0] ?? ""));
try {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || !COMMANDS[cmd]) {
    console.log(HELP);
    if (cmd && !COMMANDS[cmd] && cmd !== "help" && cmd !== "--help" && cmd !== "-h") process.exitCode = 1;
  } else if (!(online && respawnForProxy())) await COMMANDS[cmd](args);
} catch (e) {
  if (!(e instanceof UsageError) && !online) throw e;
  console.error(red((e as Error).message));
  process.exitCode = 2;
}
