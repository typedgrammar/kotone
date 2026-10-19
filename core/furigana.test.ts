import assert from "node:assert/strict";
import { test } from "node:test";
import { alignRuby, rubyFor } from "./furigana.ts";
import { parseLyrics } from "./lrc.ts";

test("aligns okurigana", () => {
  assert.deepEqual(alignRuby("初めて", "はじめて"), [{ text: "初", ruby: "はじ" }, { text: "めて" }]);
  assert.deepEqual(alignRuby("会った", "あった"), [{ text: "会", ruby: "あ" }, { text: "った" }]);
  assert.deepEqual(alignRuby("取り扱い", "とりあつかい"), [
    { text: "取", ruby: "と" },
    { text: "り" },
    { text: "扱", ruby: "あつか" },
    { text: "い" },
  ]);
  assert.deepEqual(alignRuby("空気", "くうき"), [{ text: "空気", ruby: "くうき" }]);
  assert.deepEqual(alignRuby("ハート", "はーと"), [{ text: "ハート" }]);
});

test("detects readings that contradict the kana", () => {
  assert.equal(alignRuby("会った", "あいた"), null);
  assert.deepEqual(rubyFor("会った", "あいた"), [{ text: "会った", ruby: "あいた" }]);
  assert.deepEqual(rubyFor("今日", undefined, [["今日", "きょう"]]), [{ text: "今日", ruby: "きょう" }]);
});

test("parses LRC with metadata and multiple stamps", () => {
  const p = parseLyrics("[ti:Song]\n[ar:Someone]\n[00:01.50]一行目\n[00:10.00][01:00.25]サビ\n\n[00:05]二行目");
  assert.equal(p.meta.ti, "Song");
  assert.deepEqual(
    p.lines.map((l) => [l.time, l.text]),
    [
      [1.5, "一行目"],
      [5, "二行目"],
      [10, "サビ"],
      [60.25, "サビ"],
    ],
  );
});
