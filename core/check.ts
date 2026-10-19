// `kotone check`: validates a whole song file. Line-level rules live in analyze.ts.

import { analyzeLine, isAnnotated, type Issue } from "./analyze.ts";
import { CATEGORIES } from "./grammar.ts";
import type { Song } from "./types.ts";

export interface CheckResult {
  issues: Issue[];
  errors: number;
  warnings: number;
  lines: number;
  annotated: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function checkSong(input: unknown): CheckResult {
  const issues: Issue[] = [];
  const err = (message: string, at?: string) => issues.push({ level: "error", at, message });
  const warn = (message: string, at?: string) => issues.push({ level: "warning", at, message });
  const done = (lines = 0, annotated = 0): CheckResult => ({
    issues,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    lines,
    annotated,
  });

  if (!isObj(input)) {
    err("文件内容应是一个 JSON 对象");
    return done();
  }
  const song = input as unknown as Song;
  if (song.version !== 1) err("version 应为 1");
  if (typeof song.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(song.id)) err("id 应为小写字母、数字和连字符（如 yoru-ni-kakeru）");
  if (typeof song.title !== "string" || !song.title) err("缺少 title");
  if (typeof song.artist !== "string" || !song.artist) err("缺少 artist");
  if (!Array.isArray(song.lines) || !song.lines.length) {
    err("lines 应是非空数组");
    return done();
  }

  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const [i, g] of (song.customGrammar ?? []).entries()) {
    const at = `customGrammar[${i}]`;
    if (!g.id || !g.title || !g.zh || !g.summary) err("自定义语法点需要 id / title / zh / summary", at);
    if (!cats.has(g.category)) err(`category 只能是：${[...cats].join(" / ")}`, at);
  }

  const ids = new Set<string>();
  let lastTime = -1;
  let annotated = 0;
  for (const [i, line] of song.lines.entries()) {
    const at = `lines[${i}]`;
    if (!isObj(line)) {
      err("每一行应是对象", at);
      continue;
    }
    if (typeof line.id !== "string" || !line.id) err("缺少 id", at);
    else if (ids.has(line.id)) err(`重复的行 id「${line.id}」`, at);
    else ids.add(line.id);
    if (typeof line.ja !== "string" || !line.ja.trim()) err("缺少 ja（日文原句）", at);
    if (line.time !== undefined) {
      if (typeof line.time !== "number" || line.time < 0) err("time 应为非负秒数", at);
      else {
        if (line.time < lastTime) warn(`time 比上一行还早（${line.time} < ${lastTime}）`, `${line.id}`);
        lastTime = line.time;
      }
    }
    if (isAnnotated(line)) annotated++;
    else if (!line.zh) continue;
    issues.push(...analyzeLine(line, song.customGrammar).issues);
  }
  return done(song.lines.length, annotated);
}
