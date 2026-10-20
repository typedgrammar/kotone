// The library as a wall of album art. Covers arrive with downloaded lyrics; songs without one get
// a look-up when this opens (once per session), and keep a quiet placeholder if nothing matches.

import { For, onMount, Show } from "solid-js";
import { isAnnotated } from "../../../core/analyze.ts";
import type { SongRecord } from "../bridge.ts";
import { t } from "../i18n.ts";
import { app } from "../state.ts";
import { IconMusic } from "./icons.tsx";

export function LibraryView() {
  onMount(() => void app.fillCovers());
  const songs = () => app.records().filter((r) => r.song);
  return (
    <div class="outline-view">
      <header class="view-head">
        <h2>{t("nav.library")}</h2>
        <div class="view-tools muted">{t("library.count", { n: songs().length })}</div>
      </header>
      <Show when={songs().length} fallback={<p class="muted empty pad">{t("app.empty")}</p>}>
        <div class="album-grid">
          <For each={songs()}>{(r) => <Album r={r} />}</For>
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
      class="album"
      classList={{ sel: app.currentId() === song().id }}
      onClick={() => {
        app.openSong(song().id);
        app.setView("lyrics");
      }}
    >
      <div class="album-art" classList={{ finding: finding() }} title={finding() ? t("library.finding") : undefined}>
        <Show when={props.r.cover} fallback={<IconMusic />}>
          <img src={props.r.cover!} alt="" loading="lazy" />
        </Show>
      </div>
      <div class="album-title">{song().title}</div>
      <div class="album-meta">
        <span>{song().artist}</span>
        <span class="album-progress" title={t("song.annotated", { n: done(), total: song().lines.length })}>
          <i style={{ width: `${(done() / Math.max(1, song().lines.length)) * 100}%` }} />
        </span>
      </div>
    </button>
  );
}
