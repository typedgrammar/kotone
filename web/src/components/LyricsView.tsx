import { createEffect, createMemo, For, on, Show } from "solid-js";
import { rubyFor } from "../../../core/furigana.ts";
import { analysisOf } from "../../../core/library.ts";
import type { Line, Song } from "../../../core/types.ts";
import { app } from "../state.ts";
import { agent } from "../agent.ts";
import { t } from "../i18n.ts";
import { AgentNotice, AnnotateAction } from "./AgentStrip.tsx";
import { IconPause, IconPlay, IconStar } from "./icons.tsx";
import { LinePanel } from "./LinePanel.tsx";
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

  // follow the playing line (the breakdown sits beside the lyrics, so it never hides it)
  createEffect(
    on(active, (id) => {
      if (id && app.playing()) revealLine(id, "center", true);
    }),
  );
  const opened = () => {
    const id = app.expanded();
    return id && props.song.lines.some((l) => l.id === id) ? id : null;
  };

  const annotated = () => props.song.lines.filter((l) => l.tokens?.length).length;

  const toggle = (on: boolean) =>
    `rounded-full border px-3 py-0.75 ${on ? "border-transparent bg-accent-soft text-accent" : "border-line text-fg-2"}`;

  // data-nofuri / data-nozh: the furigana and translation toggles, read by the lines below
  return (
    <div
      class="group/lyrics relative flex h-full flex-col data-nofuri:[&_rt]:hidden"
      data-nofuri={app.settings.furigana ? undefined : ""}
      data-nozh={app.settings.translation ? undefined : ""}
    >
      {/* the header stays put; only the lines scroll, fading out as they reach it. Both keep to a
          column on the left, so the breakdown panel opens over empty space and nothing reflows */}
      <header class={`relative z-3 flex flex-none items-end justify-between gap-4 px-10 pt-8.5 pb-1.5 ${COLUMN}`}>
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
        <div class={`px-6 ${COLUMN}`}>
          <For each={props.song.lines}>
            {(line) => <LyricLine song={props.song} line={line} active={active() === line.id} playable={props.playable} />}
          </For>
          <Show when={props.song.source}>
            <p class="mx-4 mt-7 mb-0 text-[12px] text-fg-3">{props.song.source}</p>
          </Show>
        </div>
      </div>
      <Show when={opened()}>{(id) => <LinePanel song={props.song} lineId={id()} playable={props.playable} />}</Show>
    </div>
  );
}

const sep = "mx-1.5 text-fg-3";
/** The lyrics' width: room for a long line at 21px, leaving the panel's default width free beside it */
const COLUMN = "max-w-[568px]";

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
        class={`group/row grid grid-cols-[22px_minmax(0,1fr)_28px] items-center gap-x-4.5 rounded-[14px] py-1.5 pr-2.5 pl-1 ${
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
          class={`font-zh text-[15px]/[1.6] transition-colors duration-200 group-data-nozh/lyrics:hidden col-start-2 row-start-2 -mt-1 pb-1 ${props.active ? "text-fg" : "text-fg-2"}`}
        >
          {props.line.zh}
        </div>
        <button
          class={`col-start-3 row-start-1 inline-grid size-6.5 place-items-center rounded-md transition-opacity duration-120 hover:bg-hover ${
            fav() ? "text-star" : "text-fg-2 opacity-0 group-hover/row:opacity-100 hover:text-fg"
          }`}
          title={t(fav() ? "line.unfav" : "line.fav")}
          onClick={(e) => (e.stopPropagation(), app.toggleFav(props.song, props.line))}
        >
          <IconStar filled={fav()} />
        </button>
      </div>
    </div>
  );
}
