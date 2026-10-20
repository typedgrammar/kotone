import { For, Show, type JSX } from "solid-js";
import { bridge } from "../bridge.ts";
import { t, type Key } from "../i18n.ts";
import { app, type View } from "../state.ts";
import { iconButton } from "../ui.ts";
import { IconBook, IconCards, IconFolder, IconGear, IconGrid, IconImport, IconLyrics, IconMusic, IconPlus, IconStar } from "./icons.tsx";

const NAV: [View, () => JSX.Element, Key][] = [
  ["library", IconGrid, "nav.library"],
  ["lyrics", IconLyrics, "nav.lyrics"],
  ["favorites", IconStar, "nav.favorites"],
  ["grammar", IconBook, "nav.grammar"],
  ["vocab", IconCards, "nav.vocab"],
  ["search", IconPlus, "nav.search"],
];

export function Sidebar() {
  return (
    <aside class="relative flex min-h-0 flex-col px-2.5 pt-13 pb-2.5 group-data-cover/app:bg-sidebar/40">
      <nav class="grid gap-px">
        <For each={NAV}>
          {([v, Icon, label]) => (
            <button
              data-nav={v}
              class={`flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.25 ${app.view() === v ? "bg-sel" : "hover:bg-hover"}`}
              title={v === "search" ? t("side.add") : undefined}
              onClick={() => (v === "search" ? app.addSong() : app.setView(v))}
            >
              <span class={`grid w-4.5 place-items-center ${app.view() === v ? "text-accent" : "text-fg-2"}`}>
                <Icon />
              </span>
              {t(label)}
              <Show when={v === "favorites" && app.favorites.lines.length}>
                <span class="ml-auto text-[11px] text-fg-3 tabular-nums">{app.favorites.lines.length}</span>
              </Show>
            </button>
          )}
        </For>
      </nav>
      <div class="px-2 pt-4.5 pb-1 font-ui text-[11px]/[normal] font-semibold text-fg-3">{t("side.songs")}</div>
      <ul class="flex-1 overflow-y-auto">
        <For each={app.records()}>
          {(r) => (
            <li>
              <button
                data-song={r.song?.id ?? r.id}
                class={`flex w-full items-center gap-2.25 rounded-[7px] px-2 py-1.25 text-left ${
                  app.currentId() === (r.song?.id ?? r.id) ? "bg-sel" : "hover:bg-hover"
                } ${r.song ? "" : "text-c0"}`}
                title={r.error ?? ""}
                onClick={() => r.song && (app.openSong(r.song.id), app.setView("lyrics"))}
              >
                <span class="grid size-7.5 flex-none place-items-center overflow-hidden rounded-[5px] bg-hover text-fg-3">
                  <Show when={r.cover} fallback={<IconMusic />}>
                    <img class="size-full object-cover" src={r.cover!} alt="" />
                  </Show>
                </span>
                <span class="flex min-w-0 flex-col">
                  <span class="truncate font-ja text-[14px]/[1.4]">{r.song?.title ?? r.id}</span>
                  <span class="truncate text-[11px] text-fg-2">{r.song?.artist ?? t("side.unreadable")}</span>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <div class="flex gap-0.5 pt-1.5">
        <Show when={bridge.native}>
          <button class={iconButton} title={t("side.import")} onClick={async () => (await bridge.importSong()) && app.refresh()}>
            <IconImport />
          </button>
          <button class={iconButton} title={t("side.reveal")} onClick={() => bridge.revealLibrary()}>
            <IconFolder />
          </button>
        </Show>
        <button class={`${iconButton} ml-auto`} data-action="settings" title={t("side.settings")} onClick={() => app.setSettingsOpen(true)}>
          <IconGear />
        </button>
      </div>
    </aside>
  );
}
