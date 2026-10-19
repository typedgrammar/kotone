import { batch, createMemo, createRoot, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { Favorites, Line, Song } from "../../core/types.ts";
import { bridge, songJson, type SongRecord } from "./bridge.ts";

export type View = "lyrics" | "favorites" | "grammar" | "vocab" | "search";

/** Opens the lyric search with a query, and the song the download should complete */
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
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  bridge.onOpenSettings(() => setSettingsOpen(true));
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
  });
  const [favorites, setFavorites] = createStore<Favorites>({ version: 1, lines: [] });

  const songs = createMemo(() => records().flatMap((r) => (r.song ? [r.song] : [])));
  const current = createMemo(() => records().find((r) => r.id === currentId() || r.song?.id === currentId()));
  const favKeys = createMemo(() => new Set(favorites.lines.map((f) => `${f.songId}/${f.lineId}`)));
  const isFav = (songId: string, lineId: string) => favKeys().has(`${songId}/${lineId}`);

  // ---- playback ----------------------------------------------------------------------
  const [player, setPlayer] = createStore({
    loaded: null as string | null, // song id whose audio is loaded
    playing: false,
    duration: 0,
    base: 0, // time at `at`
    at: 0, // performance.now() of the last native update
    error: "",
  });
  const [tick, setTick] = createSignal(0);
  let raf = 0;
  const loop = () => {
    setTick(performance.now());
    raf = player.playing ? requestAnimationFrame(loop) : 0;
  };
  const time = createMemo(() => {
    tick();
    return player.playing ? Math.min(player.base + (performance.now() - player.at) / 1000, player.duration || Infinity) : player.base;
  });
  bridge.onEvent((e) => {
    if (e.type === "state") {
      setPlayer({ playing: e.playing, duration: e.duration || player.duration, base: e.time, at: performance.now(), error: "" });
      if (e.playing && !raf) raf = requestAnimationFrame(loop);
    } else if (e.type === "ended") setPlayer({ playing: false });
    else setPlayer({ error: e.message, playing: false });
  });

  async function ensureLoaded(rec: SongRecord | undefined) {
    if (!rec?.song || !rec.audio || player.loaded === rec.song.id) return;
    await bridge.load(rec.audio, { title: rec.song.title, artist: rec.song.artist });
    setPlayer({ loaded: rec.song.id, base: 0, at: performance.now(), duration: 0, playing: false, error: "" });
  }

  const actions = {
    async refresh() {
      const prev = new Map(records().map((r) => [r.id, r]));
      const list = (await bridge.listSongs()).map((r) => {
        const p = prev.get(r.id);
        return p && p.raw === r.raw && p.audio === r.audio ? p : r;
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
        setExpanded(lineId);
      });
      requestAnimationFrame(() =>
        document.getElementById(`line-${lineId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
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
    /** Write a song made from downloaded lyrics and show it */
    async saveSong(song: Song, overwrite: boolean) {
      await bridge.saveSong(song, overwrite);
      await actions.refresh();
      batch(() => {
        actions.openSong(song.id);
        setView("lyrics");
      });
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
      await ensureLoaded(current());
      bridge.play();
    },
    async togglePlay() {
      const rec = current();
      if (!rec?.audio) return void actions.linkAudio();
      await ensureLoaded(rec);
      if (player.playing) bridge.pause();
      else bridge.play();
    },
    async seek(t: number, play = false) {
      await ensureLoaded(current());
      bridge.seek(Math.max(0, t));
      setPlayer({ base: Math.max(0, t), at: performance.now() });
      if (play && !player.playing) bridge.play();
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
    settingsOpen,
    setSettingsOpen,
    settings,
    setSettings,
    favorites,
    isFav,
    player,
    time,
    ...actions,
  };
});
