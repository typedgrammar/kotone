// The library as a wall of album art. Covers arrive with downloaded lyrics; songs without one get
// a look-up when this opens (once per session), and keep a quiet placeholder if nothing matches.

import { For, onMount, Show } from "solid-js";
import { isAnnotated } from "../../../core/analyze.ts";
import type { SongRecord } from "../bridge.ts";
import { t } from "../i18n.ts";
import { app } from "../state.ts";
import { btn, empty, muted, view, viewHead, viewTitle, viewTools } from "../ui.ts";
import { IconMusic, IconPlus } from "./icons.tsx";

export function LibraryView() {
  onMount(() => void app.fillCovers());
  const songs = () => app.records().filter((r) => r.song);
  return (
    <div class={view}>
      <header class={viewHead}>
        <h2 class={viewTitle}>{t("nav.library")}</h2>
        <div class={viewTools}>
          <span class={muted}>{t("library.count", { n: songs().length })}</span>
          <button class={`${btn({ primary: true, small: true })} flex items-center gap-1 [&_svg]:size-3`} title={t("side.add")} onClick={() => app.addSong()}>
            <IconPlus /> {t("nav.search")}
          </button>
        </div>
      </header>
      <Show when={songs().length} fallback={<p class={empty}>{t("app.empty")}</p>}>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5.5 gap-y-7 px-7 pt-6 pb-10">
          <For each={songs()}>{(r) => <Album r={r} />}</For>
          <AddTile />
        </div>
      </Show>
    </div>
  );
}

function Album(props: { r: SongRecord }) {
  const song = () => props.r.song!;
  const done = () => song().lines.filter(isAnnotated).length;
  const finding = () => app.coverBusy().has(song().id);
  return (
    <button
      class="group/album flex min-w-0 flex-col gap-1 text-left"
      onClick={() => {
        app.openSong(song().id);
        app.setView("lyrics");
      }}
    >
      <div
        class={`mb-1.5 grid aspect-square place-items-center overflow-hidden rounded-[10px] text-fg-3 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.1)] transition-[translate,box-shadow] duration-180 ease-[ease] group-hover/album:-translate-y-0.5 group-hover/album:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_14px_32px_rgba(0,0,0,0.16)] [&_svg]:size-8.5 ${
          finding() ? "animate-shimmer bg-[linear-gradient(100deg,var(--panel)_30%,var(--hover)_50%,var(--panel)_70%)] bg-size-[300%_100%]" : "bg-panel"
        } ${app.currentId() === song().id ? "outline-2 outline-offset-3 outline-accent" : ""}`}
        title={finding() ? t("library.finding") : undefined}
      >
        <Show when={props.r.cover} fallback={<IconMusic />}>
          <img class="size-full animate-fade-in-fast object-cover" src={props.r.cover!} alt="" loading="lazy" />
        </Show>
      </div>
      <div class="truncate font-ja text-[14px]/[1.4]">{song().title}</div>
      <div class="flex items-center gap-2 text-[12px] text-fg-2">
        <span class="min-w-0 flex-1 truncate">{song().artist}</span>
        <span
          class="h-[3px] w-9 flex-none overflow-hidden rounded-[2px] bg-line"
          title={t("song.annotated", { n: done(), total: song().lines.length })}
        >
          <i class="block h-full bg-accent" style={{ width: `${(done() / Math.max(1, song().lines.length)) * 100}%` }} />
        </span>
      </div>
    </button>
  );
}

/** The wall ends in a blank sleeve that opens the song search */
function AddTile() {
  return (
    <button class="group/add flex min-w-0 flex-col gap-1 text-left" onClick={() => app.addSong()}>
      <div class="mb-1.5 grid aspect-square place-items-center rounded-[10px] border-[1.5px] border-dashed border-line text-fg-3 transition-colors duration-150 group-hover/add:border-accent group-hover/add:text-accent [&_svg]:size-7">
        <IconPlus />
      </div>
      <div class="truncate text-[14px]/[1.4] text-fg-2 group-hover/add:text-fg">{t("nav.search")}</div>
      <div class="text-[12px] text-fg-3">{t("library.addHint")}</div>
    </button>
  );
}
