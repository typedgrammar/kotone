// Cross-song indexes: grammar point → lyric examples, lemma → vocabulary entry.

import { analyzeLine, type LineAnalysis } from "./analyze.ts";
import type { Jlpt, Line, Pos, Song, WordClass } from "./types.ts";

const cache = new WeakMap<Line, LineAnalysis>();

export function analysisOf(song: Song, line: Line): LineAnalysis {
  let a = cache.get(line);
  if (!a) cache.set(line, (a = analyzeLine(line, song.customGrammar)));
  return a;
}

export interface LineRef {
  song: Song;
  line: Line;
}

export interface GrammarExample extends LineRef {
  start: number;
  end: number;
  note?: string;
  auto: boolean;
}

export type LineFilter = (song: Song, line: Line) => boolean;

export function indexGrammar(songs: Song[], filter: LineFilter = () => true): Map<string, GrammarExample[]> {
  const out = new Map<string, GrammarExample[]>();
  for (const song of songs)
    for (const line of song.lines) {
      if (!line.tokens?.length || !filter(song, line)) continue;
      for (const g of analysisOf(song, line).grammar) {
        const list = out.get(g.id) ?? [];
        // one example per line per point is enough for the outline
        if (!list.some((e) => e.line === line)) list.push({ song, line, start: g.start, end: g.end, note: g.note, auto: g.auto });
        out.set(g.id, list);
      }
    }
  return out;
}

export interface VocabExample extends LineRef {
  start: number;
  end: number;
  form: string;
}

export interface VocabEntry {
  key: string;
  text: string;
  reading?: string;
  pos: Pos;
  cls?: WordClass;
  jlpt?: Jlpt;
  glosses: string[];
  examples: VocabExample[];
}

const SKIP = new Set<Pos>(["particle", "aux", "copula", "symbol"]);

export function indexVocab(songs: Song[], filter: LineFilter = () => true): VocabEntry[] {
  const out = new Map<string, VocabEntry>();
  for (const song of songs)
    for (const line of song.lines) {
      if (!line.tokens?.length || !filter(song, line)) continue;
      for (const t of analysisOf(song, line).tokens) {
        const tok = t.token;
        if (SKIP.has(tok.pos)) continue;
        const text = tok.lemma?.text ?? tok.text;
        const reading = tok.lemma ? (tok.lemma.reading ?? tok.lemma.text) : tok.reading;
        const key = `${text}|${reading ?? ""}`;
        const e = out.get(key) ?? { key, text, reading, pos: tok.pos, cls: tok.lemma?.class, jlpt: tok.jlpt, glosses: [], examples: [] };
        if (tok.gloss && !e.glosses.includes(tok.gloss)) e.glosses.push(tok.gloss);
        e.jlpt ??= tok.jlpt;
        if (!e.examples.some((x) => x.line === line)) e.examples.push({ song, line, start: t.start, end: t.end, form: tok.text });
        out.set(key, e);
      }
    }
  return [...out.values()];
}
