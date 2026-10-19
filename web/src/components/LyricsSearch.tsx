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
import { Segmented } from "./Outline.tsx";

interface SourceResult {
  busy: boolean;
  hits: SongHit[];
  error?: string;
}

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
    return { title: s.title, artist: s.artist, duration: app.player.loaded === s.id ? app.player.duration || undefined : undefined };
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
    <div class="outline-view">
      <header class="view-head">
        <h2>{t("search.title")}</h2>
        <form
          class="view-tools"
          onSubmit={(e) => {
            e.preventDefault();
            search.clearTarget();
            void search.run();
          }}
        >
          <input
            ref={input}
            class="search wide"
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
      <div class="split hits-split">
        <nav class="outline">
          <Show when={searched()} fallback={<p class="muted hint">{t("search.hint")}</p>}>
            <For each={groups()}>
              {(s) => {
                const r = () => search.results()[s.id];
                return (
                  <>
                    <div class="cat">
                      {label.source(s.id, s.zh)}
                      <Show when={r()?.busy}>
                        <span class="cat-state">{t("search.searching")}</span>
                      </Show>
                    </div>
                    <Show when={r()?.error}>
                      <p class="hit-error">{r()!.error}</p>
                    </Show>
                    <Show when={r() && !r()!.busy && !r()!.error && !r()!.hits.length}>
                      <p class="hit-error">{t("search.noResults")}</p>
                    </Show>
                    <For each={r()?.hits ?? []}>
                      {(h) => (
                        <button class="point hit" classList={{ sel: search.selected() === refOf(h) }} onClick={() => search.setSelected(refOf(h))}>
                          <span class="h-title">{h.title}</span>
                          <span class="h-sub">{[h.artist, h.album, fmt(h.duration)].filter(Boolean).join(" · ")}</span>
                        </button>
                      )}
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
    <article class="point-detail">
      <p class="summary muted">
        {t("search.intro1")} {t("search.intro2")}
      </p>
      <p class="summary muted">{t("search.localOnly")}</p>
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
      await app.saveSong(song, mode === "merge");
    } catch (e) {
      setError(lyricsErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article class="point-detail lyric-preview">
      <div class="pd-head">
        <h3>{title()}</h3>
        <span class="pd-zh">{artist()}</span>
      </div>
      <div class="facts">
        <span class="fact">{label.source(props.hitRef.split(":")[0] as SourceId, sourceName(props.hitRef.split(":")[0] as SourceId))}</span>
        <Show when={hit()?.album}>
          <span class="fact">{hit()!.album}</span>
        </Show>
        <Show when={hit()?.duration}>
          <span class="fact">{fmt(hit()!.duration)}</span>
        </Show>
        <Show when={lyrics()}>
          {(f) => (
            <>
              <span class="fact">{t("search.lines", { n: f().lines.length })}</span>
              <span class="fact" classList={{ warn: !f().synced }}>
                {t(f().synced ? "search.synced" : "search.unsynced")}
              </span>
            </>
          )}
        </Show>
      </div>

      <Show when={search.preview.loading}>
        <p class="muted">{t("search.downloading")}</p>
      </Show>
      <Show when={search.preview.error}>
        <p class="err">{lyricsErrorText(search.preview.error)}</p>
      </Show>

      <Show when={plan()}>
        {(p) => (
          <div class="actions">
            <Show when={into()}>
              {(s) => (
                <div class="action">
                  <button class="btn primary" disabled={busy()} onClick={() => save("merge")}>
                    {t("search.complete", { title: s().title })}
                  </button>
                  <span class="muted">
                    {t("search.completeDesc", { n: p().lines.length })}
                    {lyrics()?.synced ? t("search.completeTimed") : ""}
                    {p().reused ? t("search.keep", { n: p().reused }) : ""}
                    <Show when={p().lost}>
                      <span class="warn">{t("search.lost", { n: p().lost })}</span>
                    </Show>
                  </span>
                </div>
              )}
            </Show>
            <div class="action">
              <button class="btn" classList={{ primary: !into() }} disabled={busy()} onClick={() => save("new")}>
                {t("search.new")}
              </button>
              <span class="muted">
                {t("search.newDesc")}
                {p().reused ? t("search.reusable", { n: p().reused }) : ""}
              </span>
            </div>
            <Show when={error()}>
              <p class="err">{error()}</p>
            </Show>
          </div>
        )}
      </Show>

      <Show when={lyrics()}>
        {(f) => (
          <>
            <ol class="preview-lines">
              <For each={plan()?.lines ?? []}>
                {(l) => (
                  <li classList={{ annotated: isAnnotated(l) }}>
                    <span class="pl-time">{fmt(l.time)}</span>
                    <div>
                      <div class="pl-ja ja-font">{l.ja}</div>
                      <Show when={l.zh}>
                        <div class="pl-zh">{l.zh}</div>
                      </Show>
                    </div>
                    <Show when={isAnnotated(l)}>
                      <span class="pl-badge">{t("search.annotated")}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ol>
            <p class="source">{sourceNote(f())}</p>
          </>
        )}
      </Show>
    </article>
  );
}
