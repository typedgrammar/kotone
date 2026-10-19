// Deterministic conjugation engine. An annotation claims `lemma + steps → token.text/reading`;
// the checker re-derives it here, so a hallucinated form is caught instead of shown to a learner.
// (Same idea as typed-japanese's ConjugateVerb, but chainable and tracking the kana reading too.)

import { GODAN_ROWS, isIOrERow, isKanaOnly, toHiragana } from "./kana.ts";
import type { Lemma, StepId, WordClass } from "./types.ts";

type Cls = WordClass | "masu" | "masu-neg" | "final";
type Group = "verb" | "i-adj" | "na" | "masu";

interface Form {
  text: string;
  reading: string;
  cls: Cls;
  /** produced by a Nai step — affects そう (なさそう) */
  nai?: boolean;
}

export interface DerivedStep {
  step: StepId;
  text: string;
  reading: string;
  /** Human explanation of the rule applied (zh) */
  rule: string;
  /** Grammar-catalog ids this step demonstrates */
  grammar: string[];
}

export type Derivation =
  | { ok: true; text: string; reading: string; steps: DerivedStep[] }
  | { ok: false; error: string; steps: DerivedStep[] };

export const STEP_INFO: Record<StepId, { label: string; zh: string }> = {
  MasuStem: { label: "連用形", zh: "连用形（ます词干）" },
  Masu: { label: "ます形", zh: "礼貌体" },
  Te: { label: "て形", zh: "连接、中顿" },
  Ta: { label: "た形", zh: "过去、完成" },
  Nai: { label: "ない形", zh: "否定" },
  Naide: { label: "ないで", zh: "不…（就）、别…" },
  Zu: { label: "ず", zh: "否定（书面）" },
  Potential: { label: "可能形", zh: "能…" },
  PotentialRanuki: { label: "ら抜き", zh: "能…（口语省ら）" },
  Passive: { label: "受身形", zh: "被…" },
  Causative: { label: "使役形", zh: "让…、使…" },
  Volitional: { label: "意向形", zh: "…吧、打算…" },
  Imperative: { label: "命令形", zh: "命令" },
  Ba: { label: "ば形", zh: "如果…" },
  Tara: { label: "たら", zh: "如果…、…之后" },
  Tari: { label: "たり", zh: "列举动作" },
  Tai: { label: "たい", zh: "想…" },
  Nagara: { label: "ながら", zh: "一边…一边" },
  Sou: { label: "そう", zh: "看起来…" },
  TeIru: { label: "ている", zh: "正在…、…着" },
  Teru: { label: "てる", zh: "ている的口语" },
  TeShimau: { label: "てしまう", zh: "…完、…掉（遗憾）" },
  Chau: { label: "ちゃう", zh: "てしまう的口语" },
  Nakya: { label: "なきゃ", zh: "不…不行（口语）" },
  Adverbial: { label: "連用形", zh: "副词用法（く／に）" },
  Na: { label: "な", zh: "修饰名词" },
  Sa: { label: "さ", zh: "名词化" },
};

export const STEP_IDS = Object.keys(STEP_INFO) as StepId[];

export const CLASS_INFO: Record<WordClass, string> = {
  godan: "五段动词",
  ichidan: "一段动词",
  suru: "サ变动词（する）",
  kuru: "カ变动词（来る）",
  "i-adj": "い形容词",
  "na-adj": "な形容词",
  copula: "判断词だ",
};

const GRAMMAR: Partial<Record<StepId, Partial<Record<Group, string[]>>>> = {
  MasuStem: { verb: ["verb-masu-stem"] },
  Masu: { verb: ["verb-masu"] },
  Te: { verb: ["verb-te"], "i-adj": ["iadj-te"], na: ["copula-te"], masu: ["verb-masu"] },
  Ta: { verb: ["verb-ta"], "i-adj": ["iadj-past"], na: ["copula-past"], masu: ["verb-masu"] },
  Nai: { verb: ["verb-nai"], "i-adj": ["iadj-negative"], na: ["copula-negative"], masu: ["verb-masu"] },
  Naide: { verb: ["nai-de"] },
  Zu: { verb: ["verb-zu"] },
  Potential: { verb: ["verb-potential"] },
  PotentialRanuki: { verb: ["verb-potential", "colloquial-ranuki"] },
  Passive: { verb: ["verb-passive"] },
  Causative: { verb: ["verb-causative"] },
  Volitional: { verb: ["verb-volitional"], na: ["copula-darou"], masu: ["verb-masu"] },
  Imperative: { verb: ["verb-imperative"] },
  Ba: { verb: ["verb-ba"], "i-adj": ["iadj-ba"] },
  Tara: { verb: ["verb-tara"], "i-adj": ["verb-tara"], na: ["verb-tara"] },
  Tari: { verb: ["verb-tari"], "i-adj": ["verb-tari"] },
  Tai: { verb: ["verb-tai"] },
  Nagara: { verb: ["verb-nagara"] },
  Sou: { verb: ["sou-appearance"], "i-adj": ["sou-appearance"], na: ["sou-appearance"] },
  TeIru: { verb: ["te-iru"] },
  Teru: { verb: ["te-iru", "colloquial-teru"] },
  TeShimau: { verb: ["te-shimau"] },
  Chau: { verb: ["te-shimau", "colloquial-chau"] },
  Nakya: { verb: ["colloquial-nakya"] },
  Adverbial: { "i-adj": ["iadj-adverbial"], na: ["naadj-ni"] },
  Na: { na: ["naadj-na"] },
  Sa: { "i-adj": ["iadj-sa"] },
};

const groupOf = (cls: Cls): Group | null =>
  cls === "godan" || cls === "ichidan" || cls === "suru" || cls === "kuru"
    ? "verb"
    : cls === "i-adj"
      ? "i-adj"
      : cls === "na-adj" || cls === "copula"
        ? "na"
        : cls === "masu" || cls === "masu-neg"
          ? "masu"
          : null;

type Result = { form: Form; rule: string } | string;

/** Replace the last `drop` characters of both text and reading, then append. */
function tail(f: Form, drop: number, add: string, cls: Cls, extra: Partial<Form> = {}): Form {
  return {
    text: f.text.slice(0, f.text.length - drop) + add,
    reading: f.reading.slice(0, f.reading.length - drop) + add,
    cls,
    ...extra,
  };
}

// ---- godan ---------------------------------------------------------------------------

const ONBIN: Record<string, { te: string; ta: string; name: string }> = {
  う: { te: "って", ta: "った", name: "促音便" },
  つ: { te: "って", ta: "った", name: "促音便" },
  る: { te: "って", ta: "った", name: "促音便" },
  ぬ: { te: "んで", ta: "んだ", name: "拨音便" },
  ぶ: { te: "んで", ta: "んだ", name: "拨音便" },
  む: { te: "んで", ta: "んだ", name: "拨音便" },
  く: { te: "いて", ta: "いた", name: "イ音便" },
  ぐ: { te: "いで", ta: "いだ", name: "イ音便" },
  す: { te: "して", ta: "した", name: "无音便" },
};

const HONORIFIC_ARU = ["くださる", "なさる", "いらっしゃる", "おっしゃる", "ござる"];

function godan(f: Form, step: StepId): Result {
  const e = f.reading.at(-1)!;
  const row = GODAN_ROWS[e];
  const iku = /[行逝]く$|^[いゆ]く$/.test(f.text) && /[いゆ]く$/.test(f.reading);
  const aru = f.reading === "ある" || /[有在]る$/.test(f.text);
  const honorific = HONORIFIC_ARU.some((w) => f.reading.endsWith(w));
  const on = iku ? { te: "って", ta: "った", name: "「行く」特例" } : ONBIN[e];
  const g = "五段动词";
  const onRule = (suffix: string) =>
    iku
      ? `「行く」是特例：→「${suffix}」（不是「いて」）`
      : `${g}：词尾「${e}」→「${suffix}」（${on.name}）`;
  const a = (add: string, cls: Cls, extra: Partial<Form> = {}): Result => ({
    form: tail(f, 1, row.a + add, cls, extra),
    rule: `${g}：词尾「${e}」变あ段「${row.a}」＋「${add}」`,
  });
  const i = (add: string, cls: Cls): Result => {
    const k = honorific ? "い" : row.i;
    return { form: tail(f, 1, k + add, cls), rule: `${g}：词尾「${e}」变い段「${k}」${add ? `＋「${add}」` : ""}` };
  };
  const ee = (add: string, cls: Cls): Result => ({
    form: tail(f, 1, row.e + add, cls),
    rule: `${g}：词尾「${e}」变え段「${row.e}」${add ? `＋「${add}」` : ""}`,
  });
  const te = (add: string, cls: Cls, rule?: string): Result => ({
    form: tail(f, 1, on.te + add, cls),
    rule: rule ?? `${onRule(on.te)}${add ? `，再接「${add}」` : ""}`,
  });
  switch (step) {
    case "MasuStem":
      return i("", "final");
    case "Masu":
      return i("ます", "masu");
    case "Te":
      return { form: tail(f, 1, on.te, "final"), rule: onRule(on.te) };
    case "Ta":
      return { form: tail(f, 1, on.ta, "final"), rule: onRule(on.ta) };
    case "Tara":
      return { form: tail(f, 1, on.ta + "ら", "final"), rule: `${onRule(on.ta)}，再接「ら」` };
    case "Tari":
      return { form: tail(f, 1, on.ta + "り", "final"), rule: `${onRule(on.ta)}，再接「り」` };
    case "Nai":
      if (aru)
        return {
          form: { text: f.text.slice(0, -2) + "ない", reading: f.reading.slice(0, -2) + "ない", cls: "i-adj", nai: true },
          rule: "「ある」的否定是特例：直接用「ない」（不说「あらない」）",
        };
      return a("ない", "i-adj", { nai: true });
    case "Naide":
      return a("ないで", "final");
    case "Zu":
      return a("ず", "final");
    case "Nakya":
      return a("なきゃ", "final");
    case "Passive":
      return a("れる", "ichidan");
    case "Causative":
      return a("せる", "ichidan");
    case "Potential": {
      const r = ee("る", "ichidan") as { form: Form; rule: string };
      return { form: r.form, rule: `${r.rule}，变成一段动词` };
    }
    case "Volitional":
      return {
        form: tail(f, 1, row.o + "う", "final"),
        rule: `${g}：词尾「${e}」变お段「${row.o}」＋「う」`,
      };
    case "Imperative":
      if (honorific) return { form: tail(f, 1, "い", "final"), rule: `敬语动词「${f.reading}」的命令形是「〜い」` };
      return ee("", "final");
    case "Ba":
      return ee("ば", "final");
    case "Tai":
      return i("たい", "i-adj");
    case "Nagara":
      return i("ながら", "final");
    case "Sou":
      return i("そう", "na-adj");
    case "TeIru":
      return te("いる", "ichidan");
    case "Teru":
      return te("る", "ichidan", `${onRule(on.te)}，再接「る」（「ている」省掉「い」）`);
    case "TeShimau":
      return te("しまう", "godan");
    case "Chau": {
      const c = on.te.endsWith("で") ? on.te.slice(0, -1) + "じゃう" : on.te.slice(0, -1) + "ちゃう";
      return { form: tail(f, 1, c, "godan"), rule: `${onRule(on.te)}，「${on.te}しまう」口语缩约成「${c}」` };
    }
    default:
      return `五段动词不能直接接「${step}」`;
  }
}

// ---- ichidan / suru / kuru ------------------------------------------------------------

const ICHIDAN: Partial<Record<StepId, [string, Cls]>> = {
  MasuStem: ["", "final"],
  Masu: ["ます", "masu"],
  Te: ["て", "final"],
  Ta: ["た", "final"],
  Nai: ["ない", "i-adj"],
  Naide: ["ないで", "final"],
  Zu: ["ず", "final"],
  Potential: ["られる", "ichidan"],
  PotentialRanuki: ["れる", "ichidan"],
  Passive: ["られる", "ichidan"],
  Causative: ["させる", "ichidan"],
  Volitional: ["よう", "final"],
  Imperative: ["ろ", "final"],
  Ba: ["れば", "final"],
  Tara: ["たら", "final"],
  Tari: ["たり", "final"],
  Tai: ["たい", "i-adj"],
  Nagara: ["ながら", "final"],
  Sou: ["そう", "na-adj"],
  TeIru: ["ている", "ichidan"],
  Teru: ["てる", "ichidan"],
  TeShimau: ["てしまう", "godan"],
  Chau: ["ちゃう", "godan"],
  Nakya: ["なきゃ", "final"],
};

function ichidan(f: Form, step: StepId): Result {
  const s = ICHIDAN[step];
  if (!s) return `一段动词不能直接接「${step}」`;
  const [add, cls] = s;
  return {
    form: tail(f, 1, add, cls, cls === "i-adj" && step === "Nai" ? { nai: true } : {}),
    rule: `一段动词：去掉「る」${add ? `＋「${add}」` : ""}`,
  };
}

const SURU: Partial<Record<StepId, [string, Cls]>> = {
  MasuStem: ["し", "final"],
  Masu: ["します", "masu"],
  Te: ["して", "final"],
  Ta: ["した", "final"],
  Nai: ["しない", "i-adj"],
  Naide: ["しないで", "final"],
  Zu: ["せず", "final"],
  Potential: ["できる", "ichidan"],
  Passive: ["される", "ichidan"],
  Causative: ["させる", "ichidan"],
  Volitional: ["しよう", "final"],
  Imperative: ["しろ", "final"],
  Ba: ["すれば", "final"],
  Tara: ["したら", "final"],
  Tari: ["したり", "final"],
  Tai: ["したい", "i-adj"],
  Nagara: ["しながら", "final"],
  Sou: ["しそう", "na-adj"],
  TeIru: ["している", "ichidan"],
  Teru: ["してる", "ichidan"],
  TeShimau: ["してしまう", "godan"],
  Chau: ["しちゃう", "godan"],
  Nakya: ["しなきゃ", "final"],
};

function suru(f: Form, step: StepId): Result {
  const s = SURU[step];
  if (!s) return `する不能直接接「${step}」`;
  const [add, cls] = s;
  const rule = step === "Potential" ? "する的可能形是另一个词「できる」" : `する是不规则动词：→「${add}」`;
  return { form: tail(f, 2, add, cls, step === "Nai" ? { nai: true } : {}), rule };
}

// [stem kana, ending] — 来る's kanji stays 来, only its reading moves between き/こ/く
const KURU: Partial<Record<StepId, [string, string, Cls]>> = {
  MasuStem: ["き", "", "final"],
  Masu: ["き", "ます", "masu"],
  Te: ["き", "て", "final"],
  Ta: ["き", "た", "final"],
  Nai: ["こ", "ない", "i-adj"],
  Naide: ["こ", "ないで", "final"],
  Zu: ["こ", "ず", "final"],
  Potential: ["こ", "られる", "ichidan"],
  PotentialRanuki: ["こ", "れる", "ichidan"],
  Passive: ["こ", "られる", "ichidan"],
  Causative: ["こ", "させる", "ichidan"],
  Volitional: ["こ", "よう", "final"],
  Imperative: ["こ", "い", "final"],
  Ba: ["く", "れば", "final"],
  Tara: ["き", "たら", "final"],
  Tari: ["き", "たり", "final"],
  Tai: ["き", "たい", "i-adj"],
  Nagara: ["き", "ながら", "final"],
  Sou: ["き", "そう", "na-adj"],
  TeIru: ["き", "ている", "ichidan"],
  Teru: ["き", "てる", "ichidan"],
  TeShimau: ["き", "てしまう", "godan"],
  Chau: ["き", "ちゃう", "godan"],
  Nakya: ["こ", "なきゃ", "final"],
};

function kuru(f: Form, step: StepId): Result {
  const s = KURU[step];
  if (!s) return `来る不能直接接「${step}」`;
  const [stem, add, cls] = s;
  const text = f.text.endsWith("来る") ? f.text.slice(0, -1) + add : f.text.slice(0, -2) + stem + add;
  return {
    form: { text, reading: f.reading.slice(0, -2) + stem + add, cls, nai: step === "Nai" },
    rule: `来る是不规则动词：词干读音变成「${stem}」→「${stem}${add}」`,
  };
}

// ---- adjectives / copula / masu ---------------------------------------------------------

function iadj(f0: Form, step: StepId): Result {
  // いい conjugates from its older form よい: よかった, よくない…
  let f = f0;
  let pre = "";
  if (f.reading.endsWith("いい")) {
    f = {
      ...f,
      reading: f.reading.slice(0, -2) + "よい",
      text: f.text.endsWith("いい") ? f.text.slice(0, -2) + "よい" : f.text,
    };
    pre = "「いい」变形时要换成「よい」：";
  }
  const g = f.nai ? "「ない」和い形容词一样变形" : "い形容词";
  const t = (add: string, cls: Cls, extra: Partial<Form> = {}): Result => ({
    form: tail(f, 1, add, cls, extra),
    rule: `${pre}${g}：去掉「い」＋「${add}」`,
  });
  switch (step) {
    case "Ta":
      return t("かった", "final");
    case "Nai":
      return t("くない", "i-adj", { nai: true });
    case "Te":
      return t("くて", "final");
    case "Adverbial":
      return t("く", "final");
    case "Ba":
      return t("ければ", "final");
    case "Tara":
      return t("かったら", "final");
    case "Tari":
      return t("かったり", "final");
    case "Sa":
      return t("さ", "final");
    case "Sou": {
      // よい / ない (and verb-negative ない) insert さ: よさそう, なさそう
      const whole = f.reading === "よい" || f.reading === "ない" || f.nai;
      return whole ? t("さそう", "na-adj") : t("そう", "na-adj");
    }
    default:
      return `い形容词不能接「${step}」`;
  }
}

function nadj(f: Form, step: StepId): Result {
  const cop = f.cls === "copula";
  // the copula lemma is だ itself; na-adjective lemmas are bare stems (静か)
  const drop = cop ? 1 : 0;
  const g = cop ? "判断词「だ」" : "な形容词";
  const t = (add: string, cls: Cls, how: string): Result => ({
    form: tail(f, drop, add, cls, add === "じゃない" ? { nai: true } : {}),
    rule: `${g}：${how}「${add}」`,
  });
  const base = cop ? "变成" : "词干＋";
  switch (step) {
    case "Na":
      return t("な", "final", base);
    case "Adverbial":
      return cop ? "「だ」没有副词用法" : t("に", "final", base);
    case "Te":
      return t("で", "final", base);
    case "Ta":
      return t("だった", "final", base);
    case "Nai":
      return t("じゃない", "i-adj", base);
    case "Tara":
      return t("だったら", "final", base);
    case "Volitional":
      return t("だろう", "final", base);
    case "Sou":
      return cop ? "「だ」不能接そう" : t("そう", "na-adj", base);
    default:
      return `${g}不能接「${step}」`;
  }
}

function masu(f: Form, step: StepId): Result {
  if (f.cls === "masu-neg")
    return step === "Ta"
      ? { form: tail(f, 0, "でした", "final"), rule: "「ません」的过去式：＋「でした」" }
      : `「ません」之后不能接「${step}」`;
  const m: Partial<Record<StepId, [string, Cls]>> = {
    Ta: ["ました", "final"],
    Nai: ["ません", "masu-neg"],
    Volitional: ["ましょう", "final"],
    Te: ["まして", "final"],
  };
  const s = m[step];
  if (!s) return `「ます」之后不能接「${step}」`;
  return { form: tail(f, 2, s[0], s[1]), rule: `「ます」→「${s[0]}」` };
}

// ---- driver ------------------------------------------------------------------------

/** Validate a lemma's shape for its class; returns an error message or null. */
export function lemmaProblem(text: string, reading: string, cls: WordClass): string | null {
  const last = reading.at(-1) ?? "";
  switch (cls) {
    case "godan":
      if (!GODAN_ROWS[last]) return `五段动词的辞书形应以う段假名结尾（读音「${reading}」）`;
      if (toHiragana(text.at(-1) ?? "") !== last) return `辞书形「${text}」最后一个字应是假名「${last}」`;
      return null;
    case "ichidan":
      if (!reading.endsWith("る") || !text.endsWith("る")) return "一段动词的辞书形以「る」结尾";
      if (!isIOrERow(reading.at(-2) ?? "")) return `一段动词「る」前面应是い段或え段（读音「${reading}」）`;
      return null;
    case "suru":
      return text.endsWith("する") && reading.endsWith("する") ? null : "サ变动词的 lemma 应以「する」结尾（如 勉強する）";
    case "kuru":
      return /(来る|くる)$/.test(text) && reading.endsWith("くる") ? null : "カ变动词的 lemma 应是「来る／くる」";
    case "i-adj":
      return text.endsWith("い") && reading.endsWith("い") ? null : "い形容词以「い」结尾";
    case "na-adj":
      return /[なだ]$/.test(text) ? "な形容词的 lemma 只写词干（静か，不写 静かな／静かだ）" : null;
    case "copula":
      return text === "だ" ? null : "判断词的 lemma 写「だ」";
  }
}

export function derive(lemma: Lemma, steps: StepId[] = []): Derivation {
  const reading = lemma.reading ?? (isKanaOnly(lemma.text) ? toHiragana(lemma.text) : "");
  if (!reading) return { ok: false, error: `lemma「${lemma.text}」含汉字，需要写 reading`, steps: [] };
  const problem = lemmaProblem(lemma.text, toHiragana(reading), lemma.class);
  if (problem) return { ok: false, error: problem, steps: [] };

  let form: Form = { text: lemma.text, reading: toHiragana(reading), cls: lemma.class };
  const out: DerivedStep[] = [];
  for (const step of steps) {
    if (!(step in STEP_INFO)) return { ok: false, error: `未知的变形步骤「${step}」`, steps: out };
    const group = groupOf(form.cls);
    let r: Result;
    switch (form.cls) {
      case "godan":
        r = godan(form, step);
        break;
      case "ichidan":
        r = ichidan(form, step);
        break;
      case "suru":
        r = suru(form, step);
        break;
      case "kuru":
        r = kuru(form, step);
        break;
      case "i-adj":
        r = iadj(form, step);
        break;
      case "na-adj":
      case "copula":
        r = nadj(form, step);
        break;
      case "masu":
      case "masu-neg":
        r = masu(form, step);
        break;
      case "final":
        r = `「${form.text}」已经是最终形式，后面不能再接「${step}」`;
        break;
    }
    if (typeof r === "string") return { ok: false, error: r, steps: out };
    form = r.form;
    out.push({
      step,
      text: form.text,
      reading: form.reading,
      rule: r.rule,
      grammar: (group && GRAMMAR[step]?.[group]) || [],
    });
  }
  return { ok: true, text: form.text, reading: form.reading, steps: out };
}

/** Every single-step form of a lemma — used by `kotone conj --all`. */
export function conjugationTable(lemma: Lemma): { step: StepId; text: string; reading: string }[] {
  const rows: { step: StepId; text: string; reading: string }[] = [];
  for (const step of STEP_IDS) {
    const d = derive(lemma, [step]);
    if (d.ok) rows.push({ step, text: d.text, reading: d.reading });
  }
  return rows;
}
