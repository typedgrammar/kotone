// Cover lookup against canned responses (no network). Titles are made up.

import assert from "node:assert/strict";
import { test } from "node:test";
import { findCover, imageType } from "./cover.ts";
import { allowedHost, type Http, type HttpRequest } from "./index.ts";

const enc = new TextEncoder();
const JPEG = Uint8Array.from({ length: 2048 }, (_, i) => (i === 0 ? 0xff : i === 1 ? 0xd8 : 7));

/** JSON or image bytes by the first matching URL fragment; records what was asked. */
function fakeHttp(routes: [string, unknown][]): Http & { seen: string[] } {
  const seen: string[] = [];
  const http = async (req: HttpRequest) => {
    seen.push(req.url);
    const hit = routes.find(([frag]) => req.url.includes(frag));
    if (!hit) return { status: 404, body: new Uint8Array() };
    return { status: 200, body: hit[1] instanceof Uint8Array ? hit[1] : enc.encode(JSON.stringify(hit[1])) };
  };
  return Object.assign(http, { seen });
}

const itunes = (results: unknown[]) => ["itunes.apple.com/search", { results }] as [string, unknown];
const track = (trackName: string, artistName: string, art: string) => ({ trackName, artistName, artworkUrl100: `https://is1-ssl.mzstatic.com/${art}/100x100bb.jpg` });

test("a NetEase ref uses that song's own album art", async () => {
  const http = fakeHttp([
    ["api/song/detail", { songs: [{ name: "はじめての朝", album: { name: "朝", picUrl: "http://p1.music.126.net/abc.jpg" } }] }],
    ["p1.music.126.net/abc.jpg", JPEG],
  ]);
  const c = await findCover(http, { title: "はじめての朝", artist: "テスター", ref: "netease:42" });
  assert.equal(c?.from, "netease");
  assert.ok(http.seen.includes("https://p1.music.126.net/abc.jpg?param=800y800"), "https and sized");
  assert.ok(!http.seen.some((u) => u.includes("itunes")));
});

test("iTunes: the matching title wins and the art is asked for at 800px", async () => {
  const http = fakeHttp([
    itunes([track("ちがう歌", "テスター", "wrong"), track("はじめての朝", "テスター", "right")]),
    ["mzstatic.com/right/800x800bb.jpg", JPEG],
  ]);
  const c = await findCover(http, { title: "はじめての朝", artist: "テスター" });
  assert.equal(c?.from, "itunes");
  assert.equal(c?.type, "jpg");
});

test("never takes a different song's cover; falls back to a NetEase search", async () => {
  const http = fakeHttp([
    itunes([track("ちがう歌", "テスター", "wrong")]),
    ["cloudsearch", { code: 200, result: { songs: [{ id: 1, name: "はじめての朝", ar: [{ name: "テスター" }], al: { name: "朝", picUrl: "http://p2.music.126.net/ne.jpg" } }] } }],
    ["p2.music.126.net/ne.jpg", JPEG],
  ]);
  const c = await findCover(http, { title: "はじめての朝", artist: "テスター" });
  assert.equal(c?.from, "netease");
  assert.ok(!http.seen.some((u) => u.includes("wrong")));
});

test("no match anywhere, or something that isn't an image, gives no cover", async () => {
  assert.equal(await findCover(fakeHttp([itunes([])]), { title: "はじめての朝" }), null);
  const html = fakeHttp([itunes([track("はじめての朝", "テスター", "page")]), ["mzstatic.com/page", enc.encode("<html>" + " ".repeat(2000))]]);
  assert.equal(await findCover(html, { title: "はじめての朝" }), null);
  assert.equal(imageType(new Uint8Array([0xff, 0xd8])), null, "too small to be real art");
});

test("cover hosts are allowed by suffix, others are not", () => {
  assert.ok(allowedHost("is3-ssl.mzstatic.com"));
  assert.ok(allowedHost("p4.music.126.net"));
  assert.ok(allowedHost("lrclib.net"));
  assert.ok(!allowedHost("evil-mzstatic.com"));
  assert.ok(!allowedHost("example.com"));
});
