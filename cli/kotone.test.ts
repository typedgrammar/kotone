import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const CLI = new URL("./kotone.ts", import.meta.url).pathname;
const DEMO = new URL("../songs/yoru-ni-kakeru/song.json", import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kotone-"));
const run = (...args: string[]) => {
  try {
    return { code: 0, out: execFileSync("node", [CLI, ...args], { cwd: tmp, env: { ...process.env, KOTONE_HOME: tmp, NO_COLOR: "1" }, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: err.stdout + err.stderr };
  }
};

test("init → check → times → add round trip", () => {
  fs.writeFileSync(path.join(tmp, "s.lrc"), "[ti:T]\n[ar:A]\n[00:01.00]初めて会った日から\n[00:03.00]新しい行\n");
  assert.match(run("init", "s.lrc", "--id", "t", "--reuse", DEMO).out, /复用了 1 行/);
  const file = path.join(tmp, "t.song.json");
  const song = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(song.lines[0].time, 1);
  assert.equal(song.lines[0].tokens.length, 4);
  assert.equal(run("check", file).code, 0);

  fs.writeFileSync(path.join(tmp, "s2.lrc"), "[00:09.50]初めて会った日から\n");
  run("times", file, "s2.lrc", "--write");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).lines[0].time, 9.5);

  assert.equal(run("add", file).code, 0);
  assert.ok(fs.existsSync(path.join(tmp, "songs", "t", "song.json")));
  assert.match(run("library").out, /t\s+T — A\s+1\/2 行/);
});

test("check fails with a precise message and --json output", () => {
  const song = JSON.parse(fs.readFileSync(DEMO, "utf8"));
  song.lines[3].tokens[6].steps = ["Te"];
  const file = path.join(tmp, "bad.json");
  fs.writeFileSync(file, JSON.stringify(song));
  const r = run("check", file, "--json");
  assert.equal(r.code, 1);
  const report = JSON.parse(r.out);
  assert.equal(report.errors, 1);
  assert.match(report.issues[0].message, /推导出「奪って／うばって」/);
  assert.equal(run("add", file).code, 2);
});

test("conj and grammar helpers", () => {
  assert.match(run("conj", "奪う:うばう", "godan", "Passive", "Ta").out, /奪われた/);
  assert.match(run("grammar", "n-da").out, /のだ／んだ/);
});

test("init keeps no outside translation from a bilingual LRC; library ids resolve", () => {
  fs.writeFileSync(path.join(tmp, "bi.lrc"), "[ti:小さな歌]\n[ar:テスト歌手]\n[00:01.00]静かな夜\n[00:01.00]静静的夜\n[00:04.00]行こう\n");
  assert.match(run("init", "bi.lrc", "--id", "bi").out, /2 行（带时间轴）\n/);
  const song = JSON.parse(fs.readFileSync(path.join(tmp, "bi.song.json"), "utf8"));
  assert.deepEqual(
    song.lines.map((l: { ja: string; zh?: string }) => [l.ja, l.zh]),
    [
      ["静かな夜", undefined],
      ["行こう", undefined],
    ],
  );
  assert.equal(run("add", "bi.song.json").code, 0);
  assert.match(run("status", "bi").out, /小さな歌 — テスト歌手\s+0\/2 行已标注/);
  const usage = run("lyrics");
  assert.equal(usage.code, 2);
  assert.match(usage.out, /用法：kotone lyrics/);
});
