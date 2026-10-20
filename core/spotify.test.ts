// Matching the Spotify app's current track to library songs. Titles are made up.

import assert from "node:assert/strict";
import { test } from "node:test";
import { pickTrack, songForTrack } from "./spotify.ts";

const songs = [
  { id: "asa", title: "はじめての朝", artist: "テスター" },
  { id: "asa-live", title: "はじめての朝", artist: "テスター", spotify: "spotify:track:LIVE" },
  { id: "lemon", title: "Lemon", artist: "テスター" },
];
const track = (trackId: string, name: string, artist: string) => ({ trackId, name, artist });

test("a remembered track wins over any title match", () => {
  assert.deepEqual(songForTrack(songs, track("spotify:track:LIVE", "はじめての朝 - Live", "テスター")), { id: "asa-live", linked: true });
});

test("title and artist must both match; version suffixes don't matter", () => {
  assert.deepEqual(songForTrack(songs.slice(0, 1), track("spotify:track:A", "はじめての朝 - Remastered", "テスター")), { id: "asa", linked: false });
  assert.equal(songForTrack(songs, track("spotify:track:B", "Lemon", "別の人")), null);
  assert.deepEqual(songForTrack(songs, track("spotify:track:C", "Lemon", "テスター / ゲスト")), { id: "lemon", linked: false });
});

test("ads and local files never match", () => {
  assert.equal(songForTrack(songs, track("spotify:ad:X", "はじめての朝", "テスター")), null);
  assert.equal(songForTrack(songs, track("spotify:local:x", "はじめての朝", "テスター")), null);
});

test("pickTrack: the original over a live take, never another artist's cover", () => {
  const results = [
    { uri: "spotify:track:BOX", name: "はじめての朝（テスター）", artists: ["Music Box"] },
    { uri: "spotify:track:LIVE", name: "はじめての朝 - From THE LIVE", artists: ["テスター"] },
    { uri: "spotify:track:ORIG", name: "はじめての朝", artists: ["テスター"] },
    { uri: "spotify:track:FEAT", name: "別の曲 (Contains a sample of はじめての朝)", artists: ["他人", "テスター"] },
  ];
  assert.equal(pickTrack(results, { title: "はじめての朝", artist: "テスター" })?.uri, "spotify:track:ORIG");
  assert.equal(pickTrack(results.slice(0, 1), { title: "はじめての朝", artist: "テスター" }), null);
  assert.equal(pickTrack([], { title: "はじめての朝", artist: "テスター" }), null);
});
