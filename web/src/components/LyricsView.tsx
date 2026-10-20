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
import { link } from "../ui.ts";

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

  const toggle = (on: boolean) =>
    `rounded-full border px-3 py-0.75 ${on ? "border-transparent bg-accent-soft text-accent" : "border-line text-fg-2"}`;

  // data-nofuri / data-nozh: the furigana and translation toggles, read by the lines below
  return (
    <div
      class="group/lyrics flex h-full flex-col data-nofuri:[&_rt]:hidden"
      data-nofuri={app.settings.furigana ? undefined : ""}
      data-nozh={app.settings.translation ? undefined : ""}
    >
      {/* the header stays put; only the lines scroll, fading out as they reach it */}
      <header class="relative z-3 flex flex-none items-end justify-between gap-4 px-10 pt-8.5 pb-1.5">
        <div>
          <h1 class="m-0 font-ja text-[28px]/[1.9] font-semibold tracking-[0.04em] [&_rt]:text-[11px] [&_rt]:font-medium">
            <Ruby segs={rubyFor(props.song.title, props.song.titleReading)} />
          </h1>
          <div class="text-fg-2">
            {props.song.artist}
            <span class={sep}>·</span>
            {t("song.annotated", { n: annotated(), total: props.song.lines.length })}
            <Show when={props.song.excerpt}>
              <span class={sep}>·</span>
              {t("song.excerpt")}
            </Show>
            <Show when={props.song.excerpt || !timed()}>
              <span class={sep}>·</span>
              <button class={link} onClick={() => app.openSearch({ query: `${props.song.title} ${props.song.artist}`, target: props.song.id })}>
                {t(props.song.excerpt ? "song.getFull" : "song.getTimed")}
              </button>
            </Show>
          </div>
          <AgentNotice />
        </div>
        <div class="flex items-center gap-1.5">
          <AnnotateAction song={props.song} />
          <button class={toggle(app.settings.furigana)} onClick={() => app.setSettings({ furigana: !app.settings.furigana })} title={t("toggle.furiganaTip")}>
            {t("toggle.furigana")}
          </button>
          <button class={toggle(app.settings.translation)} onClick={() => app.setSettings({ translation: !app.settings.translation })} title={t("toggle.translationTip")}>
            {t("toggle.translation")}
          </button>
        </div>
      </header>

      <div data-lines-scroll class="min-h-0 flex-1 overflow-y-auto pt-3.5 pb-[35vh] [mask-image:linear-gradient(transparent,#000_28px)]">
        <div class="px-6">
          <For each={props.song.lines}>
            {(line) => <LyricLine song={props.song} line={line} active={active() === line.id} playable={props.playable} />}
          </For>
          <Show when={props.song.source}>
            <p class="mx-4 mt-7 mb-0 text-[12px] text-fg-3">{props.song.source}</p>
          </Show>
        </div>
      </div>
    </div>
  );
}

const sep = "mx-1.5 text-fg-3";

function LyricLine(props: { song: Song; line: Line; active: boolean; playable: boolean }) {
  const analysis = createMemo(() => analysisOf(props.song, props.line));
  const open = () => app.expanded() === props.line.id;
  const fav = () => app.isFav(props.song.id, props.line.id);
  // on the opened line (and the one playing), the gutter button pauses while the song plays
  const pausable = () => (open() || props.active) && app.playing() && app.playingId() === props.song.id;
  const queued = () => agent.isQueued(props.song.id, props.line.id);
  const working = () => agent.isWorking(props.song.id, props.line.id);
  // a queued line shows a dot in the gutter (pulsing while Codex works on it); hovering the row
  // hides it for the play button
  const gutter = () =>
    queued()
      ? `grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1 after:col-start-1 after:row-start-1 after:rounded-full group-hover/row:after:hidden ${
          working() ? "after:size-[7px] after:animate-agent-pulse after:bg-accent" : "after:size-[5px] after:bg-fg-3"
        }`
      : "";
  const playFrom = () =>
    [
      "inline-grid size-5.5 place-items-center rounded-md hover:bg-hover hover:opacity-100",
      pausable() ? "text-accent" : "text-fg-2 hover:text-fg",
      open() && pausable() ? "opacity-100" : open() ? "opacity-75" : "opacity-0 group-hover/row:opacity-75",
    ].join(" ");
  const ja = () =>
    `font-ja text-[21px]/[2.2] tracking-[0.03em] transition-colors duration-200 group-data-nofuri/lyrics:leading-[1.8] ${
      props.active ? "text-accent" : props.line.tokens?.length ? "" : "text-fg-2"
    }`;
  return (
    <div id={`line-${props.line.id}`} class="relative my-0.5 scroll-mt-7 rounded-[14px]">
      <div
        data-line-row
        class={`group/row grid grid-cols-[22px_minmax(0,1.3fr)_minmax(0,1fr)_28px] items-center gap-4.5 rounded-[14px] py-1.5 pr-2.5 pl-1 group-data-nozh/lyrics:grid-cols-[22px_minmax(0,1fr)_28px] ${
          open() ? "bg-sel" : "hover:bg-hover"
        }`}
        onClick={() => app.setExpanded(open() ? null : props.line.id)}
      >
        <div class={gutter()}>
          <Show when={pausable() || (props.line.time !== undefined && props.playable)}>
            <button
              class={playFrom()}
              title={t(pausable() ? "line.pause" : "line.playFrom")}
              onClick={(e) => (e.stopPropagation(), pausable() ? app.togglePlay() : app.seek(props.line.time!, true))}
            >
              <Show when={pausable()} fallback={<IconPlay size={11} />}>
                <IconPause size={11} />
              </Show>
            </button>
          </Show>
        </div>
        <div class={ja()}>
          <JaLine ja={props.line.ja} analysis={analysis()} />
        </div>
        <div
          class={`font-zh text-[15px]/[1.6] transition-colors duration-200 group-data-nozh/lyrics:hidden ${props.active ? "text-fg" : "text-fg-2"}`}
        >
          {props.line.zh}
        </div>
        <button
          class={`inline-grid size-6.5 place-items-center rounded-md transition-opacity duration-120 hover:bg-hover ${
            fav() ? "text-star" : "text-fg-2 opacity-0 group-hover/row:opacity-100 hover:text-fg"
          }`}
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
    const scroller = el.closest("[data-lines-scroll]")!;
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
      if (!t.closest?.(`#line-${props.line.id}, [data-player], [data-modal]`)) app.setExpanded(null);
    };
    document.addEventListener("pointerdown", outside, true);
    onCleanup(() => document.removeEventListener("pointerdown", outside, true));
  });

  return (
    // z-2: under the song header
    <div
      ref={el}
      data-popover
      class={`absolute inset-x-0 z-2 flex flex-col overflow-hidden rounded-[14px] border border-line bg-elev shadow-[0_18px_50px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)] ${
        above() ? "bottom-[calc(100%+8px)] animate-pop-in-above" : "top-[calc(100%+8px)] animate-pop-in"
      }`}
    >
      <LineDetail song={props.song} line={props.line} analysis={props.analysis} />
    </div>
  );
}
