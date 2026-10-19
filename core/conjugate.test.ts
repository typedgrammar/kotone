import assert from "node:assert/strict";
import { test } from "node:test";
import { derive } from "./conjugate.ts";
import type { Lemma, StepId } from "./types.ts";

const cases: [Lemma, StepId[], string, string][] = [
  // godan onbin
  [{ text: "会う", reading: "あう", class: "godan" }, ["Ta"], "会った", "あった"],
  [{ text: "奪う", reading: "うばう", class: "godan" }, ["Passive", "Ta"], "奪われた", "うばわれた"],
  [{ text: "待つ", reading: "まつ", class: "godan" }, ["Te"], "待って", "まって"],
  [{ text: "帰る", reading: "かえる", class: "godan" }, ["Te"], "帰って", "かえって"],
  [{ text: "死ぬ", reading: "しぬ", class: "godan" }, ["Ta"], "死んだ", "しんだ"],
  [{ text: "遊ぶ", reading: "あそぶ", class: "godan" }, ["Te"], "遊んで", "あそんで"],
  [{ text: "沈む", reading: "しずむ", class: "godan" }, ["Ta"], "沈んだ", "しずんだ"],
  [{ text: "書く", reading: "かく", class: "godan" }, ["Te"], "書いて", "かいて"],
  [{ text: "泳ぐ", reading: "およぐ", class: "godan" }, ["Ta"], "泳いだ", "およいだ"],
  [{ text: "話す", reading: "はなす", class: "godan" }, ["Te"], "話して", "はなして"],
  [{ text: "行く", reading: "いく", class: "godan" }, ["Ta"], "行った", "いった"],
  [{ text: "いく", class: "godan" }, ["Te"], "いって", "いって"],
  [{ text: "会う", reading: "あう", class: "godan" }, ["Nai"], "会わない", "あわない"],
  [{ text: "会う", reading: "あう", class: "godan" }, ["Nai", "Ta"], "会わなかった", "あわなかった"],
  [{ text: "ある", class: "godan" }, ["Nai"], "ない", "ない"],
  [{ text: "会う", reading: "あう", class: "godan" }, ["Tai"], "会いたい", "あいたい"],
  [{ text: "会う", reading: "あう", class: "godan" }, ["Tai", "Nai", "Ta"], "会いたくなかった", "あいたくなかった"],
  [{ text: "笑う", reading: "わらう", class: "godan" }, ["Potential", "Nai"], "笑えない", "わらえない"],
  [{ text: "書く", reading: "かく", class: "godan" }, ["Masu", "Nai", "Ta"], "書きませんでした", "かきませんでした"],
  [{ text: "行く", reading: "いく", class: "godan" }, ["Volitional"], "行こう", "いこう"],
  [{ text: "走る", reading: "はしる", class: "godan" }, ["Imperative"], "走れ", "はしれ"],
  [{ text: "知る", reading: "しる", class: "godan" }, ["Teru"], "知ってる", "しってる"],
  [{ text: "読む", reading: "よむ", class: "godan" }, ["Chau", "Ta"], "読んじゃった", "よんじゃった"],
  [{ text: "泣く", reading: "なく", class: "godan" }, ["Chau", "Ta"], "泣いちゃった", "ないちゃった"],
  [{ text: "降る", reading: "ふる", class: "godan" }, ["Sou"], "降りそう", "ふりそう"],
  [{ text: "行く", reading: "いく", class: "godan" }, ["Nakya"], "行かなきゃ", "いかなきゃ"],
  [{ text: "言う", reading: "いう", class: "godan" }, ["Zu"], "言わず", "いわず"],
  [{ text: "行く", reading: "いく", class: "godan" }, ["Naide"], "行かないで", "いかないで"],
  [{ text: "くださる", class: "godan" }, ["Imperative"], "ください", "ください"],
  // ichidan
  [{ text: "溶ける", reading: "とける", class: "ichidan" }, ["Te"], "溶けて", "とけて"],
  [{ text: "見る", reading: "みる", class: "ichidan" }, ["PotentialRanuki"], "見れる", "みれる"],
  [{ text: "忘れる", reading: "わすれる", class: "ichidan" }, ["TeShimau", "Ta"], "忘れてしまった", "わすれてしまった"],
  [{ text: "忘れる", reading: "わすれる", class: "ichidan" }, ["Naide"], "忘れないで", "わすれないで"],
  [{ text: "生きる", reading: "いきる", class: "ichidan" }, ["Ba"], "生きれば", "いきれば"],
  // suru / kuru
  [{ text: "する", class: "suru" }, ["Teru", "Ta"], "してた", "してた"],
  [{ text: "勉強する", reading: "べんきょうする", class: "suru" }, ["Potential"], "勉強できる", "べんきょうできる"],
  [{ text: "来る", reading: "くる", class: "kuru" }, ["Ta"], "来た", "きた"],
  [{ text: "来る", reading: "くる", class: "kuru" }, ["Nai"], "来ない", "こない"],
  [{ text: "くる", class: "kuru" }, ["Ba"], "くれば", "くれば"],
  // adjectives / copula
  [{ text: "寂しい", reading: "さびしい", class: "i-adj" }, ["Ta"], "寂しかった", "さびしかった"],
  [{ text: "いい", class: "i-adj" }, ["Ta"], "よかった", "よかった"],
  [{ text: "良い", reading: "いい", class: "i-adj" }, ["Nai"], "良くない", "よくない"],
  [{ text: "いい", class: "i-adj" }, ["Sou"], "よさそう", "よさそう"],
  [{ text: "眩しい", reading: "まぶしい", class: "i-adj" }, ["Sa"], "眩しさ", "まぶしさ"],
  [{ text: "静か", reading: "しずか", class: "na-adj" }, ["Na"], "静かな", "しずかな"],
  [{ text: "よう", class: "na-adj" }, ["Adverbial"], "ように", "ように"],
  [{ text: "だ", class: "copula" }, ["Ta"], "だった", "だった"],
  [{ text: "好き", reading: "すき", class: "na-adj" }, ["Nai", "Ta"], "好きじゃなかった", "すきじゃなかった"],
];

for (const [lemma, steps, text, reading] of cases) {
  test(`${lemma.text} +${steps.join("+")} → ${text}`, () => {
    const d = derive(lemma, steps);
    assert.ok(d.ok, d.ok ? "" : d.error);
    assert.equal(d.text, text);
    assert.equal(d.reading, reading);
  });
}

test("rejects impossible chains and malformed lemmas", () => {
  assert.equal(derive({ text: "会う", reading: "あう", class: "godan" }, ["Te", "Ta"]).ok, false);
  assert.equal(derive({ text: "会う", class: "godan" }, []).ok, false); // missing reading
  assert.equal(derive({ text: "食べる", reading: "たべる", class: "godan" }, ["Ta"]).ok, true); // godan-shaped, still derivable
  assert.equal(derive({ text: "帰る", reading: "かえる", class: "ichidan" }, ["Te"]).ok, true);
  assert.equal(derive({ text: "静かな", reading: "しずかな", class: "na-adj" }, []).ok, false);
  assert.equal(derive({ text: "沈む", reading: "しずむ", class: "ichidan" }, []).ok, false);
});

test("steps carry rules and grammar ids", () => {
  const d = derive({ text: "する", class: "suru" }, ["Teru", "Ta"]);
  assert.ok(d.ok);
  assert.deepEqual(
    d.steps.map((s) => s.grammar),
    [["te-iru", "colloquial-teru"], ["verb-ta"]],
  );
  assert.match(d.steps[1].rule, /一段/);
});
