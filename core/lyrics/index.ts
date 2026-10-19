// Lyric search & download from the services LDDC (github.com/chenmozhijin/LDDC) supports:
// NetEase Cloud Music, QQ Music, Kugou and LRCLIB. Shared by `kotone lyrics` and the app.
// The HTTP transport is injected (Node fetch, the native bridge, the dev-server proxy) because
// these APIs need headers a browser page can't send. Only the original lyrics and their line
// timing are fetched: platform translations are never requested or kept — every `zh` in a song
// is written by the annotating agent.

import { lyricKey, type LrcLine } from "../lrc.ts";
import { PROVIDERS } from "./sources.ts";

export type SourceId = "netease" | "qq" | "kugou" | "lrclib";

export const SOURCES: { id: SourceId; zh: string; short: string }[] = [
  { id: "netease", zh: "网易云音乐", short: "网易云" },
  { id: "qq", zh: "QQ音乐", short: "QQ音乐" },
  { id: "kugou", zh: "酷狗音乐", short: "酷狗" },
  { id: "lrclib", zh: "LRCLIB", short: "LRCLIB" },
];
export const sourceName = (id: SourceId): string => SOURCES.find((s) => s.id === id)?.zh ?? id;

/** Hosts the providers talk to; the native bridge and the dev proxy refuse anything else. */
export const LYRIC_HOSTS = ["music.163.com", "u.y.qq.com", "c.y.qq.com", "mobiles.kugou.com", "lyrics.kugou.com", "lrclib.net"];

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}
export interface HttpResponse {
  status: number;
  body: Uint8Array;
}
export type Http = (req: HttpRequest) => Promise<HttpResponse>;

/** For Node (the CLI and the dev server), where fetch may send any header. */
export const fetchHttp: Http = async (req) => {
  const res = await fetch(req.url, { method: req.method ?? "GET", headers: req.headers, body: req.body, signal: AbortSignal.timeout(15_000) });
  return { status: res.status, body: new Uint8Array(await res.arrayBuffer()) };
};

export interface SongHit {
  source: SourceId;
  /** Enough on its own to fetch the lyrics; `${source}:${id}` is the ref the CLI prints */
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** Seconds */
  duration?: number;
}

/** What a provider returns before cleanup. */
export interface RawLyrics {
  title?: string;
  artist?: string;
  lines: LrcLine[];
  credits?: string[];
}

export interface FetchedLyrics {
  ref: string;
  source: SourceId;
  title?: string;
  artist?: string;
  lines: LrcLine[];
  synced: boolean;
  /** 作词/作曲… lines taken out of the lyrics */
  credits: string[];
}

export interface Provider {
  search(http: Http, query: string, limit: number): Promise<SongHit[]>;
  fetch(http: Http, id: string): Promise<RawLyrics>;
}

export const refOf = (h: { source: SourceId; id: string }): string => `${h.source}:${h.id}`;

export function parseRef(ref: string): { source: SourceId; id: string } | null {
  const m = /^(netease|qq|kugou|lrclib):(\S+)$/.exec(ref.trim());
  return m ? { source: m[1] as SourceId, id: m[2] } : null;
}

export async function searchLyrics(
  http: Http,
  query: string,
  { sources = SOURCES.map((s) => s.id), limit = 10 }: { sources?: SourceId[]; limit?: number } = {},
): Promise<{ hits: SongHit[]; failed: { source: SourceId; error: string; cause?: unknown }[] }> {
  const settled = await Promise.allSettled(sources.map((s) => PROVIDERS[s].search(http, query, limit)));
  const hits: SongHit[] = [];
  const failed: { source: SourceId; error: string; cause?: unknown }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") hits.push(...r.value.slice(0, limit));
    else failed.push({ source: sources[i], error: errorText(r.reason), cause: r.reason });
  });
  return { hits, failed };
}

export async function fetchLyrics(http: Http, ref: string): Promise<FetchedLyrics> {
  const parsed = parseRef(ref);
  if (!parsed) throw new LyricsError("badRef", `「${ref}」不是歌词引用（形如 netease:1409311773 / qq:… / kugou:… / lrclib:…）`, { ref });
  const raw = await PROVIDERS[parsed.source].fetch(http, parsed.id);
  const { lines, credits } = cleanLines(raw.lines, raw);
  if (!lines.length) throw new LyricsError("noLyrics", `${sourceName(parsed.source)}没有这首歌的歌词`, { source: parsed.source });
  return {
    ref: refOf(parsed),
    source: parsed.source,
    title: raw.title,
    artist: raw.artist,
    lines,
    synced: lines.every((l) => l.time !== undefined),
    credits: [...(raw.credits ?? []), ...credits],
  };
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A failure the UI can word in its own language; `message` is the Chinese text the CLI prints. */
export class LyricsError extends Error {
  code: "notFound" | "http" | "json" | "api" | "noLyrics" | "badRef";
  params: Record<string, string | number>;
  constructor(code: LyricsError["code"], message: string, params: Record<string, string | number> = {}) {
    super(message);
    this.code = code;
    this.params = params;
  }
}

// ---- cleanup ---------------------------------------------------------------------------

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CREDIT_WORDS =
  /作[词詞]|^[词詞]$|作曲|^曲$|[编編]曲|制作|製作|[监監][制修]|混音|母带|[录錄]音|和声|吉他|贝斯|鼓|[键鍵]盘|弦|翻[译譯]|^[译譯]|演唱|原唱|歌手|出品|[发發]行|企[划劃]|[统統]筹|lyric|music|compos|arrang|produc|vocal|mix|master|guitar|bass|drum|keyboard|piano|string|\b[os]p\b/i;

/** 「作词：Ayase」「Composer: …」 — a short label without kana, a colon, then a name. */
function isCredit(text: string): boolean {
  const m = /^\s*([^:：]{1,16}?)\s*[:：]\s*\S/.exec(text);
  return !!m && !KANA.test(m[1]) && CREDIT_WORDS.test(m[1].trim());
}

const plain = (s: string) => lyricKey(s).replace(/[-‐–—_/|]/g, "").toLowerCase();

/** Drop credit lines and the 「曲名 - 歌手」 header many sources put before the lyrics. */
export function cleanLines(lines: LrcLine[], meta: { title?: string; artist?: string } = {}): { lines: LrcLine[]; credits: string[] } {
  const credits: string[] = [];
  const title = meta.title ? plain(baseTitle(meta.title)) : "";
  const artist = meta.artist ? plain(meta.artist.split(/[/、,&]/)[0]) : "";
  const out: LrcLine[] = [];
  for (const l of lines) {
    if (isCredit(l.text)) {
      credits.push(l.text.trim());
      continue;
    }
    const p = plain(l.text);
    if (!out.length && title && p.includes(title) && (!artist || p.includes(artist)) && p.length <= title.length + artist.length + 4) continue;
    out.push(l);
  }
  return { lines: out, credits };
}

// ---- matching --------------------------------------------------------------------------

/** 「夜に駆ける (向夜晚奔去)」「… - From THE FIRST TAKE」 → 「夜に駆ける」 */
export const baseTitle = (s: string): string =>
  s
    .replace(/\s*[(（[【].*?[)）\]】]\s*/g, " ")
    .replace(/\s+[-–—~〜]\s+.*$/, "")
    .trim();

/** How well a search hit fits the song we want: same base title, shared artist, close duration. */
export function matchScore(hit: SongHit, want: { title?: string; artist?: string; duration?: number }): number {
  let score = 0;
  if (want.title) {
    const a = plain(baseTitle(hit.title));
    const b = plain(baseTitle(want.title));
    // the title outweighs artist + duration together: a different song never wins on timing
    if (a === b) score += plain(hit.title) === plain(want.title) ? 6.5 : 6;
    else if (a && b && (a.includes(b) || b.includes(a))) score += 2;
  }
  if (want.artist) {
    const names = (s: string) => s.split(/\s*(?:[/、,&]|feat\.?|ft\.)\s*/i).map(plain).filter(Boolean);
    const theirs = names(hit.artist);
    if (names(want.artist).some((n) => theirs.includes(n))) score += 2;
  }
  if (want.duration && hit.duration) {
    const d = Math.abs(want.duration - hit.duration);
    score += d <= 2 ? 2 : d <= 5 ? 1 : d > 20 ? -1 : 0;
  }
  return score;
}

/** Same song by title, ignoring version suffixes and translated aliases. */
export const sameTitle = (a: string, b: string): boolean => plain(baseTitle(a)) === plain(baseTitle(b));

// ---- output ----------------------------------------------------------------------------

const stamp = (t: number) => {
  const cs = Math.round(t * 100);
  return `[${String(Math.floor(cs / 6000)).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}]`;
};

export function toLrc(f: FetchedLyrics): string {
  const head = [f.title && `[ti:${f.title}]`, f.artist && `[ar:${f.artist}]`, `[re:${f.ref}]`].filter(Boolean);
  const body = f.lines.map((l) => (l.time !== undefined ? stamp(l.time) : "") + l.text);
  return [...head, ...body].join("\n") + "\n";
}

/** A human-readable `song.source`: the credits plus where the lyrics came from. */
export function sourceNote(f: FetchedLyrics): string {
  const from = `歌词来自${sourceName(f.source)}（${f.ref}）`;
  return [...new Set(f.credits)].concat(from).join(" · ");
}
