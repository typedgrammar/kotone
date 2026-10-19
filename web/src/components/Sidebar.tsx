import { For, Show } from "solid-js";
import { bridge } from "../bridge.ts";
import { t, type Key } from "../i18n.ts";
import { app, type View } from "../state.ts";
import { IconFolder, IconGear, IconPlus } from "./icons.tsx";

const NAV: [View, string, Key][] = [
  ["lyrics", "歌", "nav.lyrics"],
  ["favorites", "★", "nav.favorites"],
  ["grammar", "文", "nav.grammar"],
  ["vocab", "語", "nav.vocab"],
  ["search", "探", "nav.search"],
];

export function Sidebar() {
  return (
    <aside class="sidebar">
      <nav class="nav">
        <For each={NAV}>
          {([v, glyph, label]) => (
            <button classList={{ sel: app.view() === v }} onClick={() => app.setView(v)}>
              <span class="glyph">{glyph}</span>
              {t(label)}
              <Show when={v === "favorites" && app.favorites.lines.length}>
                <span class="count">{app.favorites.lines.length}</span>
              </Show>
            </button>
          )}
        </For>
      </nav>
      <div class="side-title">{t("side.library")}</div>
      <ul class="songs">
        <For each={app.records()}>
          {(r) => (
            <li>
              <button
                classList={{ sel: app.currentId() === (r.song?.id ?? r.id), broken: !r.song }}
                title={r.error ?? ""}
                onClick={() => r.song && (app.openSong(r.song.id), app.setView("lyrics"))}
              >
                <span class="s-title">{r.song?.title ?? r.id}</span>
                <span class="s-artist">{r.song?.artist ?? t("side.unreadable")}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <div class="side-foot">
        <Show when={bridge.native}>
          <button class="icon" title={t("side.import")} onClick={async () => (await bridge.importSong()) && app.refresh()}>
            <IconPlus />
          </button>
          <button class="icon" title={t("side.reveal")} onClick={() => bridge.revealLibrary()}>
            <IconFolder />
          </button>
        </Show>
        <button class="icon gear" title={t("side.settings")} onClick={() => app.setSettingsOpen(true)}>
          <IconGear />
        </button>
      </div>
    </aside>
  );
}
