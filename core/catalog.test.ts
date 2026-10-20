// Joining Spotify tracks and lyric hits into songs to add. Titles are made up.

import assert from "node:assert/strict";
import { test } from "node:test";
import { candidates, coverAt, lyricsFor } from "./catalog.ts";
import type { SongHit } from "./lyrics/index.ts";

const hit = (source: SongHit["source"], id: string, title: string, artist: string, duration?: number, cover?: string): SongHit => ({
  source,
  id,
  title,
  artist,
  duration,
  cover,
});

const hits = [
  hit("netease", "1", "はじめての朝", "テスター", 201, "http://p1.music.126.net/a.jpg"),
  hit("qq", "q1", "はじめての朝 (初次的早晨)", "テスター", 202),
  hit("kugou", "k1", "はじめての朝", "別の人", 150),
  hit("lrclib", "9", "はじめての朝", "Tester", 201),
  hit("netease", "2", "夜の歌", "誰か", 180),
  hit("qq", "q2", "夜の歌", "誰か", 181),
];
const tracks = [
  { uri: "spotify:track:A", name: "はじめての朝", artists: ["テスター"], duration: 201, cover: "https://i.scdn.co/image/a", album: "朝" },
  { uri: "spotify:ad:X", name: "広告", artists: [] },
];

test("a Spotify track gathers the lyric hits of the same song, sure ones first", () => {
  const [c] = candidates(tracks, hits);
  assert.equal(c.spotify, "spotify:track:A");
  assert.equal(c.cover, "https://i.scdn.co/image/a");
  // title + artist (+ duration) first; the romanised artist still matches on duration; another
  // artist's song of that title and a different length is left out
  assert.deepEqual(
    c.lyrics.map((h) => h.id),
    ["1", "q1", "9"],
  );
});

test("a romanised Spotify artist gives way to the Japanese name the lyric sites agree on", () => {
  const sp = { uri: "spotify:track:R", name: "Lemonade", artists: ["Tester"], duration: 201 };
  const [c] = candidates(
    [sp],
    [
      hit("netease", "1", "Lemonade", "テスター", 201),
      hit("qq", "q1", "Lemonade", "テスター", 202),
      hit("kugou", "k1", "Lemonade", "てすたー", 200),
      hit("lrclib", "9", "Lemonade", "Tester", 201),
    ],
  );
  assert.equal(c.artist, "テスター");
  assert.equal(candidates([sp], [hit("lrclib", "9", "Lemonade", "Tester", 201)])[0].artist, "Tester");
});

test("lyric hits no track claims become songs of their own, one per title and artist", () => {
  const list = candidates(tracks, hits);
  assert.deepEqual(
    list.map((c) => [c.key, c.title, c.spotify ?? null]),
    [
      ["spotify:track:A", "はじめての朝", "spotify:track:A"],
      ["kugou:k1", "はじめての朝", null],
      ["netease:2", "夜の歌", null],
    ],
  );
  assert.deepEqual(
    list[2].lyrics.map((h) => h.id),
    ["2", "q2"],
  );
});

test("without Spotify every song comes from the lyric sources, with their art", () => {
  const list = candidates([], hits);
  assert.equal(list[0].title, "はじめての朝");
  assert.equal(list[0].cover, "http://p1.music.126.net/a.jpg");
  assert.equal(list.length, 4); // テスター, 別の人, Tester, 誰か
});

test("lyricsFor drops other titles and duplicates", () => {
  assert.deepEqual(
    lyricsFor([...hits, hits[0]], { title: "夜の歌", artist: "誰か" }).map((h) => h.id),
    ["2", "q2"],
  );
});

test("coverAt asks NetEase for a size and leaves other hosts alone", () => {
  assert.equal(coverAt("http://p1.music.126.net/a.jpg", 200), "https://p1.music.126.net/a.jpg?param=200y200");
  assert.equal(coverAt("https://i.scdn.co/image/a", 200), "https://i.scdn.co/image/a");
});
