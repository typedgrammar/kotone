// A line's breakdown in a full-height panel on the right (like Notion's side peek). It floats over
// the space the lyrics column leaves free, so opening it moves nothing. Click another line to
// switch, j/k to step, Esc or × to close. The left edge drags to resize; the width is remembered.

import { createMemo, Show } from "solid-js";
import { analysisOf } from "../../../core/library.ts";
import type { Song } from "../../../core/types.ts";
import { t } from "../i18n.ts";
import { app } from "../state.ts";
import { revealLine } from "../reveal.ts";
import { iconButton } from "../ui.ts";
import { IconClose, IconDown, IconPause, IconPlay, IconStar, IconUp } from "./icons.tsx";
import { LineDetail } from "./LineDetail.tsx";

export const PANEL_MIN = 360;
export const PANEL_WIDTH = 420;

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function LinePanel(props: { song: Song; lineId: string; playable: boolean }) {
  let aside!: HTMLElement;
  const index = createMemo(() => props.song.lines.findIndex((l) => l.id === props.lineId));
  const line = () => props.song.lines[index()];
  const analysis = createMemo(() => (line() ? analysisOf(props.song, line()) : null));
  const fav = () => app.isFav(props.song.id, props.lineId);
  const playingHere = () => app.playing() && app.playingId() === props.song.id;

  function step(d: number) {
    const next = props.song.lines[index() + d];
    if (!next) return;
    revealLine(next.id, "nearest");
    app.setExpanded(next.id);
  }

  // dragging the left edge: as wide as the pointer leaves room for, within limits
  function resize(e: PointerEvent) {
    e.preventDefault();
    const right = aside.getBoundingClientRect().right;
    const max = () => (aside.parentElement?.clientWidth ?? 1000) * 0.62;
    const move = (m: PointerEvent) => app.setSettings({ breakdownWidth: Math.round(Math.max(PANEL_MIN, Math.min(max(), right - m.clientX))) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.documentElement.style.cursor = "col-resize";
  }

  return (
    <aside
      ref={aside}
      data-panel
      class="@container absolute inset-y-0 right-0 z-4 flex animate-panel-in flex-col border-l border-line bg-elev shadow-[-8px_0_32px_rgba(0,0,0,0.06)] group-data-cover/app:bg-elev/78 group-data-cover/app:backdrop-blur-[30px] group-data-cover/app:backdrop-saturate-130 dark:shadow-[-8px_0_32px_rgba(0,0,0,0.3)]"
      style={{ width: `min(${app.settings.breakdownWidth}px, 62%)` }}
    >
      <div
        class="absolute inset-y-0 -left-[3px] z-1 w-[6px] cursor-col-resize hover:bg-accent/30 active:bg-accent/40"
        onPointerDown={resize}
        onDblClick={() => app.setSettings({ breakdownWidth: PANEL_WIDTH })}
      />
      {/* below the window's 28px drag strip, level with the view headers */}
      <header class="flex flex-none items-center gap-1 px-3.5 pt-9 pb-1">
        <span class="mr-auto pl-1 text-[12px] text-fg-3 tabular-nums">
          {t("panel.position", { n: index() + 1, total: props.song.lines.length })}
          <Show when={line()?.time !== undefined}>
            <span class="mx-1.5">·</span>
            {fmt(line()!.time!)}
          </Show>
        </span>
        <Show when={playingHere() || (line()?.time !== undefined && props.playable)}>
          <button
            class={`${iconButton} ${playingHere() ? "text-accent" : ""}`}
            title={t(playingHere() ? "line.pause" : "line.playFrom")}
            onClick={() => (playingHere() ? app.togglePlay() : app.seek(line()!.time!, true))}
          >
            <Show when={playingHere()} fallback={<IconPlay size={12} />}>
              <IconPause size={12} />
            </Show>
          </button>
        </Show>
        <button
          class={`${iconButton} ${fav() ? "text-star hover:text-star" : ""}`}
          title={t(fav() ? "line.unfav" : "line.fav")}
          onClick={() => line() && app.toggleFav(props.song, line())}
        >
          <IconStar filled={fav()} />
        </button>
        <span class="mx-1 h-4 w-px bg-line" />
        <button class={iconButton} title={t("panel.prev")} disabled={index() <= 0} onClick={() => step(-1)}>
          <IconUp />
        </button>
        <button class={iconButton} title={t("panel.next")} disabled={index() >= props.song.lines.length - 1} onClick={() => step(1)}>
          <IconDown />
        </button>
        <button class={iconButton} title={t("panel.close")} onClick={() => app.setExpanded(null)}>
          <IconClose />
        </button>
      </header>
      <Show when={line() && analysis()} keyed>
        {(a) => <LineDetail song={props.song} line={line()} analysis={a} />}
      </Show>
    </aside>
  );
}
