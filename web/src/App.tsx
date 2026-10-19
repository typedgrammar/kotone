import { createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { bridge } from "./bridge.ts";
import { LyricsSearch } from "./components/LyricsSearch.tsx";
import { LyricsView } from "./components/LyricsView.tsx";
import { FavoritesView, GrammarView, VocabView } from "./components/Outline.tsx";
import { PlayerBar } from "./components/PlayerBar.tsx";
import { Settings } from "./components/Settings.tsx";
import { lang, t } from "./i18n.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { app } from "./state.ts";

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
      app.setExpanded(next.id);
      requestAnimationFrame(() => document.getElementById(`line-${next.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      break;
    }
    default:
      return;
  }
  e.preventDefault();
}

export function App() {
  // <html lang> picks the right CJK glyphs; the native menus follow too
  createEffect(() => {
    document.documentElement.lang = lang() === "en" ? "en" : "zh-Hans";
    bridge.setLanguage(lang());
  });
  onMount(() => {
    void app.refresh();
    window.addEventListener("keydown", onKey);
    // songs added from the CLI appear when the window regains focus
    window.addEventListener("focus", app.refresh);
  });
  onCleanup(() => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("focus", app.refresh);
  });
  return (
    <div class="app" classList={{ native: bridge.native }}>
      <Sidebar />
      <main class="main">
        <div class="content">
          <Switch>
            <Match when={app.view() === "lyrics"}>
              <Show
                when={app.current()?.song}
                fallback={<p class="muted empty pad">{t("app.empty")}</p>}
              >
                {(song) => <LyricsView song={song()} hasAudio={!!app.current()?.audio} />}
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
