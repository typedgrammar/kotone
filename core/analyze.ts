// Resolves a line's annotation into offsets the UI can paint (tokens, chunks ↔ zh fragments,
// grammar spans) and reports every inconsistency. The checker and the player share this code,
// so whatever `kotone check` accepts renders exactly the same in the app.

import { derive, type Derivation } from "./conjugate.ts";
import { alignRuby, rubyFor, type RubySeg } from "./furigana.ts";
import { grammarById, suggestGrammar } from "./grammar.ts";
import { hasKanji, isKanaOnly, stripSpaces, toHiragana } from "./kana.ts";
import type { Chunk, GrammarPoint, Line, Pos, Token } from "./types.ts";

export interface Issue {
  level: "error" | "warning";
  lineId?: string;
  /** Where in the line, e.g. tokens[1]「会った」 */
  at?: string;
  message: string;
}

export interface ResolvedToken {
  token: Token;
  index: number;
  /** UTF-16 offsets into line.ja; -1 when the token could not be aligned */
  start: number;
  end: number;
  /** Whitespace in line.ja right before this token */
  gap: string;
  ruby: RubySeg[];
  derivation?: Derivation;
}

export interface ResolvedChunk {
  chunk: Chunk;
  index: number;
  tokenStart: number;
  tokenEnd: number;
  start: number;
  end: number;
  /** Ranges into line.zh */
  zh: [number, number][];
}

export interface ResolvedGrammar {
  id: string;
  point?: GrammarPoint;
  start: number;
  end: number;
  note?: string;
  /** Derived from a token's conjugation steps rather than written by the annotator */
  auto: boolean;
}

export interface LineAnalysis {
  tokens: ResolvedToken[];
  chunks: ResolvedChunk[];
  grammar: ResolvedGrammar[];
  issues: Issue[];
}

export const POS_ZH: Record<Pos, string> = {
  noun: "名词",
  pronoun: "代词",
  "proper-noun": "专有名词",
  verb: "动词",
  "i-adj": "い形容词",
  "na-adj": "な形容词",
  adverb: "副词",
  adnominal: "连体词",
  particle: "助词",
  aux: "助动词",
  copula: "判断词",
  conjunction: "接续词",
  interjection: "感叹词",
  prefix: "前缀",
  suffix: "后缀",
  numeral: "数词",
  counter: "量词",
  expression: "惯用语",
  symbol: "符号",
};

const FUNCTION_POS = new Set<Pos>(["particle", "aux", "copula", "symbol"]);
const NEEDS_LEMMA = new Set<Pos>(["verb", "i-adj", "na-adj"]);
const JLPT = new Set(["N5", "N4", "N3", "N2", "N1"]);

export const isAnnotated = (line: Line): boolean => !!line.tokens?.length;

/** Find the nth (1-based) occurrence of `needle` in `hay` that avoids `taken` ranges. */
function findFree(hay: string, needle: string, taken: [number, number][], nth = 1): number {
  let from = 0;
  let seen = 0;
  while (needle) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return -1;
    const j = i + needle.length;
    if (!taken.some(([a, b]) => i < b && a < j) && ++seen === nth) return i;
    from = i + 1;
  }
  return -1;
}

export function analyzeLine(line: Line, customGrammar: GrammarPoint[] = []): LineAnalysis {
  const issues: Issue[] = [];
  const err = (message: string, at?: string) => issues.push({ level: "error", lineId: line.id, at, message });
  const warn = (message: string, at?: string) => issues.push({ level: "warning", lineId: line.id, at, message });
  const ja = line.ja ?? "";
  const zh = line.zh ?? "";

  // ---- tokens -------------------------------------------------------------------------
  const tokens: ResolvedToken[] = [];
  let pos = 0;
  let aligned = true;
  (line.tokens ?? []).forEach((token, index) => {
    const at = `tokens[${index}]「${token.text ?? ""}」`;
    const text = token.text ?? "";
    let gap = "";
    while (pos < ja.length && /[\s　]/.test(ja[pos])) gap += ja[pos++];
    let start = -1;
    if (!text || /[\s　]/.test(text)) err("text 不能为空，也不能包含空格（空格保留在 ja 里即可）", at);
    else if (aligned && ja.startsWith(text, pos)) start = pos;
    else if (aligned) {
      aligned = false;
      err(`和原句对不上：原句这里是「${ja.slice(pos, pos + Math.max(text.length, 4))}」`, at);
    }
    if (start >= 0) pos = start + text.length;

    if (!(token.pos in POS_ZH)) err(`未知的 pos「${token.pos}」，可选：${Object.keys(POS_ZH).join(" / ")}`, at);

    // reading & furigana
    const reading = token.reading;
    if (hasKanji(text) && !reading && !token.ruby) err("含汉字的词需要 reading（平假名）", at);
    if (reading !== undefined && !isKanaOnly(reading)) err(`reading「${reading}」只能是假名`, at);
    if (reading && !hasKanji(text) && toHiragana(reading) !== toHiragana(text))
      err("纯假名词的 reading 应与原文一致（发音上的差异写进 note）", at);
    if (token.ruby) {
      const t = token.ruby.map(([s]) => s).join("");
      const r = token.ruby.map(([s, rr]) => rr ?? s).join("");
      if (t !== text) err(`ruby 拼起来是「${t}」，应等于 text「${text}」`, at);
      if (reading && toHiragana(r) !== toHiragana(reading)) err(`ruby 读音拼起来是「${r}」，应等于 reading「${reading}」`, at);
    } else if (reading && hasKanji(text) && isKanaOnly(reading) && !alignRuby(text, reading)) {
      err(`读音「${reading}」和「${text}」里的假名对不上`, at);
    }

    // lemma & conjugation
    let derivation: Derivation | undefined;
    if (NEEDS_LEMMA.has(token.pos) && !token.lemma) err(`${POS_ZH[token.pos]}需要 lemma（辞书形 + class）`, at);
    if (token.steps?.length && !token.lemma) err("写了 steps 就必须写 lemma", at);
    if (token.lemma) {
      derivation = derive(token.lemma, token.steps ?? []);
      const chain = `${token.lemma.text}(${token.lemma.class})${(token.steps ?? []).map((s) => ` +${s}`).join("")}`;
      if (!derivation.ok) err(`${chain}：${derivation.error}`, at);
      else {
        const want = toHiragana(reading ?? text);
        if (derivation.text !== text || derivation.reading !== want)
          err(`${chain} 推导出「${derivation.text}／${derivation.reading}」，但 token 写的是「${text}／${want}」`, at);
      }
    }

    if (!token.gloss && !FUNCTION_POS.has(token.pos)) warn("缺少 gloss（这个词在本句里的中文意思）", at);
    if (token.jlpt && !JLPT.has(token.jlpt)) err(`jlpt 只能是 N5–N1`, at);

    tokens.push({
      token,
      index,
      start,
      end: start < 0 ? -1 : start + text.length,
      gap,
      ruby: rubyFor(text, reading, token.ruby),
      derivation,
    });
  });
  if (tokens.length && aligned && stripSpaces(ja.slice(pos))) err(`tokens 没有覆盖整句，还剩「${ja.slice(pos).trim()}」`);

  // ---- chunks ------------------------------------------------------------------------
  const chunks: ResolvedChunk[] = [];
  const zhTaken: [number, number][] = [];
  let cursor = 0;
  (line.chunks ?? []).forEach((chunk, index) => {
    const at = `chunks[${index}]「${chunk.ja ?? ""}」`;
    if (!chunk.role) err("chunk 需要 role（句子成分）", at);
    const want = stripSpaces(chunk.ja ?? "");
    let found: [number, number] | null = null;
    for (let i = cursor; i < tokens.length && !found; i++) {
      let acc = "";
      for (let j = i; j < tokens.length && acc.length < want.length; j++) {
        acc += tokens[j].token.text;
        if (acc === want) found = [i, j + 1];
      }
    }
    if (!found) {
      if (tokens.length) err("不是连续的 token 组合（chunks 必须按顺序、互不重叠，并且边界落在 token 边界上）", at);
      return;
    }
    cursor = found[1];
    const ranges: [number, number][] = [];
    const frags = chunk.zh === undefined ? [] : Array.isArray(chunk.zh) ? chunk.zh : [chunk.zh];
    for (const frag of frags) {
      const i = findFree(zh, frag, zhTaken);
      if (i < 0) {
        err(`zh 片段「${frag}」在译文「${zh}」里找不到（必须是译文的原样子串，且不与其他 chunk 重复占用）`, at);
        continue;
      }
      zhTaken.push([i, i + frag.length]);
      ranges.push([i, i + frag.length]);
    }
    const first = tokens[found[0]];
    const last = tokens[found[1] - 1];
    chunks.push({ chunk, index, tokenStart: found[0], tokenEnd: found[1], start: first.start, end: last.end, zh: ranges });
  });

  // ---- grammar -----------------------------------------------------------------------
  const grammar: ResolvedGrammar[] = [];
  const boundaries = new Set(tokens.flatMap((t) => [t.start, t.end]));
  (line.grammar ?? []).forEach((ref, index) => {
    const at = `grammar[${index}] ${ref.id}`;
    const point = grammarById(ref.id, customGrammar);
    if (!point) {
      const s = suggestGrammar(ref.id, customGrammar);
      err(`未知的语法点 id${s.length ? `，是不是：${s.join(" / ")}` : "（用 `kotone grammar` 查看全部，或在 customGrammar 里自定义）"}`, at);
    }
    const start = findFree(ja, ref.ja ?? "", [], ref.nth ?? 1);
    if (start < 0) {
      err(`ja「${ref.ja}」在原句里找不到${ref.nth ? `第 ${ref.nth} 处` : ""}`, at);
      return;
    }
    const end = start + ref.ja.length;
    if (tokens.length && (!boundaries.has(start) || !boundaries.has(end)))
      warn(`「${ref.ja}」的边界没有落在 token 边界上`, at);
    grammar.push({ id: ref.id, point, start, end, note: ref.note, auto: false });
  });
  for (const t of tokens) {
    if (!t.derivation?.ok || t.start < 0) continue;
    for (const s of t.derivation.steps)
      for (const id of s.grammar) {
        const dup = grammar.some((g) => g.id === id && g.start <= t.start && t.end <= g.end);
        if (!dup) grammar.push({ id, point: grammarById(id, customGrammar), start: t.start, end: t.end, note: s.rule, auto: true });
      }
  }
  grammar.sort((a, b) => a.start - b.start || b.end - a.end);

  // ---- line-level advice -------------------------------------------------------------
  if (tokens.length) {
    if (!zh) warn("缺少 zh（中文翻译）");
    if (!line.chunks?.length) warn("缺少 chunks（句子成分和中文对应）");
  }
  return { tokens, chunks, grammar, issues };
}
