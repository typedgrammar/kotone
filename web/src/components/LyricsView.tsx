import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import type { LineAnalysis } from "../../../core/analyze.ts";
import { rubyFor } from "../../../core/furigana.ts";
import { analysisOf } from "../../../core/library.ts";
import type { Line, Song } from "../../../core/types.ts";
import { app } from "../state.ts";
import { agent } from "../agent.ts";
import { t } from "../i18n.ts";
import { AgentNotice, AnnotateAction } from "./AgentStrip.tsx";
import { IconPause, IconPlay, IconStar } from "./icons.tsx";
import { LineDetail } from "./LineDetail.tsx";
import { JaLine, Ruby } from "./Text.tsx";
import { revealLine } from "../reveal.ts";

/** `playable`: the play-from-line buttons make sense (local audio, or Spotify to play it in) */
export function LyricsView(props: { song: Song; playable: boolean }) {
  const timed = createMemo(() => props.song.lines.some((l) => l.time !== undefined));
  const active = createMemo(() => {
    if (!timed() || app.playingId() !== props.song.id) return null;
    const t = app.time() + 0.15;
    let hit: Line | null = null;
    for (const l of props.song.lines) if (l.time !== undefined && l.time <= t) hit = l;
    return hit?.id ?? null;
  });

  // follow the playing line unless the reader has a breakdown open
  createEffect(
    on(active, (id) => {
      if (id && app.playing() && !app.expanded())
        revealLine(id, "center", true);
    }),
  );

  const annotated = () => props.song.lines.filter((l) => l.tokens?.length).length;

  return (
    <div class="lyrics-view" classList={{ "no-furi": !app.settings.furigana, "no-zh": !app.settings.translation }}>
      <header class="song-head">
        <div>
          <h1>
            <Ruby segs={rubyFor(props.song.title, props.song.titleReading)} />
          </h1>
          <div class="song-meta">
            {props.song.artist}
            <span class="sep">·</span>
            {t("song.annotated", { n: annotated(), total: props.song.lines.length })}
            <Show when={props.song.excerpt}>
              <span class="sep">·</span>
              {t("song.excerpt")}
            </Show>
            <Show when={props.song.excerpt || !timed()}>
              <span class="sep">·</span>
              <button class="link" onClick={() => app.openSearch({ query: `${props.song.title} ${props.song.artist}`, target: props.song.id })}>
                {t(props.song.excerpt ? "song.getFull" : "song.getTimed")}
              </button>
            </Show>
          </div>
          <AgentNotice />
        </div>
        <div class="toggles">
          <AnnotateAction song={props.song} />
          <button classList={{ on: app.settings.furigana }} onClick={() => app.setSettings({ furigana: !app.settings.furigana })} title={t("toggle.furiganaTip")}>
            {t("toggle.furigana")}
          </button>
          <button classList={{ on: app.settings.translation }} onClick={() => app.setSettings({ translation: !app.settings.translation })} title={t("toggle.translationTip")}>
            {t("toggle.translation")}
          </button>
        </div>
      </header>

      <div class="lines-scroll">
        <div class="lines">
          <For each={props.song.lines}>
            {(line) => <LyricLine song={props.song} line={line} active={active() === line.id} playable={props.playable} />}
          </For>
          <Show when={props.song.source}>
            <p class="source">{props.song.source}</p>
          </Show>
        </div>
      </div>
    </div>
  );
}

function LyricLine(props: { song: Song; line: Line; active: boolean; playable: boolean }) {
  const analysis = createMemo(() => analysisOf(props.song, props.line));
  const open = () => app.expanded() === props.line.id;
  const fav = () => app.isFav(props.song.id, props.line.id);
  // on the opened line (and the one playing), the gutter button pauses while the song plays
  const pausable = () => (open() || props.active) && app.playing() && app.playingId() === props.song.id;
  return (
    <div
      id={`line-${props.line.id}`}
      class="line"
      classList={{
        active: props.active,
        open: open(),
        bare: !props.line.tokens?.length,
        queued: agent.isQueued(props.song.id, props.line.id),
        working: agent.isWorking(props.song.id, props.line.id),
      }}
    >
      <div class="line-row" onClick={() => app.setExpanded(open() ? null : props.line.id)}>
        <div class="gutter">
          <Show when={pausable() || (props.line.time !== undefined && props.playable)}>
            <button
              class="icon play-from"
              classList={{ pause: pausable() }}
              title={t(pausable() ? "line.pause" : "line.playFrom")}
              onClick={(e) => (e.stopPropagation(), pausable() ? app.togglePlay() : app.seek(props.line.time!, true))}
            >
              <Show when={pausable()} fallback={<IconPlay size={11} />}>
                <IconPause size={11} />
              </Show>
            </button>
          </Show>
        </div>
        <div class="ja">
          <JaLine ja={props.line.ja} analysis={analysis()} />
        </div>
        <div class="zh">{props.line.zh}</div>
        <button
          class="icon star"
          classList={{ on: fav() }}
          title={t(fav() ? "line.unfav" : "line.fav")}
          onClick={(e) => (e.stopPropagation(), app.toggleFav(props.song, props.line))}
        >
          <IconStar filled={fav()} />
        </button>
      </div>
      <Show when={open()}>
        <Popover song={props.song} line={props.line} analysis={analysis()} />
      </Show>
    </div>
  );
}

const GAP = 8;
const MIN = 420;

/** The breakdown floats over its neighbours instead of pushing them down: below the line when it
 *  fits in view, above it when there's more room there, otherwise below with the view nudged. */
function Popover(props: { song: Song; line: Line; analysis: LineAnalysis }) {
  let el!: HTMLDivElement;
  const [above, setAbove] = createSignal(false);

  onMount(() => {
    const scroller = el.closest(".lines-scroll")!;
    const row = el.previousElementSibling!.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    // the top edge fades out; don't count it as room
    const top = view.top + 28;
    // as tall as its content up to most of the view (the line itself stays visible above or below);
    // room enough for a phrase's words even when the whole-line view is short
    const cap = (view.bottom - top) * 0.85 - row.height;
    const want = Math.min(cap, props.analysis.tokens.length ? Math.max(el.scrollHeight, MIN) : el.scrollHeight);
    const below = view.bottom - row.bottom - 2 * GAP;
    const over = row.top - top - 2 * GAP;
    const flip = want > below && want <= over;
    // no room either side: open below and nudge the view up just enough (scrolling the other
    // way can run out at the top of the song; the popover itself always makes room below)
    if (!flip && want > below) scroller.scrollBy({ top: want - below, behavior: "smooth" });
    setAbove(flip);
    el.style.maxHeight = `${want}px`;

    // switching phrases may grow it but never shrinks it back, so the tab bar doesn't jump around
    const grow = new ResizeObserver(() => (el.style.minHeight = `${el.offsetHeight}px`));
    grow.observe(el);
    onCleanup(() => grow.disconnect());

    // a click anywhere else closes it (the player stays usable while reading)
    const outside = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!t.closest?.(`#line-${props.line.id}, .player, .modal-backdrop`)) app.setExpanded(null);
    };
    document.addEventListener("pointerdown", outside, true);
    onCleanup(() => document.removeEventListener("pointerdown", outside, true));
  });

  return (
    <div ref={el} class="popover" classList={{ above: above() }}>
      <LineDetail song={props.song} line={props.line} analysis={props.analysis} />
    </div>
  );
}
