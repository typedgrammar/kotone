import { For, Show, type JSX } from "solid-js";
import { bridge } from "../bridge.ts";
import { t, type Key } from "../i18n.ts";
import { app, type View } from "../state.ts";
import { IconBook, IconCards, IconFolder, IconGear, IconGrid, IconLyrics, IconMusic, IconPlus, IconSearch, IconStar } from "./icons.tsx";

const NAV: [View, () => JSX.Element, Key][] = [
  ["library", IconGrid, "nav.library"],
  ["lyrics", IconLyrics, "nav.lyrics"],
  ["favorites", IconStar, "nav.favorites"],
  ["grammar", IconBook, "nav.grammar"],
  ["vocab", IconCards, "nav.vocab"],
  ["search", IconSearch, "nav.search"],
];

export function Sidebar() {
  return (
    <aside class="sidebar">
      <nav class="nav">
        <For each={NAV}>
          {([v, Icon, label]) => (
            <button classList={{ sel: app.view() === v }} onClick={() => app.setView(v)}>
              <span class="nav-icon">
                <Icon />
              </span>
              {t(label)}
              <Show when={v === "favorites" && app.favorites.lines.length}>
                <span class="count">{app.favorites.lines.length}</span>
              </Show>
            </button>
          )}
        </For>
      </nav>
      <div class="side-title">{t("side.songs")}</div>
      <ul class="songs">
        <For each={app.records()}>
          {(r) => (
            <li>
              <button
                classList={{ sel: app.currentId() === (r.song?.id ?? r.id), broken: !r.song }}
                title={r.error ?? ""}
                onClick={() => r.song && (app.openSong(r.song.id), app.setView("lyrics"))}
              >
                <span class="s-thumb">
                  <Show when={r.cover} fallback={<IconMusic />}>
                    <img src={r.cover!} alt="" />
                  </Show>
                </span>
                <span class="s-text">
                  <span class="s-title">{r.song?.title ?? r.id}</span>
                  <span class="s-artist">{r.song?.artist ?? t("side.unreadable")}</span>
                </span>
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
