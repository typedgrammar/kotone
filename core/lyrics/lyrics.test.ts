// Lyric download plumbing against canned responses (no network). The lyric lines are made up.

import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { parseLyrics, skeletonLines } from "../lrc.ts";
import type { Line } from "../types.ts";
import { cleanLines, fetchLyrics, matchScore, parseRef, searchLyrics, sourceNote, toLrc, type Http, type HttpRequest } from "./index.ts";
import { decodeKrc, parseKrc } from "./sources.ts";

const enc = new TextEncoder();
const b64 = (s: string | Uint8Array) => Buffer.from(typeof s === "string" ? enc.encode(s) : s).toString("base64");

/** Answers by the first matching URL fragment; records what was asked. */
function fakeHttp(routes: [string, unknown][]): Http & { seen: HttpRequest[] } {
  const seen: HttpRequest[] = [];
  const http = async (req: HttpRequest) => {
    seen.push(req);
    const hit = routes.find(([frag]) => req.url.includes(frag));
    if (!hit) return { status: 404, body: new Uint8Array() };
    return { status: 200, body: enc.encode(typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1])) };
  };
  return Object.assign(http, { seen });
}

test("drops the translation and romaji lines of bilingual LRC", () => {
  const p = parseLyrics(
    [
      "[00:01.00]はじめての朝に",
      "[00:01.00]在初次的早晨",
      "[00:01.00]hajimete no asa ni",
      "[00:05.50][00:20.00]光る窓",
      "[00:05.50][00:20.00]发光的窗",
      "[00:09.00]Oh yeah",
      "[00:09.00]哦耶",
    ].join("\n"),
  );
  assert.deepEqual(p.lines, [
    { time: 1, text: "はじめての朝に" },
    { time: 5.5, text: "光る窓" },
    { time: 9, text: "Oh yeah" },
    { time: 20, text: "光る窓" },
  ]);
});

test("keeps distinct Japanese lines that happen to share a stamp", () => {
  const p = parseLyrics("[00:01.00]君の声\n[00:01.00]僕の声");
  assert.deepEqual(
    p.lines.map((l) => l.text),
    ["君の声", "僕の声"],
  );
});

test("strips credits and the title header", () => {
  const { lines, credits } = cleanLines(
    [
      { time: 0, text: "小さな歌 - テスト歌手" },
      { time: 0.5, text: "作词 : 山田" },
      { time: 1, text: "Composer：Tanaka" },
      { time: 2, text: "小さな歌をうたう" },
      { time: 3, text: "時間：止まれ" }, // has kana in the label → lyric, not a credit
    ],
    { title: "小さな歌 (Live)", artist: "テスト歌手" },
  );
  assert.deepEqual(
    lines.map((l) => l.text),
    ["小さな歌をうたう", "時間：止まれ"],
  );
  assert.deepEqual(credits, ["作词 : 山田", "Composer：Tanaka"]);
});

test("decodes KRC and ignores its translation tag", async () => {
  const lang = b64(JSON.stringify({ content: [{ type: 0, lyricContent: [["x"]] }, { type: 1, lyricContent: [["静静的夜"], [""], ["走吧"]] }] }));
  const krc = [
    "[ti:小さな歌]",
    "[ar:テスト歌手]",
    `[language:${lang}]`,
    "[1000,2000]<0,500,0>静<500,500,0>か<1000,1000,0>な夜",
    "[3000,500]<0,500,0>",
    "[4000,1000]<0,1000,0>行こう",
  ].join("\n");
  const key = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];
  const body = deflateSync(enc.encode(krc)).map((b, i) => b ^ key[i % key.length]);
  const file = new Uint8Array([...enc.encode("krc1"), ...body]);
  const parsed = parseKrc(await decodeKrc(file));
  assert.equal(parsed.title, "小さな歌");
  assert.deepEqual(parsed.lines, [
    { time: 1, text: "静かな夜" },
    { time: 4, text: "行こう" },
  ]);
});

test("fetches NetEase lyrics without asking for the translation", async () => {
  const http = fakeHttp([
    [
      "/api/song/lyric",
      {
        code: 200,
        lrc: { lyric: '{"t":0,"c":[{"tx":"作词: "},{"tx":"山田"}]}\n[00:00.00] 作曲 : 田中\n[00:01.00]静かな夜\n[00:04.00]行こう\n[00:07.00]またね' },
        tlyric: { lyric: "[by:someone]\n[00:01.000]静静的夜\n[00:04.000]走吧\n" },
        transUser: { nickname: "someone" },
      },
    ],
    ["/api/song/detail", { songs: [{ id: 42, name: "小さな歌", ar: [{ name: "テスト歌手" }] }] }],
  ]);
  const f = await fetchLyrics(http, "netease:42");
  assert.equal(f.title, "小さな歌");
  assert.equal(f.artist, "テスト歌手");
  assert.deepEqual(f.lines, [
    { time: 1, text: "静かな夜" },
    { time: 4, text: "行こう" },
    { time: 7, text: "またね" },
  ]);
  assert.ok(!/[?&]tv=/.test(http.seen[0].url), "no translation requested");
  assert.deepEqual(f.credits, ["作词: 山田", "作曲 : 田中"]);
  assert.match(sourceNote(f), /歌词来自网易云音乐（netease:42）$/);
  assert.equal(http.seen[0].headers?.referer, "https://music.163.com/");
});

test("fetches QQ Music lyrics as plain LRC, without translation", async () => {
  const http = fakeHttp([
    [
      "musicu.fcg",
      { code: 0, request: { code: 0, data: { lyric: b64("[ti:小さな歌]\n[ar:テスト歌手]\n[00:01.00]静かな夜"), trans: b64("[00:01.00]静静的夜") } } },
    ],
  ]);
  const f = await fetchLyrics(http, "qq:7");
  assert.deepEqual(f.lines, [{ time: 1, text: "静かな夜" }]);
  const param = JSON.parse(http.seen[0].body!).request.param;
  assert.equal(param.trans, 0);
  assert.equal(param.qrc, 0);
  assert.equal(param.crypt, 0);
  assert.equal(param.songID, 7);
});

test("collects hits from every source and reports the ones that fail", async () => {
  const http = fakeHttp([
    ["cloudsearch", { code: 200, result: { songs: [{ id: 1, name: "小さな歌", ar: [{ name: "テスト歌手" }], al: { name: "A" }, dt: 200_000 }] } }],
    ["mobiles.kugou.com", { data: { info: [{ hash: "ABC", songname: "<em>小さな歌</em>", singername: "テスト歌手", duration: 199 }] } }],
    ["lrclib.net/api/search", [{ id: 9, trackName: "小さな歌", artistName: "テスト歌手", duration: 260, syncedLyrics: "[00:01.00]x" }]],
  ]);
  const { hits, failed } = await searchLyrics(http, "小さな歌");
  assert.deepEqual(
    hits.map((h) => `${h.source}:${h.id}:${h.title}`),
    ["netease:1:小さな歌", "kugou:abc:小さな歌", "lrclib:9:小さな歌"],
  );
  assert.deepEqual(
    failed.map((f) => f.source),
    ["qq"],
  );
});

test("ranks the matching version first", () => {
  const want = { title: "小さな歌", artist: "テスト歌手", duration: 200 };
  const base = { source: "netease" as const, id: "1", artist: "テスト歌手" };
  const scores = [
    matchScore({ ...base, title: "小さな歌", duration: 201 }, want),
    matchScore({ ...base, title: "小さな歌 (Live)", duration: 230 }, want),
    matchScore({ ...base, title: "別の歌", duration: 200 }, want),
  ];
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2], String(scores));
});

test("LRC output round-trips through the parser", () => {
  const lrc = toLrc({
    ref: "lrclib:9",
    source: "lrclib",
    title: "小さな歌",
    artist: "テスト歌手",
    lines: [
      { time: 61.5, text: "静かな夜" },
      { time: 64, text: "行こう" },
    ],
    synced: true,
    credits: [],
  });
  const p = parseLyrics(lrc);
  assert.equal(p.meta.ti, "小さな歌");
  assert.deepEqual(p.lines, [
    { time: 61.5, text: "静かな夜" },
    { time: 64, text: "行こう" },
  ]);
  assert.deepEqual(parseRef("kugou:abc"), { source: "kugou", id: "abc" });
  assert.equal(parseRef("spotify:1"), null);
});

test("skeleton lines carry only reused (agent-written) translations", () => {
  const old: Line = { id: "L09", ja: "静かな夜", zh: "安静的夜晚", tokens: [{ text: "静かな夜", reading: "しずかなよる", pos: "expression" }] };
  const { lines, reused } = skeletonLines(
    [
      { time: 1, text: "静かな夜" },
      { time: 4, text: "行こう" },
    ],
    [old],
  );
  assert.equal(reused, 1);
  assert.deepEqual(lines[0], { ...old, id: "L01", time: 1 });
  assert.deepEqual(lines[1], { id: "L02", time: 4, ja: "行こう" });
});
