// Lyric search & download (the sources LDDC uses): results on the left, a preview on the right,
// then either a new library song or the current song completed with every line and its timing.
// Annotated lines with the same text are carried over, so nothing already explained is lost.

import { batch, createMemo, createResource, createRoot, createSignal, For, onMount, Show } from "solid-js";
import { isAnnotated } from "../../../core/analyze.ts";
import { lyricKey, skeletonLines } from "../../../core/lrc.ts";
import {
  errorText,
  fetchLyrics,
  matchScore,
  refOf,
  sameTitle,
  searchLyrics,
  sourceName,
  sourceNote,
  SOURCES,
  type FetchedLyrics,
  type SongHit,
  type SourceId,
} from "../../../core/lyrics/index.ts";
import type { Song } from "../../../core/types.ts";
import { bridge } from "../bridge.ts";
import { label, lyricsErrorText, t } from "../i18n.ts";
import { app, type SearchSeed } from "../state.ts";
import { btn, err, muted, searchField, view, viewHead, viewTitle, viewTools } from "../ui.ts";
import { Segmented } from "./controls.tsx";

interface SourceResult {
  busy: boolean;
  hits: SongHit[];
  error?: string;
}

// the outline-style split: source groups on the left, the chosen result on the right
const detail = "overflow-y-auto px-9 pt-6 pb-12 select-text";
const summary = `my-3.5 max-w-160 text-[14px]/[1.8] ${muted}`;
const fact = "rounded-full bg-panel px-2 py-px text-[12px]";
const action = "flex items-baseline gap-3 text-[12.5px]";
// a paragraph keeps the browser's 1em margins it had before the reset
const para = "my-3.25";
const hitNote = "m-0 px-2 pt-0.5 pb-1 text-[11.5px] text-fg-3";

const fmt = (t?: number) => (t === undefined ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);

// kept outside the component so results survive switching views
const search = createRoot(() => {
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<Partial<Record<SourceId, SourceResult>>>({});
  const [filter, setFilter] = createSignal<"all" | SourceId>("all");
  const [selected, setSelected] = createSignal<string | null>(null);
  const [target, setTarget] = createSignal<string | null>(null);
  let seed: SearchSeed | null = null;
  let run = 0;

  const cache = new Map<string, Promise<FetchedLyrics>>();
  const [preview] = createResource(selected, (ref) => {
    let p = cache.get(ref);
    if (!p) {
      p = fetchLyrics(bridge.http, ref);
      cache.set(ref, p);
      p.catch(() => cache.delete(ref));
    }
    return p;
  });

  /** The song to complete: the one the search was opened from, else the current one. */
  const targetSong = createMemo(() => app.songs().find((s) => s.id === (target() ?? app.currentId())));
  const want = () => {
    const s = targetSong();
    if (!s || !target()) return undefined;
    return { title: s.title, artist: s.artist, duration: app.playingId() === s.id ? app.duration() || undefined : undefined };
  };
  const ranked = (hits: SongHit[]) => {
    const w = want();
    return w ? [...hits].sort((a, b) => matchScore(b, w) - matchScore(a, w)) : hits;
  };

  async function run_() {
    const q = query().trim();
    if (!q) return;
    const id = ++run;
    batch(() => {
      setResults(Object.fromEntries(SOURCES.map((s) => [s.id, { busy: true, hits: [] }])));
      setSelected(null);
    });
    await Promise.all(
      SOURCES.map(async (s) => {
        const r = await searchLyrics(bridge.http, q, { sources: [s.id], limit: 8 });
        if (id === run)
          setResults((prev) => ({ ...prev, [s.id]: { busy: false, hits: ranked(r.hits), error: r.failed[0] ? lyricsErrorText(r.failed[0].cause ?? r.failed[0].error) : undefined } }));
      }),
    );
    if (id !== run || selected()) return;
    // preview the best candidate: by match score when completing a song, else the first source that answered
    const all = SOURCES.flatMap((s) => results()[s.id]?.hits ?? []);
    const best = ranked(all)[0];
    if (best) setSelected(refOf(best));
  }

  return {
    query,
    setQuery,
    results,
    filter,
    setFilter,
    selected,
    setSelected,
    preview,
    targetSong,
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

export function LyricsSearch() {
  let input!: HTMLInputElement;
  onMount(() => {
    search.take(app.searchSeed());
    if (!search.query()) input.focus();
  });
  const groups = () => SOURCES.filter((s) => search.filter() === "all" || search.filter() === s.id);
  const searched = () => Object.keys(search.results()).length > 0;

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
            class={searchField.replace("w-30", "w-55")}
            placeholder={t("search.placeholder")}
            value={search.query()}
            onInput={(e) => search.setQuery(e.currentTarget.value)}
          />
          <Segmented
            value={search.filter()}
            options={[["all", t("search.all")], ...SOURCES.map((s): ["all" | SourceId, string] => [s.id, label.source(s.id, s.short, true)])]}
            onChange={search.setFilter}
          />
        </form>
      </header>
      <div class="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)]">
        <nav class="min-w-0 overflow-y-auto border-r border-line px-2 pt-1 pb-6">
          <Show when={searched()} fallback={<p class={`${para} px-2 py-3.5 ${muted}`}>{t("search.hint")}</p>}>
            <For each={groups()}>
              {(s) => {
                const r = () => search.results()[s.id];
                return (
                  <>
                    <div class="px-2 pt-3.5 pb-1 font-ui text-[11px]/[normal] font-semibold tracking-[0.06em] text-fg-3">
                      {label.source(s.id, s.zh)}
                      <Show when={r()?.busy}>
                        <span class="ml-1.5 font-normal tracking-normal">{t("search.searching")}</span>
                      </Show>
                    </div>
                    <Show when={r()?.error}>
                      <p class={hitNote}>{r()!.error}</p>
                    </Show>
                    <Show when={r() && !r()!.busy && !r()!.error && !r()!.hits.length}>
                      <p class={hitNote}>{t("search.noResults")}</p>
                    </Show>
                    <For each={r()?.hits ?? []}>
                      {(h) => {
                        const sel = () => search.selected() === refOf(h);
                        return (
                          <button
                            class={`flex w-full min-w-0 flex-col items-baseline gap-px rounded-md px-2 py-1.5 text-left ${sel() ? "bg-accent text-white" : "hover:bg-hover"}`}
                            onClick={() => search.setSelected(refOf(h))}
                          >
                            <span class="block max-w-full truncate font-ja text-[14px]/[1.4]">{h.title}</span>
                            <span class={`block max-w-full truncate text-[11.5px] ${sel() ? "text-white/80" : "text-fg-3"}`}>
                              {[h.artist, h.album, fmt(h.duration)].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        );
                      }}
                    </For>
                  </>
                );
              }}
            </For>
          </Show>
        </nav>
        <Show when={search.selected()} fallback={<Intro />}>
          {(ref) => <Preview hitRef={ref()} />}
        </Show>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <article class={detail}>
      <p class={summary}>
        {t("search.intro1")} {t("search.intro2")}
      </p>
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

// (not `ref`: Solid treats a `ref` prop as an element ref)
function Preview(props: { hitRef: string }) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const hit = () => SOURCES.flatMap((s) => search.results()[s.id]?.hits ?? []).find((h) => refOf(h) === props.hitRef);
  const lyrics = () => (search.preview.state === "ready" ? search.preview() : undefined);
  const title = () => lyrics()?.title || hit()?.title || "";
  const artist = () => lyrics()?.artist || hit()?.artist || "";

  /** Only offer to complete a song when the download is the same song. */
  const into = createMemo(() => {
    const s = search.targetSong();
    return s && title() && sameTitle(s.title, title()) ? s : undefined;
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
      const base = (/^[\x20-\x7e]+$/.test(title()) && slug(title())) || `${f.source}-${f.ref.split(":")[1].slice(0, 12)}`;
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      song = { version: 1, id, title: title(), artist: artist() || t("search.unknownArtist"), source: sourceNote(f), lines: p.lines };
    }
    setBusy(true);
    setError("");
    try {
      await app.saveSong(song, mode === "merge", f.ref);
    } catch (e) {
      setError(lyricsErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article class={detail}>
      <div class="flex items-baseline gap-2.5">
        <h3 class="m-0 font-ja text-[26px]/[1.8] font-semibold">{title()}</h3>
        <span class="text-[14px] text-fg-2">{artist()}</span>
      </div>
      <div class="mt-0.5 mb-4.5 flex flex-wrap gap-1.5">
        <span class={`${fact} text-fg-2`}>{label.source(props.hitRef.split(":")[0] as SourceId, sourceName(props.hitRef.split(":")[0] as SourceId))}</span>
        <Show when={hit()?.album}>
          <span class={`${fact} text-fg-2`}>{hit()!.album}</span>
        </Show>
        <Show when={hit()?.duration}>
          <span class={`${fact} text-fg-2`}>{fmt(hit()!.duration)}</span>
        </Show>
        <Show when={lyrics()}>
          {(f) => (
            <>
              <span class={`${fact} text-fg-2`}>{t("search.lines", { n: f().lines.length })}</span>
              <span class={`${fact} ${f().synced ? "text-fg-2" : "text-n3"}`}>
                {t(f().synced ? "search.synced" : "search.unsynced")}
              </span>
            </>
          )}
        </Show>
      </div>

      <Show when={search.preview.loading}>
        <p class={`${para} ${muted}`}>{t("search.downloading")}</p>
      </Show>
      <Show when={search.preview.error}>
        <p class={`${para} ${err}`}>{lyricsErrorText(search.preview.error)}</p>
      </Show>

      <Show when={plan()}>
        {(p) => (
          <div class="mb-5.5 grid gap-2">
            <Show when={into()}>
              {(s) => (
                <div class={action}>
                  <button class={btn({ primary: true })} disabled={busy()} onClick={() => save("merge")}>
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
            <div class={action}>
              <button class={btn({ primary: !into() })} disabled={busy()} onClick={() => save("new")}>
                {t("search.new")}
              </button>
              <span class={muted}>
                {t("search.newDesc")}
                {p().reused ? t("search.reusable", { n: p().reused }) : ""}
              </span>
            </div>
            <Show when={error()}>
              <p class={`${para} ${err}`}>{error()}</p>
            </Show>
          </div>
        )}
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
