// Songs to add, from one search: Spotify's catalogue (what will play, with its album art) joined
// with the lyric sources' hits. Each Spotify track carries the lyric hits that are the same song;
// lyric hits that match no track become songs of their own (Spotify doesn't have every song, and a
// local file can stand in), grouped so the four sources' copies of one song show once.

import { baseTitle, matchScore, refOf, type SongHit } from "./lyrics/index.ts";
import type { SpotifyTrack } from "./spotify.ts";

export interface Candidate {
  /** The Spotify URI, else the first lyric hit's ref */
  key: string;
  title: string;
  artist: string;
  album?: string;
  /** Seconds */
  duration?: number;
  /** Album art to show and keep */
  cover?: string;
  /** `spotify:track:…` it plays as */
  spotify?: string;
  /** Lyric hits that are this song, best first */
  lyrics: SongHit[];
}

// title (6) + artist or duration (2): the same song, not just the same title
export const SURE = 8;
// the title alone: offered, never picked on its own
export const MAYBE = 6;

const want = (c: Pick<Candidate, "title" | "artist" | "duration">) => ({ title: c.title, artist: c.artist, duration: c.duration });

/** Lyric hits for a song, best first: the sure matches, or when there are none the title-only ones. */
export function lyricsFor(hits: SongHit[], song: Pick<Candidate, "title" | "artist" | "duration">, limit = 8): SongHit[] {
  const seen = new Set<string>();
  const scored = hits
    .map((h) => ({ h, s: matchScore(h, want(song)) }))
    .filter(({ h, s }) => s >= MAYBE && !seen.has(refOf(h)) && seen.add(refOf(h)))
    .sort((a, b) => b.s - a.s);
  const sureOnes = scored.filter(({ s }) => s >= SURE);
  return (sureOnes.length ? sureOnes : scored).slice(0, limit).map(({ h }) => h);
}

export const sure = (hit: SongHit, song: Pick<Candidate, "title" | "artist" | "duration">): boolean => matchScore(hit, want(song)) >= SURE;

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Spotify may give a Japanese singer in romaji (「Kenshi Yonezu」): take the name in Japanese script
 * that most of the matching lyric hits agree on, so the library shows what the singer is called.
 */
function nativeName(theirs: string, names: string[]): string {
  if (JAPANESE.test(theirs)) return theirs;
  const votes = new Map<string, number>();
  for (const n of names) if (JAPANESE.test(n)) votes.set(n, (votes.get(n) ?? 0) + 1);
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? theirs;
}

const neCover = (url: string, size: number) => `${url.replace(/^http:/, "https:")}?param=${size}y${size}`;

/** Album art at about `size` px: NetEase scales on request, Spotify's 640px is the largest it has. */
export const coverAt = (url: string, size: number): string => (url.includes(".music.126.net/") ? neCover(url.replace(/\?.*$/, ""), size) : url);

const groupKey = (h: SongHit) =>
  `${baseTitle(h.title).toLowerCase().replace(/\s+/g, "")}|${h.artist.split(/\s*[/、,&]\s*/)[0].toLowerCase().replace(/\s+/g, "")}`;

export function candidates(tracks: SpotifyTrack[], hits: SongHit[], limit = 20): Candidate[] {
  const out: Candidate[] = [];
  const claimed = new Set<string>();
  for (const t of tracks) {
    if (!t.uri.startsWith("spotify:track:")) continue;
    const c: Candidate = {
      key: t.uri,
      title: t.name,
      artist: t.artists.join(" / "),
      album: t.album,
      duration: t.duration,
      cover: t.cover,
      spotify: t.uri,
      lyrics: [],
    };
    c.lyrics = lyricsFor(hits, c);
    const same = c.lyrics.filter((h) => sure(h, c));
    for (const h of same) claimed.add(refOf(h));
    c.artist = nativeName(c.artist, same.map((h) => h.artist));
    out.push(c);
    if (out.length >= limit) break;
  }
  const groups = new Map<string, SongHit[]>();
  for (const h of hits) {
    if (claimed.has(refOf(h))) continue;
    const k = groupKey(h);
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  for (const group of [...groups.values()].slice(0, limit)) {
    const first = group[0];
    const c: Candidate = {
      key: refOf(first),
      title: baseTitle(first.title) || first.title,
      artist: first.artist,
      album: group.find((h) => h.album)?.album,
      duration: first.duration,
      cover: group.find((h) => h.cover)?.cover,
      lyrics: [],
    };
    c.lyrics = lyricsFor(hits, c);
    out.push(c);
  }
  return out;
}
