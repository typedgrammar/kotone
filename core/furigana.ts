// Split a token's reading over its kanji runs: 初めて/はじめて → 初(はじ) めて.
// Kana in the surface must match the reading, which doubles as a reading sanity check.

import { hasKanji, isKanji, toHiragana } from "./kana.ts";

export interface RubySeg {
  text: string;
  ruby?: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Returns null when the reading cannot be aligned with the kana in `text`. */
export function alignRuby(text: string, reading: string): RubySeg[] | null {
  if (!hasKanji(text)) return [{ text }];
  const groups: { text: string; kanji: boolean }[] = [];
  for (const ch of text) {
    const k = isKanji(ch);
    const last = groups.at(-1);
    if (last && last.kanji === k) last.text += ch;
    else groups.push({ text: ch, kanji: k });
  }
  const pattern = groups.map((g) => (g.kanji ? "(.+?)" : escape(toHiragana(g.text)))).join("");
  const m = new RegExp(`^${pattern}$`).exec(toHiragana(reading));
  if (!m) return null;
  let i = 1;
  return groups.map((g) => (g.kanji ? { text: g.text, ruby: m[i++] } : { text: g.text }));
}

/** Ruby segments for display: manual override → aligned → whole-word fallback. */
export function rubyFor(text: string, reading?: string, manual?: [string, string?][]): RubySeg[] {
  if (manual?.length) return manual.map(([t, r]) => (r ? { text: t, ruby: r } : { text: t }));
  if (!reading || !hasKanji(text)) return [{ text }];
  return alignRuby(text, reading) ?? [{ text, ruby: reading }];
}
