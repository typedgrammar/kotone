// Kana / kanji character helpers shared by the conjugator, furigana aligner and checker.

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const KANA_ONLY = /^[ぁ-ゖゝゞァ-ヺーヽヾ]+$/;

export const isKanji = (ch: string): boolean => KANJI.test(ch);
export const hasKanji = (s: string): boolean => [...s].some(isKanji);
export const isKanaOnly = (s: string): boolean => KANA_ONLY.test(s);

/** Katakana → hiragana (ー and non-kana are kept as-is). */
export const toHiragana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export const stripSpaces = (s: string): string => s.replace(/[\s　]+/g, "");

/** The five vowel rows of each godan ending: 会う → 会わ/会い/会う/会え/会お. */
export const GODAN_ROWS: Record<string, { a: string; i: string; u: string; e: string; o: string }> = {
  う: { a: "わ", i: "い", u: "う", e: "え", o: "お" },
  く: { a: "か", i: "き", u: "く", e: "け", o: "こ" },
  ぐ: { a: "が", i: "ぎ", u: "ぐ", e: "げ", o: "ご" },
  す: { a: "さ", i: "し", u: "す", e: "せ", o: "そ" },
  つ: { a: "た", i: "ち", u: "つ", e: "て", o: "と" },
  ぬ: { a: "な", i: "に", u: "ぬ", e: "ね", o: "の" },
  ぶ: { a: "ば", i: "び", u: "ぶ", e: "べ", o: "ぼ" },
  む: { a: "ま", i: "み", u: "む", e: "め", o: "も" },
  る: { a: "ら", i: "り", u: "る", e: "れ", o: "ろ" },
};

const I_ROW = new Set("いきぎしじちぢにひびぴみりぃ");
const E_ROW = new Set("えけげせぜてでねへべぺめれぇ");

/** Whether a hiragana sits in the い段 or え段 — ichidan verbs always have one before る. */
export const isIOrERow = (ch: string): boolean => I_ROW.has(ch) || E_ROW.has(ch);
