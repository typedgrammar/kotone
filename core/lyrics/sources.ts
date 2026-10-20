// One provider per service. Protocol details follow what LDDC uses, re-implemented here; every
// source is asked for line-level original lyrics only (no translation, no romanization), which
// also keeps QQ Music's encrypted QRC out of the way.

import { parseLyrics, type LrcLine } from "../lrc.ts";
import { LyricsError, type Http, type HttpResponse, type Provider, type RawLyrics, type SongHit, type SourceId } from "./index.ts";

const utf8 = new TextDecoder();

export function json<T>(r: HttpResponse, what: string): T {
  if (r.status === 404) throw new LyricsError("notFound", `${what}：没有找到`);
  if (r.status >= 400) throw new LyricsError("http", `${what}：请求失败（HTTP ${r.status}）`, { status: r.status });
  try {
    return JSON.parse(utf8.decode(r.body)) as T;
  } catch {
    throw new LyricsError("json", `${what}：返回的不是 JSON`);
  }
}

export const qs = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

export const base64ToBytes = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const base64Text = (s: string) => utf8.decode(base64ToBytes(s));

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const hit = (source: SourceId, h: Omit<SongHit, "source">): SongHit => ({ source, ...h });
const joinArtists = (names: (string | undefined)[]) => names.filter(Boolean).join(" / ");

// ---- NetEase Cloud Music: the public web API answers without eapi encryption ----------------

export const NE_HEADERS = {
  referer: "https://music.163.com/",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
};

export interface NeSong {
  id: number;
  name: string;
  ar?: { name: string }[];
  artists?: { name: string }[];
  al?: { name: string; picUrl?: string };
  album?: { name: string; picUrl?: string };
  dt?: number;
  duration?: number;
}

const netease: Provider = {
  async search(http, query, limit) {
    const url = `https://music.163.com/api/cloudsearch/pc?${qs({ s: query, type: 1, limit, offset: 0 })}`;
    const j = json<{ code: number; result?: { songs?: NeSong[] } }>(await http({ url, headers: NE_HEADERS }), "网易云搜索");
    if (j.code !== 200) throw new LyricsError("api", `网易云搜索：错误码 ${j.code}`, { code: j.code });
    return (j.result?.songs ?? []).map((s) =>
      hit("netease", {
        id: String(s.id),
        title: s.name,
        artist: joinArtists((s.ar ?? []).map((a) => a.name)),
        album: s.al?.name,
        duration: (s.dt ?? 0) / 1000,
        cover: s.al?.picUrl || undefined,
      }),
    );
  },
  async fetch(http, id) {
    const [lyric, detail] = await Promise.all([
      http({ url: `https://music.163.com/api/song/lyric?${qs({ id, lv: -1 })}`, headers: NE_HEADERS }).then((r) =>
        json<{ code: number; lrc?: { lyric?: string } }>(r, "网易云歌词"),
      ),
      http({ url: `https://music.163.com/api/song/detail/?ids=%5B${encodeURIComponent(id)}%5D`, headers: NE_HEADERS })
        .then((r) => json<{ songs?: NeSong[] }>(r, "网易云歌曲信息").songs?.[0])
        .catch(() => undefined),
    ]);
    if (lyric.code !== 200) throw new LyricsError("api", `网易云歌词：错误码 ${lyric.code}`, { code: lyric.code });
    // credits sometimes arrive as JSON lines: {"t":0,"c":[{"tx":"作词: "},{"tx":"…"}]}
    const credits: string[] = [];
    const src = (lyric.lrc?.lyric ?? "")
      .split("\n")
      .filter((l) => {
        if (!l.startsWith("{")) return true;
        try {
          credits.push((JSON.parse(l) as { c: { tx: string }[] }).c.map((c) => c.tx).join("").trim());
        } catch {
          // not a credit line after all
        }
        return false;
      })
      .join("\n");
    return {
      title: detail?.name,
      artist: detail && joinArtists((detail.ar ?? detail.artists ?? []).map((a) => a.name)),
      lines: parseLyrics(src).lines,
      credits: credits.filter(Boolean),
    };
  },
};

// ---- QQ Music: musicu.fcg JSON RPC; search needs an anonymous session ------------------------

const QQ_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const QQ_HEADERS = { "content-type": "application/json", cookie: "tmeLoginType=-1;", "user-agent": "okhttp/3.14.9" };
const QQ_COMM = { ct: 11, cv: "1003006", v: "1003006", tmeAppID: "qqmusiclight", nettype: "NETWORK_WIFI", udid: "0" };
let qqSession: Promise<Record<string, unknown>> | undefined;

async function qq<T>(http: Http, method: string, module: string, param: Record<string, unknown>, comm: Record<string, unknown> = QQ_COMM) {
  const body = JSON.stringify({ comm, request: { method, module, param } });
  const r = json<{ code: number; request?: { code: number; data: T } }>(await http({ url: QQ_URL, method: "POST", headers: QQ_HEADERS, body }), "QQ音乐");
  const code = r.code || r.request?.code;
  if (code || !r.request) throw new LyricsError("api", `QQ音乐：错误码 ${code}`, { code: code ?? "?" });
  return r.request.data;
}

function qqComm(http: Http) {
  if (!qqSession) {
    qqSession = qq<{ session: { uid: string; sid: string; userip: string } }>(http, "GetSession", "music.getSession.session", {
      caller: 0,
      uid: "0",
      vkey: 0,
    }).then(({ session }) => ({ ...QQ_COMM, uid: session.uid, sid: session.sid, userip: session.userip }));
    qqSession.catch(() => (qqSession = undefined));
  }
  return qqSession;
}

// the client's own search id shape: random high bits + milliseconds since midnight
const qqSearchId = () =>
  String(
    BigInt(1 + Math.floor(Math.random() * 20)) * 18014398509481984n +
      BigInt(Math.floor(Math.random() * 4194304)) * 4294967296n +
      BigInt(Date.now() % 86400000),
  );

interface QqSong {
  id: number;
  name?: string;
  title: string;
  singer: { name: string }[];
  album?: { name: string };
  interval: number;
}

/** The web search box's suggestions: no session, no duration, a handful of songs — a fallback. */
async function qqSuggest(http: Http, query: string): Promise<SongHit[]> {
  const url = `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?${qs({ format: "json", key: query })}`;
  const j = json<{ data?: { song?: { itemlist?: { id: string; name: string; singer: string }[] } } }>(
    await http({ url, headers: { referer: "https://y.qq.com/", "user-agent": NE_HEADERS["user-agent"] } }),
    "QQ音乐搜索",
  );
  return (j.data?.song?.itemlist ?? []).map((s) => hit("qq", { id: String(s.id), title: s.name, artist: s.singer }));
}

const qqMusic: Provider = {
  async search(http, query, limit) {
    const param = { search_id: qqSearchId(), query, search_type: 0, num_per_page: limit, page_num: 1, highlight: 0, nqc_flag: 0, page_id: 1, grp: 1 };
    const run = async () =>
      qq<{ body?: { item_song?: QqSong[]; song?: { list?: QqSong[] } } }>(http, "DoSearchForQQMusicDesktop", "music.search.SearchCgiService", param, await qqComm(http));
    try {
      const data = await run().catch(() => ((qqSession = undefined), run())); // the session may have expired
      return (data.body?.item_song ?? data.body?.song?.list ?? []).map((s) =>
        hit("qq", { id: String(s.id), title: s.name || s.title, artist: joinArtists(s.singer.map((a) => a.name)), album: s.album?.name || undefined, duration: s.interval }),
      );
    } catch (e) {
      // full search is rate-limited now and then (错误码 2001); suggestions still find the song id
      const hits = await qqSuggest(http, query).catch(() => []);
      if (!hits.length) throw e;
      return hits;
    }
  },
  async fetch(http, id) {
    // qrc: 0 + crypt: 0 asks for plain base64 LRC instead of the triple-DES-encrypted QRC
    const d = await qq<{ lyric?: string }>(http, "GetPlayLyricInfo", "music.musichallSong.PlayLyricInfo", {
      songID: Number(id),
      qrc: 0,
      crypt: 0,
      trans: 0,
      roma: 0,
      ct: 19,
      cv: 2111,
    });
    const orig = parseLyrics(d.lyric ? base64Text(d.lyric) : "");
    return { title: orig.meta.ti, artist: orig.meta.ar, lines: orig.lines };
  },
};

// ---- Kugou: lyric candidates by file hash, then KRC (XOR + zlib) ------------------------------

const KRC_KEY = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];

/** KRC files: "krc1", then zlib data XOR-ed with a fixed 16-byte key. */
export async function decodeKrc(data: Uint8Array): Promise<string> {
  return utf8.decode(await inflate(data.subarray(4).map((b, i) => b ^ KRC_KEY[i % KRC_KEY.length])));
}

/** `[start,duration]<offset,duration,0>字…` lines. The `[language:]` tag (translation, romaji) is ignored. */
export function parseKrc(src: string): RawLyrics {
  const meta: Record<string, string> = {};
  const lines: LrcLine[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const tag = /^\[([a-z]+):(.*)\]$/i.exec(line);
    if (tag) meta[tag[1].toLowerCase()] = tag[2];
    const m = /^\[(\d+),(\d+)\](.*)$/.exec(line);
    if (m) lines.push({ time: Number(m[1]) / 1000, text: m[3].replace(/<\d+,\d+,\d+>/g, "").trim() });
  }
  return { title: meta.ti, artist: meta.ar, lines: lines.filter((l) => l.text) };
}

const kugou: Provider = {
  async search(http, query, limit) {
    const url = `https://mobiles.kugou.com/api/v3/search/song?${qs({ format: "json", keyword: query, page: 1, pagesize: limit, showtype: 1 })}`;
    const j = json<{ data?: { info?: { hash: string; songname: string; singername: string; album_name?: string; duration: number }[] } }>(
      await http({ url }),
      "酷狗搜索",
    );
    const strip = (s: string) => s.replace(/<\/?em>/g, "");
    return (j.data?.info ?? []).map((s) =>
      hit("kugou", { id: s.hash.toLowerCase(), title: strip(s.songname), artist: strip(s.singername), album: s.album_name || undefined, duration: s.duration }),
    );
  },
  async fetch(http, id) {
    const found = json<{ candidates?: { id: string; accesskey: string }[] }>(
      await http({ url: `https://lyrics.kugou.com/search?${qs({ ver: 1, man: "yes", client: "pc", hash: id })}` }),
      "酷狗歌词",
    );
    const c = found.candidates?.[0];
    if (!c) return { lines: [] };
    const dl = json<{ content?: string; contenttype?: number }>(
      await http({ url: `https://lyrics.kugou.com/download?${qs({ ver: 1, client: "pc", id: c.id, accesskey: c.accesskey, fmt: "krc", charset: "utf8" })}` }),
      "酷狗歌词",
    );
    if (!dl.content) return { lines: [] };
    if (dl.contenttype === 2) return { lines: parseLyrics(base64Text(dl.content)).lines }; // plain text
    return parseKrc(await decodeKrc(base64ToBytes(dl.content)));
  },
};

// ---- LRCLIB: open, community-run, no translations --------------------------------------------

const LRCLIB_HEADERS = { "user-agent": "Kotone (a lyrics player for learning Japanese)" };

interface LrclibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

const lrclib: Provider = {
  async search(http, query, limit) {
    const list = json<LrclibTrack[]>(await http({ url: `https://lrclib.net/api/search?${qs({ q: query })}`, headers: LRCLIB_HEADERS }), "LRCLIB 搜索");
    return list
      .filter((t) => !t.instrumental && (t.syncedLyrics || t.plainLyrics))
      .slice(0, limit)
      .map((t) => hit("lrclib", { id: String(t.id), title: t.trackName, artist: t.artistName, album: t.albumName || undefined, duration: t.duration }));
  },
  async fetch(http, id) {
    const t = json<LrclibTrack>(await http({ url: `https://lrclib.net/api/get/${encodeURIComponent(id)}`, headers: LRCLIB_HEADERS }), "LRCLIB");
    return { title: t.trackName, artist: t.artistName, lines: parseLyrics(t.syncedLyrics || t.plainLyrics || "").lines };
  },
};

export const PROVIDERS: Record<SourceId, Provider> = { netease, qq: qqMusic, kugou, lrclib };
