import { batch, createEffect, createMemo, createRoot, createSignal, on } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { coverAt } from "../../core/catalog.ts";
import { downloadCover, findCover } from "../../core/lyrics/cover.ts";
import { pickTrack, songForTrack } from "../../core/spotify.ts";
import type { Favorites, Line, Song } from "../../core/types.ts";
import { bridge, songJson, type SongRecord, type SpotifyState } from "./bridge.ts";
import { revealLine } from "./reveal.ts";

export type View = "library" | "lyrics" | "favorites" | "grammar" | "vocab" | "search";

/** Opens the song search with a query, and the library song the download should complete */
export interface SearchSeed {
  query: string;
  target?: string;
}

function persisted<T extends object>(key: string, initial: T) {
  let saved: Partial<T> = {};
  try {
    // settings saved under the app's former name (utayomi.*) carry over in the browser preview
    saved = JSON.parse(localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^kotone\./, "utayomi.")) ?? "{}");
  } catch {
    // unavailable storage: fall back to defaults
  }
  const [store, set] = createStore<T>({ ...initial, ...saved });
  const update = (patch: Partial<T>) => {
    set(patch as T);
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      // ignore
    }
  };
  return [store, update] as const;
}

export const app = createRoot(() => {
  const [records, setRecords] = createSignal<SongRecord[]>([]);
  const [currentId, setCurrentId] = createSignal<string | null>(null);
  const [view, setView] = createSignal<View>("lyrics");
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [grammarFocus, setGrammarFocus] = createSignal<string | null>(null);
  const [searchSeed, setSearchSeed] = createSignal<SearchSeed | null>(null);
  // bumped by every "add a song" entry, so the search box takes focus even when already showing
  const [searchFocus, setSearchFocus] = createSignal(0);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  bridge.onOpenSettings(() => setSettingsOpen(true));
  bridge.onAddSong(() => actions.addSong());
  const [settings, setSettings] = persisted("kotone.settings", {
    furigana: true,
    translation: true,
    scope: "favorites" as "favorites" | "all",
    lastSong: null as string | null,
    /** Codex "Fast" service tier for annotation (~2x speed, more quota) */
    codexFast: true,
    /** Where codex is; empty = the login shell's PATH */
    codexPath: "",
    /** UI language; "auto" follows the system */
    lang: "auto" as "auto" | "zh" | "en",
    /** Width of the line breakdown panel, px */
    breakdownWidth: 420,
  });
  const [favorites, setFavorites] = createStore<Favorites>({ version: 1, lines: [] });

  const songs = createMemo(() => records().flatMap((r) => (r.song ? [r.song] : [])));
  const current = createMemo(() => records().find((r) => r.id === currentId() || r.song?.id === currentId()));
  const favKeys = createMemo(() => new Set(favorites.lines.map((f) => `${f.songId}/${f.lineId}`)));
  const isFav = (songId: string, lineId: string) => favKeys().has(`${songId}/${lineId}`);

  // ---- playback: the Spotify app, or a linked local file as the fallback -------------------
  const [player, setPlayer] = createStore({
    loaded: null as string | null, // song id whose local audio is loaded
    playing: false,
    duration: 0,
    base: 0, // time at `at`
    at: 0, // performance.now() of the last native update
    error: "",
  });
  bridge.onEvent((e) => {
    if (e.type === "state") setPlayer({ playing: e.playing, duration: e.duration || player.duration, base: e.time, at: performance.now(), error: "" });
    else if (e.type === "ended") setPlayer({ playing: false });
    else setPlayer({ error: e.message, playing: false });
  });

  const [spotify, setSpotify] = createStore<SpotifyState & { at: number }>({ installed: false, running: false, at: 0 });
  /** Songs whose Spotify track is being looked up, or wasn't found */
  const [lookup, setLookup] = createStore<Record<string, "searching" | "missing" | undefined>>({});
  bridge.spotify.onState((s) => {
    const running = s.running && !s.error;
    setSpotify({
      installed: s.installed,
      running: s.running,
      error: s.error,
      state: running ? s.state : undefined,
      position: s.position ?? 0,
      trackId: running ? s.trackId : undefined,
      name: s.name,
      artist: s.artist,
      duration: s.duration,
      artwork: s.artwork,
      at: performance.now(),
    });
  });
  bridge.spotify.refresh();

  /** The library song Spotify is on, remembering the track the first time it's heard */
  const spotifySong = createMemo(() => {
    if (!spotify.running || !spotify.trackId) return null;
    const refs = records().flatMap((r) => (r.song ? [{ id: r.song.id, title: r.song.title, artist: r.song.artist, spotify: r.spotify }] : []));
    const track = { trackId: spotify.trackId, name: spotify.name ?? "", artist: spotify.artist ?? "", duration: spotify.duration };
    return songForTrack(refs, track);
  });
  const remember = (songId: string, uri: string) => {
    setRecords((rs) => rs.map((r) => (r.song?.id === songId ? { ...r, spotify: uri } : r)));
    void bridge.linkSpotify(songId, uri);
  };
  createEffect(
    on(spotifySong, (hit) => {
      if (hit && !hit.linked) remember(hit.id, spotify.trackId!);
    }),
  );

  /** The track a song plays as: remembered, or found in Spotify's catalogue (then remembered) */
  async function spotifyUri(rec: SongRecord | undefined): Promise<string | null> {
    const song = rec?.song;
    if (!song) return null;
    if (rec.spotify) return rec.spotify;
    if (lookup[song.id] === "searching") return null;
    setLookup(song.id, "searching");
    try {
      const track = pickTrack(await bridge.spotify.search(`${song.title} ${song.artist}`), song);
      setLookup(song.id, track ? undefined : "missing");
      if (track) remember(song.id, track.uri);
      return track?.uri ?? null;
    } catch {
      setLookup(song.id, undefined);
      return null;
    }
  }
  // look the current song up ahead of time so pressing play starts it at once
  createEffect(() => {
    const rec = current();
    if (spotify.installed && rec?.song && !rec.spotify && !lookup[rec.song.id]) void spotifyUri(rec);
  });
  // follow Spotify: a new track that's in the library becomes the current song
  createEffect(
    on(
      () => spotifySong()?.id,
      (id, prev) => {
        if (id && id !== prev && id !== currentId()) actions.openSong(id);
      },
      { defer: true },
    ),
  );

  /** Which source drives the lyrics: whatever is playing, else Spotify's song, else the loaded file */
  const source = createMemo<"spotify" | "file" | null>(() =>
    player.playing ? "file" : spotifySong() ? "spotify" : player.loaded ? "file" : null,
  );
  const playingId = () => (source() === "spotify" ? spotifySong()!.id : source() === "file" ? player.loaded : null);
  const playing = () => (source() === "spotify" ? spotify.state === "playing" : player.playing);
  const duration = () => (source() === "spotify" ? (spotify.duration ?? 0) : player.duration);

  const [tick, setTick] = createSignal(0);
  let raf = 0;
  const loop = () => {
    setTick(performance.now());
    raf = playing() ? requestAnimationFrame(loop) : 0;
  };
  createEffect(() => {
    if (playing() && !raf) raf = requestAnimationFrame(loop);
  });
  const time = createMemo(() => {
    tick();
    const [base, at, end] = source() === "spotify" ? [spotify.position ?? 0, spotify.at, spotify.duration] : [player.base, player.at, player.duration];
    return playing() ? Math.min(base + (performance.now() - at) / 1000, end || Infinity) : base;
  });

  async function ensureLoaded(rec: SongRecord | undefined) {
    if (!rec?.song || !rec.audio || player.loaded === rec.song.id) return;
    await bridge.load(rec.audio, { title: rec.song.title, artist: rec.song.artist });
    setPlayer({ loaded: rec.song.id, base: 0, at: performance.now(), duration: 0, playing: false, error: "" });
  }

  // ---- covers: found with the lyrics; songs without one get a try once per session -----------
  const [coverBusy, setCoverBusy] = createSignal<ReadonlySet<string>>(new Set());
  const coverTried = new Set<string>();
  // the lyrics' ref, as sourceNote() wrote it ("歌词来自网易云（netease:123）")
  const refIn = (source?: string) => source?.match(/\b(?:netease|qq|kugou|lrclib):[\w-]+/)?.[0];

  async function findCoverFor(song: Song, ref = refIn(song.source)) {
    if (coverTried.has(song.id)) return;
    coverTried.add(song.id);
    setCoverBusy((s) => new Set(s).add(song.id));
    try {
      const cover = await findCover(bridge.http, { title: song.title, artist: song.artist, ref });
      if (cover) {
        await bridge.saveCover(song.id, cover);
        await actions.refresh();
      }
    } catch {
      // offline or the library is read-only: the placeholder stays
    } finally {
      setCoverBusy((s) => {
        const next = new Set(s);
        next.delete(song.id);
        return next;
      });
    }
  }

  const actions = {
    async refresh() {
      const prev = new Map(records().map((r) => [r.id, r]));
      const list = (await bridge.listSongs()).map((r) => {
        const p = prev.get(r.id);
        return p && p.raw === r.raw && p.audio === r.audio && p.cover === r.cover ? p : r;
      });
      setRecords(list);
      if (!currentId() || !list.some((r) => (r.song?.id ?? r.id) === currentId())) {
        const pick = list.find((r) => r.song?.id === settings.lastSong) ?? list.find((r) => r.song);
        if (pick) actions.openSong(pick.song?.id ?? pick.id);
      }
    },
    openSong(id: string) {
      batch(() => {
        setCurrentId(id);
        setExpanded(null);
        setSettings({ lastSong: id });
      });
      void ensureLoaded(current());
    },
    jumpTo(songId: string, lineId: string) {
      batch(() => {
        if (currentId() !== songId) actions.openSong(songId);
        setView("lyrics");
        setExpanded(null);
      });
      // land the line near the top, then open its breakdown below it
      requestAnimationFrame(() => {
        revealLine(lineId, "start");
        setExpanded(lineId);
      });
    },
    openGrammar(id: string) {
      batch(() => {
        setGrammarFocus(id);
        setView("grammar");
      });
    },
    openSearch(seed: SearchSeed) {
      batch(() => {
        setSearchSeed(seed);
        setView("search");
      });
    },
    /** The song search, ready to type into */
    addSong() {
      batch(() => {
        setSettingsOpen(false);
        setView("search");
        setSearchFocus((n) => n + 1);
      });
    },
    /**
     * Write a song made from downloaded lyrics and show it. The Spotify track and album art the
     * search found go with it; without art, a cover is looked for in the background.
     */
    async saveSong(song: Song, overwrite: boolean, ref?: string, found: { spotify?: string; cover?: string } = {}) {
      await bridge.saveSong(song, overwrite);
      if (found.spotify) await bridge.linkSpotify(song.id, found.spotify);
      const had = records().find((r) => r.song?.id === song.id)?.cover;
      const art = found.cover && !had ? await downloadCover(bridge.http, coverAt(found.cover, 800), "search") : null;
      if (art) await bridge.saveCover(song.id, art).catch(() => {});
      await actions.refresh();
      batch(() => {
        actions.openSong(song.id);
        setView("lyrics");
      });
      const rec = records().find((r) => r.song?.id === song.id);
      if (!rec?.cover) {
        coverTried.delete(song.id);
        void findCoverFor(song, ref);
      }
    },
    /** Look for covers of songs that have none (one at a time, each once per session) */
    async fillCovers() {
      for (const r of records()) if (r.song && !r.cover) await findCoverFor(r.song);
    },
    /** Replace a song in place (keeping unchanged line objects) and write it to the library. */
    async updateSong(song: Song) {
      setRecords((rs) => rs.map((r) => ((r.song?.id ?? r.id) === song.id ? { ...r, song, raw: songJson(song), bundled: false } : r)));
      await bridge.saveSong(song, true);
    },
    toggleFav(song: Song, line: Line) {
      const key = `${song.id}/${line.id}`;
      setFavorites(
        produce((f) => {
          const i = f.lines.findIndex((x) => `${x.songId}/${x.lineId}` === key);
          if (i >= 0) f.lines.splice(i, 1);
          else f.lines.push({ songId: song.id, lineId: line.id, ja: line.ja, addedAt: new Date().toISOString() });
        }),
      );
      void bridge.saveFavorites(JSON.parse(JSON.stringify(favorites)));
    },
    async linkAudio() {
      const rec = current();
      if (!rec?.song) return;
      const audio = await bridge.pickAudio(rec.song.id);
      if (!audio) return;
      setRecords((rs) => rs.map((r) => (r === rec ? { ...r, audio } : r)));
      setPlayer({ loaded: null });
      if (spotify.state === "playing") bridge.spotify.pause();
      await ensureLoaded(current());
      bridge.play();
    },
    async togglePlay() {
      const rec = current();
      if (!rec?.song) return;
      if (source() === "spotify" && spotifySong()?.id === rec.song.id) return bridge.spotify.toggle();
      if (spotify.installed && lookup[rec.song.id] !== "missing") {
        const uri = await spotifyUri(rec);
        if (uri) {
          if (player.playing) bridge.pause();
          return bridge.spotify.play(uri);
        }
      }
      if (rec.audio) {
        await ensureLoaded(rec);
        if (player.playing) return bridge.pause();
        if (spotify.state === "playing") bridge.spotify.pause();
        return bridge.play();
      }
      // found nowhere on Spotify: the player bar offers a local file instead
      if (!spotify.installed) return actions.linkAudio();
    },
    async seek(t: number, play = false) {
      const rec = current();
      t = Math.max(0, t);
      if (source() === "spotify" && spotifySong()?.id === rec?.song?.id) {
        bridge.spotify.seek(t);
        setSpotify({ position: t, at: performance.now() });
        if (play && spotify.state !== "playing") bridge.spotify.toggle();
        return;
      }
      const uri = spotify.installed && rec?.song && lookup[rec.song.id] !== "missing" ? await spotifyUri(rec) : null;
      if (uri) {
        if (player.playing) bridge.pause();
        return bridge.spotify.play(uri, t);
      }
      if (!rec?.audio) return actions.togglePlay();
      await ensureLoaded(rec);
      bridge.seek(t);
      setPlayer({ base: t, at: performance.now() });
      if (play && !player.playing) {
        if (spotify.state === "playing") bridge.spotify.pause();
        bridge.play();
      }
    },
  };

  void bridge.loadFavorites().then((f) => f && setFavorites(f));

  return {
    records,
    songs,
    current,
    currentId,
    view,
    setView,
    expanded,
    setExpanded,
    grammarFocus,
    setGrammarFocus,
    searchSeed,
    searchFocus,
    settingsOpen,
    setSettingsOpen,
    settings,
    setSettings,
    favorites,
    isFav,
    coverBusy,
    player,
    spotify,
    spotifySong,
    spotifyLookup: lookup,
    source,
    playingId,
    playing,
    duration,
    time,
    ...actions,
  };
});
