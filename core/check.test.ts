import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { analyzeLine } from "./analyze.ts";
import { checkSong } from "./check.ts";
import type { Song } from "./types.ts";

const demo = (): Song => JSON.parse(fs.readFileSync(new URL("../songs/yoru-ni-kakeru/song.json", import.meta.url), "utf8"));
const errorsOf = (song: Song) => checkSong(song).issues.filter((i) => i.level === "error").map((i) => `${i.at ?? ""} ${i.message}`);

test("the bundled demo song is clean", () => {
  const r = checkSong(demo());
  assert.equal(r.errors, 0, JSON.stringify(r.issues, null, 2));
  assert.equal(r.warnings, 0, JSON.stringify(r.issues, null, 2));
});

test("catches a reading that contradicts the derivation", () => {
  const song = demo();
  song.lines[2].tokens![1].reading = "あいた";
  const errs = errorsOf(song);
  assert.ok(errs.some((e) => e.includes("会った") && e.includes("对不上")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("推导出「会った／あった」")), errs.join("\n"));
});

test("catches a wrong conjugation step", () => {
  const song = demo();
  song.lines[2].tokens![1].steps = ["Te"];
  assert.ok(errorsOf(song).some((e) => e.includes("推导出「会って")));
});

test("catches tokens that do not rebuild the line", () => {
  const song = demo();
  song.lines[3].tokens!.splice(4, 1); // drop 全て
  assert.ok(errorsOf(song).some((e) => e.includes("对不上")));
});

test("catches zh fragments missing from the translation and unknown grammar ids", () => {
  const song = demo();
  song.lines[2].chunks![1].zh = "见面的";
  song.lines[2].grammar![2].id = "particle-karra";
  const errs = errorsOf(song);
  assert.ok(errs.some((e) => e.includes("「见面的」")));
  assert.ok(errs.some((e) => e.includes("particle-kara")));
});

test("resolves repeated zh fragments without double-claiming", () => {
  const a = analyzeLine(demo().lines[0]);
  assert.deepEqual(
    a.chunks.map((c) => c.zh),
    [[[2, 6]], [[0, 2]], [[9, 13]], [[7, 9], [13, 15]]],
  );
  // 溶けて carries an auto grammar ref from its Te step
  assert.ok(a.grammar.some((g) => g.id === "verb-te" && g.auto));
});
