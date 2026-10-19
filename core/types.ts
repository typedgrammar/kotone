// The song annotation IR. An external agent writes this JSON (see docs/annotation-guide.md),
// `kotone check` verifies it, and the player renders it.

export type Pos =
  | "noun"
  | "pronoun"
  | "proper-noun"
  | "verb"
  | "i-adj"
  | "na-adj"
  | "adverb"
  | "adnominal"
  | "particle"
  | "aux"
  | "copula"
  | "conjunction"
  | "interjection"
  | "prefix"
  | "suffix"
  | "numeral"
  | "counter"
  | "expression"
  | "symbol";

export type WordClass = "godan" | "ichidan" | "suru" | "kuru" | "i-adj" | "na-adj" | "copula";

export type StepId =
  | "MasuStem"
  | "Masu"
  | "Te"
  | "Ta"
  | "Nai"
  | "Naide"
  | "Zu"
  | "Potential"
  | "PotentialRanuki"
  | "Passive"
  | "Causative"
  | "Volitional"
  | "Imperative"
  | "Ba"
  | "Tara"
  | "Tari"
  | "Tai"
  | "Nagara"
  | "Sou"
  | "TeIru"
  | "Teru"
  | "TeShimau"
  | "Chau"
  | "Nakya"
  | "Adverbial"
  | "Na"
  | "Sa";

export type Jlpt = "N5" | "N4" | "N3" | "N2" | "N1";

export interface Lemma {
  /** Dictionary form as written, e.g. 会う */
  text: string;
  /** Dictionary form in hiragana, e.g. あう (may be omitted when text is kana) */
  reading?: string;
  class: WordClass;
}

export interface Token {
  text: string;
  reading?: string;
  pos: Pos;
  /** Contextual Chinese meaning */
  gloss?: string;
  /** Dictionary form + class for inflected words; `steps` derive `text` from it */
  lemma?: Lemma;
  steps?: StepId[];
  jlpt?: Jlpt;
  /** Manual furigana override: [[text, reading?], ...] — only for readings the aligner can't split */
  ruby?: [string, string?][];
  note?: string;
}

export interface Chunk {
  /** Contiguous run of token text in this line */
  ja: string;
  /** Exact fragment(s) of line.zh this chunk corresponds to */
  zh?: string | string[];
  /** 句子成分: 主语 / 宾语 / 谓语 / 定语 / 状语 / 时间 / 起点 / 比喻 / 语气 … */
  role: string;
  note?: string;
}

export interface GrammarRef {
  id: string;
  /** Substring of line.ja that shows this point */
  ja: string;
  /** 1-based occurrence when `ja` appears more than once */
  nth?: number;
  /** Sentence-specific explanation */
  note?: string;
}

export interface Line {
  id: string;
  /** Start time in seconds */
  time?: number;
  ja: string;
  zh?: string;
  tokens?: Token[];
  chunks?: Chunk[];
  grammar?: GrammarRef[];
  /** Sentence-level explanation */
  note?: string;
}

export interface Song {
  $schema?: string;
  version: 1;
  id: string;
  title: string;
  titleReading?: string;
  artist: string;
  /** Audio file: absolute, or relative to the song.json */
  audio?: string;
  /** True when only part of the lyrics is included */
  excerpt?: boolean;
  source?: string;
  customGrammar?: GrammarPoint[];
  lines: Line[];
}

export type GrammarCategory = "particle" | "verb" | "adjective" | "structure" | "pattern" | "colloquial";

export interface GrammarPoint {
  id: string;
  /** Japanese label, e.g. 「から」(起点) */
  title: string;
  /** Short Chinese label */
  zh: string;
  level: Jlpt;
  category: GrammarCategory;
  /** Connection pattern, e.g. N + から */
  pattern?: string;
  summary: string;
  /** A generic (non-lyric) example */
  example?: { ja: string; zh: string };
}

export interface Favorites {
  version: 1;
  lines: { songId: string; lineId: string; ja: string; addedAt: string }[];
}
