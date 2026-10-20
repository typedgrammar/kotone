// Adding a song: one search over Spotify's catalogue (what it will play as, with its album art) and
// the lyric sources LDDC uses. Each result comes with its lyrics already matched, preferring a timed
// version; adding saves the lyrics, the cover and the Spotify track together. A search opened from
// a library song (「下载完整歌词」) completes that song instead, keeping lines already annotated.

import { batch, createEffect, createMemo, createResource, createRoot, createSignal, For, Match, on, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { isAnnotated } from "../../../core/analyze.ts";
import { candidates, coverAt, lyricsFor, SURE, sure, type Candidate } from "../../../core/catalog.ts";
import { lyricKey, skeletonLines } from "../../../core/lrc.ts";
import {
  baseTitle,
  fetchLyrics,
  matchScore,
  refOf,
  sameTitle,
  searchLyrics,
  sourceNote,
  SOURCES,
  type FetchedLyrics,
  type SongHit,
} from "../../../core/lyrics/index.ts";
import type { Song } from "../../../core/types.ts";
import { bridge, type SongRecord } from "../bridge.ts";
import { label, lyricsErrorText, t } from "../i18n.ts";
import { app, type SearchSeed } from "../state.ts";
import { btn, err, muted, searchField, sectionLabel, view, viewHead, viewTitle, viewTools } from "../ui.ts";
import { IconMusic, IconSpotify } from "./icons.tsx";

interface Found {
  busy: boolean;
  list: Candidate[];
  spotifyFailed?: boolean;
  /** Every lyric source failed */
  lyricsFailed?: string;
}

interface LyricChoice {
  /** Every lyric hit that may be this song, best first */
  versions?: SongHit[];
  /** Still looking for the version to use */
  finding: boolean;
  /** The version picked automatically: a sure match, timed if any is */
  auto?: string | null;
  /** The version picked by hand */
  pick?: string;
}

const detail = "overflow-y-auto px-9 pt-7 pb-12 select-text";
const summary = `my-3.5 max-w-160 text-[14px]/[1.8] ${muted}`;
const fact = "inline-flex items-center gap-1 rounded-full bg-panel px-2 py-px text-[12px]";
const action = "flex items-baseline gap-3 text-[12.5px]";
// a paragraph keeps the browser's 1em margins it had before the reset
const para = "my-3.25";
const hitNote = "m-0 px-2 pt-0.5 pb-1 text-[11.5px] text-fg-3";
const groupLabel = "px-2 pt-3.5 pb-1 font-ui text-[11px]/[normal] font-semibold tracking-[0.06em] text-fg-3";

const fmt = (t?: number) => (t === undefined ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);

/**
 * The library song a result already is: the same Spotify track, or (for songs not yet heard on
 * Spotify, or results not from it) the same title and artist. A live take of a linked song is new.
 */
const inLibrary = (c: Candidate): SongRecord | undefined =>
  app
    .records()
    .find(
      (r) =>
        r.song &&
        (c.spotify && r.spotify
          ? r.spotify === c.spotify
          : matchScore({ title: r.song.title, artist: r.song.artist }, { title: c.title, artist: c.artist }) >= SURE),
    );

// kept outside the component so results survive switching views
const search = createRoot(() => {
  const [query, setQuery] = createSignal("");
  const [found, setFound] = createSignal<Found | null>(null);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [target, setTarget] = createSignal<string | null>(null);
  const [choice, setChoice] = createStore<Record<string, LyricChoice>>({});
  let seed: SearchSeed | null = null;
  let run = 0;

  const cache = new Map<string, Promise<FetchedLyrics>>();
  const fetchOnce = (ref: string) => {
    let p = cache.get(ref);
    if (!p) {
      p = fetchLyrics(bridge.http, ref);
      cache.set(ref, p);
      p.catch(() => cache.delete(ref));
    }
    return p;
  };

  const candidate = createMemo(() => found()?.list.find((c) => c.key === selected()));
  const chosen = createMemo(() => {
    const c = candidate();
    const ch = c && choice[c.key];
    return ch ? (ch.pick ?? ch.auto ?? null) : null;
  });
  const [preview] = createResource(chosen, fetchOnce);

  /** The song to complete: the one the search was opened from */
  const targetSong = createMemo(() => (target() ? app.songs().find((s) => s.id === target()) : undefined));

  /** Pick the lyrics for a result: the sure matches in order, the first timed one winning. */
  async function matchLyrics(c: Candidate) {
    if (choice[c.key]) return;
    setChoice(c.key, { finding: true });
    let versions = c.lyrics;
    if (!versions.some((h) => sure(h, c))) {
      // the query may not be how the lyric sites write it (romaji, an English title): ask them by name
      const r = await searchLyrics(bridge.http, `${baseTitle(c.title)} ${c.artist.split(" / ")[0]}`, { limit: 8 }).catch(() => null);
      versions = lyricsFor([...c.lyrics, ...(r?.hits ?? [])], c);
    }
    setChoice(c.key, { versions });
    let auto: string | undefined;
    for (const h of versions.filter((h) => sure(h, c)).slice(0, 3)) {
      const f = await fetchOnce(refOf(h)).catch(() => null);
      if (!f) continue;
      auto ??= refOf(h);
      if (f.synced) {
        auto = refOf(h);
        break;
      }
    }
    setChoice(c.key, { finding: false, auto: auto ?? null });
  }
  createEffect(on(candidate, (c) => c && void matchLyrics(c)));

  async function run_() {
    const q = query().trim();
    if (!q) return;
    const id = ++run;
    batch(() => {
      setFound({ busy: true, list: [] });
      setSelected(null);
    });
    const [tracks, lyrics] = await Promise.all([
      app.spotify.installed ? bridge.spotify.search(q).catch(() => null) : Promise.resolve([]),
      searchLyrics(bridge.http, q, { limit: 8 }),
    ]);
    if (id !== run) return;
    const list = candidates(tracks ?? [], lyrics.hits);
    const allFailed = lyrics.failed.length === SOURCES.length ? lyrics.failed[0] : undefined;
    setFound({
      busy: false,
      list,
      spotifyFailed: tracks === null,
      lyricsFailed: allFailed && lyricsErrorText(allFailed.cause ?? allFailed.error),
    });
    // completing a song: the result most like it; else Spotify's top result
    const s = targetSong();
    const best = s ? [...list].sort((a, b) => matchScore(b, s) - matchScore(a, s))[0] : list[0];
    if (best && !selected()) setSelected(best.key);
  }

  return {
    query,
    setQuery,
    found,
    candidate,
    selected,
    setSelected,
    choice,
    chosen,
    preview,
    targetSong,
    pick: (key: string, ref: string) => setChoice(key, { pick: ref }),
    run: run_,
    /** Apply a new seed from 「下载完整歌词」; the same seed again keeps the current results. */
    take(s: SearchSeed | null) {
      if (!s || s === seed) return;
      seed = s;
      batch(() => {
        setQuery(s.query);
        setTarget(s.target ?? null);
      });
      void run_();
    },
    clearTarget: () => setTarget(null),
  };
});

/** Album art, or a note glyph while there is none */
function Art(props: { src?: string; px: number; class: string }) {
  return (
    <span class={`grid flex-none place-items-center overflow-hidden bg-hover text-fg-3 ${props.class}`}>
      <Show when={props.src} fallback={<IconMusic />}>
        <img class="size-full object-cover" src={coverAt(props.src!, props.px)} alt="" loading="lazy" />
      </Show>
    </span>
  );
}

export function AddSong() {
  let input!: HTMLInputElement;
  onMount(() => search.take(app.searchSeed()));
  // every way in (the sidebar, the library, ⌘N) lands in the search box
  createEffect(
    on(app.searchFocus, () => {
      input.focus();
      input.select();
    }),
  );
  const found = () => search.found();
  const onSpotify = () => found()?.list.filter((c) => c.spotify) ?? [];
  const lyricsOnly = () => found()?.list.filter((c) => !c.spotify) ?? [];

  return (
    <div class={view}>
      <header class={viewHead}>
        <h2 class={viewTitle}>{t("search.title")}</h2>
        <form
          class={viewTools}
          onSubmit={(e) => {
            e.preventDefault();
            search.clearTarget();
            void search.run();
          }}
        >
          <input
            ref={input}
            class={searchField.replace("w-30", "w-72")}
            placeholder={t("search.placeholder")}
            value={search.query()}
            onInput={(e) => search.setQuery(e.currentTarget.value)}
          />
        </form>
      </header>
      <div class="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <nav class="min-w-0 overflow-y-auto border-r border-line px-2 pt-1 pb-6">
          <Switch fallback={<p class={`${para} px-2 py-3.5 ${muted}`}>{t("search.hint")}</p>}>
            <Match when={found()?.busy}>
              <div class={groupLabel}>{t("search.searching")}</div>
              <For each={[0, 1, 2, 3, 4, 5]}>
                {() => (
                  <div class="flex items-center gap-2.5 px-2 py-1.5">
                    <span class="size-10 flex-none animate-shimmer rounded-[5px] bg-[linear-gradient(100deg,var(--panel)_30%,var(--hover)_50%,var(--panel)_70%)] bg-size-[300%_100%]" />
                    <span class="grid flex-1 gap-1.5">
                      <i class="h-3 w-3/5 rounded bg-panel" />
                      <i class="h-2.5 w-2/5 rounded bg-panel" />
                    </span>
                  </div>
                )}
              </For>
            </Match>
            <Match when={found()}>
              {(f) => (
                <>
                  <Show when={f().spotifyFailed}>
                    <p class={`${hitNote} pt-3`}>{t("search.spotifyFailed")}</p>
                  </Show>
                  <Show when={f().lyricsFailed}>
                    <p class={`${hitNote} pt-3`}>{f().lyricsFailed}</p>
                  </Show>
                  <Show when={!f().list.length && !f().lyricsFailed}>
                    <p class={`${hitNote} pt-3`}>{t("search.noResults")}</p>
                  </Show>
                  <Show when={onSpotify().length}>
                    <div class={groupLabel}>Spotify</div>
                    <For each={onSpotify()}>{(c) => <Result c={c} />}</For>
                  </Show>
                  <Show when={lyricsOnly().length}>
                    <Show when={onSpotify().length || app.spotify.installed}>
                      <div class={groupLabel}>{t("search.lyricsOnly")}</div>
                    </Show>
                    <For each={lyricsOnly()}>{(c) => <Result c={c} />}</For>
                  </Show>
                </>
              )}
            </Match>
          </Switch>
        </nav>
        <Show when={search.candidate()} keyed fallback={<Intro />}>
          {(c) => <Detail c={c} />}
        </Show>
      </div>
    </div>
  );
}

function Result(props: { c: Candidate }) {
  const sel = () => search.selected() === props.c.key;
  return (
    <button
      class={`flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${sel() ? "bg-accent text-white" : "hover:bg-hover"}`}
      onClick={() => search.setSelected(props.c.key)}
    >
      <Art src={props.c.cover} px={120} class="size-10 rounded-[5px]" />
      <span class="flex min-w-0 flex-1 flex-col gap-px">
        <span class="truncate font-ja text-[14px]/[1.4]">{props.c.title}</span>
        <span class={`truncate text-[11.5px] ${sel() ? "text-white/80" : "text-fg-3"}`}>
          {[props.c.artist, fmt(props.c.duration)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Show when={inLibrary(props.c)}>
        <span class={`flex-none text-[11px] ${sel() ? "text-white/80" : "text-fg-3"}`}>{t("search.added")}</span>
      </Show>
    </button>
  );
}

function Intro() {
  return (
    <article class={detail}>
      <p class={summary}>{t("search.intro1")}</p>
      <p class={summary}>{t(app.spotify.installed ? "search.intro2" : "search.introNoSpotify")}</p>
      <p class={summary}>{t("search.localOnly")}</p>
    </article>
  );
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function Detail(props: { c: Candidate }) {
  const c = props.c;
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const choice = () => search.choice[c.key];
  const versions = () => choice()?.versions ?? c.lyrics;
  const finding = () => !choice() || choice()!.finding;
  const lyrics = () => (search.chosen() && search.preview.state === "ready" ? search.preview() : undefined);
  const existing = () => inLibrary(c);

  /** The library song these lyrics would complete: the one the search came from, or this one */
  const into = createMemo(() => {
    const s = search.targetSong();
    return s && sameTitle(s.title, c.title) ? s : existing()?.song;
  });
  // annotations come from every song in the library; the target's own lines win
  const plan = createMemo(() => {
    const f = lyrics();
    if (!f) return undefined;
    const others = app.songs().filter((s) => s.id !== into()?.id);
    const { lines, reused } = skeletonLines(f.lines, [...others.flatMap((s) => s.lines), ...(into()?.lines ?? [])]);
    const kept = new Set(lines.filter(isAnnotated).map((l) => lyricKey(l.ja)));
    const lost = (into()?.lines ?? []).filter((l) => isAnnotated(l) && !kept.has(lyricKey(l.ja))).length;
    return { lines, reused, lost };
  });

  async function save(mode: "new" | "merge") {
    const f = lyrics();
    const p = plan();
    if (!f || !p) return;
    let song: Song;
    if (mode === "merge" && into()) {
      const { excerpt: _excerpt, ...rest } = into()!;
      song = { ...rest, source: sourceNote(f), lines: p.lines };
    } else {
      const taken = new Set(app.records().map((r) => r.song?.id ?? r.id));
      const base = (/^[\x20-\x7e]+$/.test(c.title) && slug(c.title)) || `${f.source}-${f.ref.split(":")[1].slice(0, 12)}`;
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      song = { version: 1, id, title: c.title, artist: c.artist || f.artist || t("search.unknownArtist"), source: sourceNote(f), lines: p.lines };
    }
    setBusy(true);
    setError("");
    try {
      await app.saveSong(song, mode === "merge", f.ref, { spotify: c.spotify, cover: c.cover });
    } catch (e) {
      setError(lyricsErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article class={detail}>
      <div class="flex items-end gap-5.5">
        <Art
          src={c.cover}
          px={400}
          class="size-36 rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.12)] [&_svg]:size-9"
        />
        <div class="flex min-w-0 flex-col gap-0.5 pb-0.5">
          <h3 class="m-0 font-ja text-[26px]/[1.35] font-semibold">{c.title}</h3>
          <div class="text-[14px] text-fg-2">{c.artist}</div>
          <div class="mt-2.5 flex flex-wrap gap-1.5">
            <Show
              when={c.spotify}
              fallback={<span class={`${fact} text-fg-2`}>{t("search.notOnSpotify")}</span>}
            >
              <span class={`${fact} text-spotify [&_svg]:size-3.5`}>
                <IconSpotify /> {t("search.playsOnSpotify")}
              </span>
            </Show>
            <Show when={c.album && c.album !== c.title}>
              <span class={`${fact} text-fg-2`}>{c.album}</span>
            </Show>
            <Show when={c.duration}>
              <span class={`${fact} text-fg-2`}>{fmt(c.duration)}</span>
            </Show>
            <Switch>
              <Match when={lyrics()}>
                {(f) => (
                  <>
                    <span class={`${fact} text-fg-2`}>
                      {label.source(f().source, SOURCES.find((s) => s.id === f().source)!.zh)} · {t("search.lines", { n: f().lines.length })}
                    </span>
                    <span class={`${fact} ${f().synced ? "text-fg-2" : "text-n3"}`}>{t(f().synced ? "search.synced" : "search.unsynced")}</span>
                  </>
                )}
              </Match>
              <Match when={finding() || search.preview.loading}>
                <span class={`${fact} text-fg-3`}>{t("search.finding")}</span>
              </Match>
            </Switch>
          </div>
        </div>
      </div>

      <div class="mt-6 mb-5.5 grid gap-2">
        <Show
          when={into()}
          fallback={
            <div class={action}>
              <button class={btn({ primary: true })} disabled={busy() || !plan()} onClick={() => save("new")}>
                {t("search.new")}
              </button>
              <span class={muted}>
                {t(c.spotify ? "search.newDescSpotify" : "search.newDesc")}
                {plan()?.reused ? t("search.reusable", { n: plan()!.reused }) : ""}
              </span>
            </div>
          }
        >
          {(s) => (
            <>
              <div class={action}>
                <button
                  class={btn()}
                  onClick={() => {
                    app.openSong(s().id);
                    app.setView("lyrics");
                  }}
                >
                  {t("search.open")}
                </button>
                <span class={muted}>{t("search.inLibrary", { title: s().title })}</span>
              </div>
              <Show when={plan()}>
                {(p) => (
                  <div class={action}>
                    <button class={btn({ primary: !!search.targetSong() })} disabled={busy()} onClick={() => save("merge")}>
                      {t("search.complete", { title: s().title })}
                    </button>
                    <span class={muted}>
                      {t("search.completeDesc", { n: p().lines.length })}
                      {lyrics()?.synced ? t("search.completeTimed") : ""}
                      {p().reused ? t("search.keep", { n: p().reused }) : ""}
                      <Show when={p().lost}>
                        <span class="text-n3">{t("search.lost", { n: p().lost })}</span>
                      </Show>
                    </span>
                  </div>
                )}
              </Show>
            </>
          )}
        </Show>
        <Show when={search.preview.error}>
          <p class={`${para} ${err}`}>{lyricsErrorText(search.preview.error)}</p>
        </Show>
        <Show when={error()}>
          <p class={`${para} ${err}`}>{error()}</p>
        </Show>
      </div>

      <Show when={!finding()}>
        <Show when={versions().length} fallback={<p class={`${para} text-n3`}>{t("search.noLyrics")}</p>}>
          <section class="mb-6">
            <h4 class={sectionLabel}>{t("search.versions")}</h4>
            <Show when={!choice()?.auto && !choice()?.pick}>
              <p class={`mt-0 mb-2 text-[12.5px] ${muted}`}>{t("search.unsure")}</p>
            </Show>
            <div class="grid max-w-160 gap-px">
              <For each={versions()}>
                {(h) => (
                  <button
                    class={`grid grid-cols-[64px_minmax(0,1fr)_40px] items-baseline gap-2 rounded-md px-2 py-1 text-left text-[12.5px] ${
                      search.chosen() === refOf(h) ? "bg-sel" : "hover:bg-hover"
                    }`}
                    onClick={() => search.pick(c.key, refOf(h))}
                  >
                    <span class="text-fg-2">{label.source(h.source, SOURCES.find((s) => s.id === h.source)!.short, true)}</span>
                    <span class="truncate">
                      <span class="font-ja">{h.title}</span> <span class="text-fg-3">{h.artist}</span>
                    </span>
                    <span class="text-right text-fg-3 tabular-nums">{fmt(h.duration)}</span>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>
      </Show>

      <Show when={lyrics()}>
        {(f) => (
          <>
            <ol class="border-t border-line">
              <For each={plan()?.lines ?? []}>
                {(l) => (
                  <li class="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-2.5 border-b border-line py-1.75">
                    <span class="text-[11px] text-fg-3 tabular-nums">{fmt(l.time)}</span>
                    <div>
                      <div class="font-ja text-[16px]/[1.6]">{l.ja}</div>
                      <Show when={l.zh}>
                        <div class="font-zh text-[13px]/[1.5] text-fg-2">{l.zh}</div>
                      </Show>
                    </div>
                    <Show when={isAnnotated(l)}>
                      <span class="text-[11px] text-accent">{t("search.annotated")}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ol>
            <p class="mx-4 mt-7 mb-0 text-[12px] text-fg-3">{sourceNote(f())}</p>
          </>
        )}
      </Show>
    </article>
  );
}
