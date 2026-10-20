// Album art for a song, found alongside its lyrics. Order: the NetEase song the lyrics came from
// (exact album), then the iTunes Store (official artwork, high resolution), then a NetEase search.
// Search results only count when the title matches, so a wrong song's cover never wins.

import { matchScore, parseRef, type Http, type SongHit } from "./index.ts";
import { json, NE_HEADERS, PROVIDERS, qs, type NeSong } from "./sources.ts";

export interface CoverWant {
  title: string;
  artist?: string;
  /** Seconds */
  duration?: number;
  /** `${source}:${id}` of the lyrics, when they were downloaded */
  ref?: string;
}

export interface Cover {
  bytes: Uint8Array;
  type: "jpg" | "png";
  /** Where it was found, for the record */
  from: string;
}

const SIZE = 800;
// a matching title is worth 6 in matchScore; anything less is a different song
const MIN_SCORE = 6;

const neImage = (url: string) => `${url.replace(/^http:/, "https:")}?param=${SIZE}y${SIZE}`;

async function fromNeteaseRef(http: Http, id: string): Promise<string | null> {
  const r = await http({ url: `https://music.163.com/api/song/detail/?ids=%5B${encodeURIComponent(id)}%5D`, headers: NE_HEADERS });
  // this older endpoint says `album` where search says `al`
  const song = json<{ songs?: NeSong[] }>(r, "网易云歌曲信息").songs?.[0];
  const pic = song?.al?.picUrl ?? song?.album?.picUrl;
  return pic ? neImage(pic) : null;
}

interface ItunesTrack {
  trackName: string;
  artistName: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
}

async function fromItunes(http: Http, want: CoverWant): Promise<string | null> {
  const term = [want.title, want.artist].filter(Boolean).join(" ");
  const r = await http({ url: `https://itunes.apple.com/search?${qs({ term, media: "music", entity: "song", limit: 15, country: "JP" })}` });
  const tracks = json<{ results?: ItunesTrack[] }>(r, "iTunes 搜索").results ?? [];
  const best = pick(
    tracks.filter((t) => t.artworkUrl100),
    (t) => ({ title: t.trackName, artist: t.artistName, duration: (t.trackTimeMillis ?? 0) / 1000 }),
    want,
  );
  return best ? best.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${SIZE}x${SIZE}bb.$1`) : null;
}

async function fromNeteaseSearch(http: Http, want: CoverWant): Promise<string | null> {
  const hits = await PROVIDERS.netease.search(http, [want.title, want.artist].filter(Boolean).join(" "), 10);
  const best = pick(
    hits.filter((h) => h.cover),
    (h) => h,
    want,
  );
  return best ? neImage(best.cover!) : null;
}

function pick<T>(items: T[], asHit: (t: T) => Pick<SongHit, "title" | "artist" | "duration">, want: CoverWant): T | null {
  let best: T | null = null;
  let score = MIN_SCORE - 0.01;
  for (const t of items) {
    const s = matchScore(asHit(t), want);
    if (s > score) [best, score] = [t, s];
  }
  return best;
}

export function imageType(b: Uint8Array): Cover["type"] | null {
  if (b.length < 1024) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

/** The first source that has a matching cover; null when none does. */
export async function findCover(http: Http, want: CoverWant): Promise<Cover | null> {
  const ref = want.ref ? parseRef(want.ref) : null;
  const finders: [string, () => Promise<string | null>][] = [];
  if (ref?.source === "netease") finders.push(["netease", () => fromNeteaseRef(http, ref.id)]);
  finders.push(["itunes", () => fromItunes(http, want)], ["netease", () => fromNeteaseSearch(http, want)]);
  for (const [from, find] of finders) {
    const url = await find().catch(() => null);
    const cover = url ? await downloadCover(http, url, from) : null;
    if (cover) return cover;
  }
  return null;
}

/** An image already chosen (a Spotify track's art, say); null unless it really is one. */
export async function downloadCover(http: Http, url: string, from: string): Promise<Cover | null> {
  const r = await http({ url }).catch(() => null);
  const type = r && r.status === 200 ? imageType(r.body) : null;
  return type ? { bytes: r!.body, type, from } : null;
}
