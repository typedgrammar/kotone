// Songs ↔ Spotify tracks, both ways: which library song the Spotify app is playing, and which search
// result a library song should play as. Either way it's the remembered track, or else the best
// title + artist match (the same scoring the lyric search uses). A title alone isn't enough —
// "Lemon" by someone else must not pull up these lyrics, nor a music-box cover play for them.

import { matchScore } from "./lyrics/index.ts";

export interface PlayingTrack {
  trackId: string;
  name: string;
  artist: string;
  /** Seconds */
  duration?: number;
}

export interface SongRef {
  id: string;
  title: string;
  artist: string;
  /** Remembered `spotify:track:…` */
  spotify?: string | null;
}

// title (6) + artist (2)
const MIN_SCORE = 8;

export function songForTrack(songs: SongRef[], track: PlayingTrack): { id: string; linked: boolean } | null {
  if (!track.trackId.startsWith("spotify:track:")) return null; // ads, local files, podcasts
  const linked = songs.find((s) => s.spotify === track.trackId);
  if (linked) return { id: linked.id, linked: true };
  let best: SongRef | null = null;
  let score = MIN_SCORE - 0.01;
  for (const s of songs) {
    const v = matchScore({ title: track.name, artist: track.artist, duration: track.duration }, { title: s.title, artist: s.artist });
    if (v > score) [best, score] = [s, v];
  }
  return best ? { id: best.id, linked: false } : null;
}

/** A search result, as macos/Sources/SpotifySearch.swift reads it from Spotify's web search */
export interface SpotifyTrack {
  uri: string;
  name: string;
  artists: string[];
  /** Seconds */
  duration?: number;
  cover?: string;
}

/** The result to play for a song; ties keep Spotify's own order (the original before covers). */
export function pickTrack(tracks: SpotifyTrack[], song: { title: string; artist: string }): SpotifyTrack | null {
  let best: SpotifyTrack | null = null;
  let score = MIN_SCORE - 0.01;
  for (const t of tracks) {
    if (!t.uri.startsWith("spotify:track:")) continue;
    const v = matchScore({ title: t.name, artist: t.artists.join(" / "), duration: t.duration }, song);
    if (v > score) [best, score] = [t, v];
  }
  return best;
}
