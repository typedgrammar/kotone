import { createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { bridge } from "./bridge.ts";
import { LibraryView } from "./components/Library.tsx";
import { LyricsSearch } from "./components/LyricsSearch.tsx";
import { LyricsView } from "./components/LyricsView.tsx";
import { FavoritesView, GrammarView, VocabView } from "./components/Outline.tsx";
import { PlayerBar } from "./components/PlayerBar.tsx";
import { Settings } from "./components/Settings.tsx";
import { lang, t } from "./i18n.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { app } from "./state.ts";
import { empty } from "./ui.ts";
import { revealLine } from "./reveal.ts";

function onKey(e: KeyboardEvent) {
  if (e.metaKey && e.key === ",") return void (e.preventDefault(), app.setSettingsOpen(true)); // browser preview; the app menu handles it natively
  if (e.metaKey || e.ctrlKey || e.altKey || app.settingsOpen() || (e.target as HTMLElement).closest("input, textarea")) return;
  const song = app.current()?.song;
  const lines = song?.lines ?? [];
  const i = lines.findIndex((l) => l.id === app.expanded());
  switch (e.key) {
    case " ":
      app.togglePlay();
      break;
    case "f":
      app.setSettings({ furigana: !app.settings.furigana });
      break;
    case "t":
      app.setSettings({ translation: !app.settings.translation });
      break;
    case "Escape":
      app.setExpanded(null);
      break;
    case "ArrowDown":
    case "j":
    case "ArrowUp":
    case "k": {
      if (app.view() !== "lyrics" || !lines.length) return;
      const next = lines[Math.min(lines.length - 1, Math.max(0, i + (e.key === "ArrowDown" || e.key === "j" ? 1 : i < 0 ? lines.length : -1)))];
      // scroll first so the popover measures its place against where the line ends up
      revealLine(next.id, "nearest");
      app.setExpanded(next.id);
      break;
    }
    default:
      return;
  }
  e.preventDefault();
}

export function App() {
  const backdrop = () => app.current()?.cover || null;
  // <html lang> picks the right CJK glyphs; the native menus follow too
  createEffect(() => {
    document.documentElement.lang = lang() === "en" ? "en" : "zh-Hans";
    bridge.setLanguage(lang());
  });
  onMount(() => {
    // covers for songs that predate cover download fill in quietly after the first load
    void app.refresh().then(() => app.fillCovers());
    window.addEventListener("keydown", onKey);
    // songs added from the CLI appear when the window regains focus
    window.addEventListener("focus", app.refresh);
  });
  onCleanup(() => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("focus", app.refresh);
  });
  return (
    // clip, not hidden: a hidden box can still be scrolled by script, shifting the whole window.
    // data-cover lets the panes over it turn translucent (group-data-cover/app:…)
    <div
      class="group/app relative grid h-screen grid-cols-[208px_minmax(0,1fr)] overflow-clip"
      data-native={bridge.native ? "" : undefined}
      data-cover={backdrop() ? "" : undefined}
    >
      {/* the current song's cover, blurred into a wash of its colours behind the whole window */}
      <Show when={backdrop()} keyed>
        {/* absolute: a url() inside a custom property resolves against the stylesheet, not the page */}
        {(src) => (
          <div
            class="pointer-events-none absolute inset-0 animate-fade-in before:absolute before:-inset-[20%] before:bg-(image:--cover) before:bg-cover before:bg-center before:bg-no-repeat before:opacity-42 before:blur-[80px] before:saturate-140 after:absolute after:inset-0 after:bg-linear-to-b after:from-bg/45 after:to-bg/70 dark:before:opacity-50 dark:after:from-bg/40 dark:after:to-bg/75"
            style={{ "--cover": `url("${new URL(src, location.href).href}")` }}
          />
        )}
      </Show>
      <Sidebar />
      <main class="relative flex min-h-0 min-w-0 flex-col overflow-clip border-l border-line bg-bg group-data-cover/app:bg-transparent">
        <div class="relative min-h-0 flex-1 overflow-y-auto">
          <Switch>
            <Match when={app.view() === "library"}>
              <LibraryView />
            </Match>
            <Match when={app.view() === "lyrics"}>
              <Show
                when={app.current()?.song}
                fallback={<p class={empty}>{t("app.empty")}</p>}
              >
                {(song) => <LyricsView song={song()} playable={!!app.current()?.audio || app.spotify.installed} />}
              </Show>
            </Match>
            <Match when={app.view() === "favorites"}>
              <FavoritesView />
            </Match>
            <Match when={app.view() === "grammar"}>
              <GrammarView />
            </Match>
            <Match when={app.view() === "vocab"}>
              <VocabView />
            </Match>
            <Match when={app.view() === "search"}>
              <LyricsSearch />
            </Match>
          </Switch>
        </div>
        <PlayerBar />
      </main>
      <Show when={app.settingsOpen()}>
        <Settings />
      </Show>
    </div>
  );
}
