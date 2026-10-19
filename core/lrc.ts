// LRC / plain-text lyric parsing for `kotone init`, `kotone times` and lyric downloads.

import { isAnnotated } from "./analyze.ts";
import type { Line } from "./types.ts";

/** Original lyric text only: translations never enter a song from outside (the agent writes every `zh`). */
export interface LrcLine {
  time?: number;
  text: string;
}

export interface ParsedLyrics {
  meta: Record<string, string>;
  lines: LrcLine[];
}

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;

/** Han characters and no kana: a Chinese translation line, not the Japanese original. */
export const looksChinese = (s: string): boolean => HAN.test(s) && !KANA.test(s);
const looksRomaji = (s: string) => /[a-z]/i.test(s) && /^[\p{Script=Latin}\p{P}\p{Zs}\d]+$/u.test(s);

export function parseLyrics(src: string): ParsedLyrics {
  const meta: Record<string, string> = {};
  const lines: LrcLine[] = [];
  for (const raw of src.replace(/^﻿/, "").split(/\r?\n/)) {
    const tag = /^\[([a-z]+):(.*)\]\s*$/i.exec(raw.trim());
    if (tag && !/^\d+$/.test(tag[1])) {
      meta[tag[1].toLowerCase()] = tag[2].trim();
      continue;
    }
    const times: number[] = [];
    const text = raw
      .replace(STAMP, (_, m, s, f = "0") => {
        times.push(Number(m) * 60 + Number(s) + Number(f.padEnd(3, "0")) / 1000);
        return "";
      })
      .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "") // enhanced LRC word stamps
      .trim();
    if (!text) continue;
    if (times.length) for (const time of times) lines.push({ time, text });
    else lines.push({ text });
  }
  if (!lines.length || !lines.every((l) => l.time !== undefined)) return { meta, lines };
  lines.sort((a, b) => a.time! - b.time!); // stable: lines sharing a stamp keep their file order
  return { meta, lines: dropTranslations(lines) };
}

/**
 * Bilingual LRC (as LDDC and most players export it) stamps a translation or romanization line
 * like the line before it. Those lines are discarded, not kept: translations come from the agent.
 */
function dropTranslations(lines: LrcLine[]): LrcLine[] {
  const out: LrcLine[] = [];
  for (const l of lines) {
    const prev = out.at(-1);
    const sameStamp = prev && Math.abs(prev.time! - l.time!) < 0.001;
    if (sameStamp && ((looksChinese(l.text) && !looksChinese(prev.text)) || (looksRomaji(l.text) && KANA.test(prev.text)))) continue;
    out.push(l);
  }
  return out;
}

/** Normalized form used to match lyric lines across sources. */
export const lyricKey = (s: string): string =>
  s.normalize("NFKC").replace(/[\s「」『』（）()、。,.!?！？…・〜~]/g, "");

/**
 * Song lines for a lyric file: ids, times and the text, nothing else. Lines whose text matches an
 * annotated line in `reuse` take that (agent-written) annotation, its `zh` included.
 */
export function skeletonLines(src: LrcLine[], reuse: Line[] = []): { lines: Line[]; reused: number } {
  const known = new Map<string, Line>();
  for (const line of reuse) if (isAnnotated(line)) known.set(lyricKey(line.ja), line);
  const width = Math.max(2, String(src.length).length);
  let reused = 0;
  const lines = src.map((l, i): Line => {
    const line: Line = { id: `L${String(i + 1).padStart(width, "0")}`, ...(l.time !== undefined ? { time: l.time } : {}), ja: l.text };
    const old = known.get(lyricKey(l.text));
    if (old) {
      reused++;
      const { id: _id, time: _t, ja: _ja, ...annotation } = old;
      return Object.assign(line, annotation);
    }
    return line;
  });
  return { lines, reused };
}
