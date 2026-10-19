import { createEffect, createMemo, For, on, Show } from "solid-js";
import { rubyFor } from "../../../core/furigana.ts";
import { analysisOf } from "../../../core/library.ts";
import type { Line, Song } from "../../../core/types.ts";
import { app } from "../state.ts";
import { agent } from "../agent.ts";
import { t } from "../i18n.ts";
import { AgentNotice, AnnotateAction } from "./AgentStrip.tsx";
import { IconPlay, IconStar } from "./icons.tsx";
import { LineDetail } from "./LineDetail.tsx";
import { JaLine, Ruby } from "./Text.tsx";

export function LyricsView(props: { song: Song; hasAudio: boolean }) {
  const timed = createMemo(() => props.song.lines.some((l) => l.time !== undefined));
  const active = createMemo(() => {
    if (!props.hasAudio || !timed() || app.player.loaded !== props.song.id) return null;
    const t = app.time() + 0.15;
    let hit: Line | null = null;
    for (const l of props.song.lines) if (l.time !== undefined && l.time <= t) hit = l;
    return hit?.id ?? null;
  });

  // follow the playing line unless the reader has a breakdown open
  createEffect(
    on(active, (id) => {
      if (id && app.player.playing && !app.expanded())
        document.getElementById(`line-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }),
  );

  const annotated = () => props.song.lines.filter((l) => l.tokens?.length).length;

  return (
    <div class="lyrics-view" classList={{ "no-furi": !app.settings.furigana, "no-zh": !app.settings.translation }}>
      <header class="song-head">
        <div>
          <h1>
            <Ruby segs={rubyFor(props.song.title, props.song.titleReading)} />
          </h1>
          <div class="song-meta">
            {props.song.artist}
            <span class="sep">·</span>
            {t("song.annotated", { n: annotated(), total: props.song.lines.length })}
            <Show when={props.song.excerpt}>
              <span class="sep">·</span>
              {t("song.excerpt")}
            </Show>
            <Show when={props.song.excerpt || !timed()}>
              <span class="sep">·</span>
              <button class="link" onClick={() => app.openSearch({ query: `${props.song.title} ${props.song.artist}`, target: props.song.id })}>
                {t(props.song.excerpt ? "song.getFull" : "song.getTimed")}
              </button>
            </Show>
          </div>
          <AgentNotice />
        </div>
        <div class="toggles">
          <AnnotateAction song={props.song} />
          <button classList={{ on: app.settings.furigana }} onClick={() => app.setSettings({ furigana: !app.settings.furigana })} title={t("toggle.furiganaTip")}>
            {t("toggle.furigana")}
          </button>
          <button classList={{ on: app.settings.translation }} onClick={() => app.setSettings({ translation: !app.settings.translation })} title={t("toggle.translationTip")}>
            {t("toggle.translation")}
          </button>
        </div>
      </header>

      <div class="lines">
        <For each={props.song.lines}>
          {(line) => <LyricLine song={props.song} line={line} active={active() === line.id} hasAudio={props.hasAudio} />}
        </For>
        <Show when={props.song.source}>
          <p class="source">{props.song.source}</p>
        </Show>
      </div>
    </div>
  );
}

function LyricLine(props: { song: Song; line: Line; active: boolean; hasAudio: boolean }) {
  const analysis = createMemo(() => analysisOf(props.song, props.line));
  const open = () => app.expanded() === props.line.id;
  const fav = () => app.isFav(props.song.id, props.line.id);
  return (
    <div
      id={`line-${props.line.id}`}
      class="line"
      classList={{
        active: props.active,
        open: open(),
        bare: !props.line.tokens?.length,
        queued: agent.isQueued(props.song.id, props.line.id),
        working: agent.isWorking(props.song.id, props.line.id),
      }}
    >
      <div class="line-row" onClick={() => app.setExpanded(open() ? null : props.line.id)}>
        <div class="gutter">
          <Show when={props.line.time !== undefined && props.hasAudio}>
            <button class="icon play-from" title={t("line.playFrom")} onClick={(e) => (e.stopPropagation(), app.seek(props.line.time!, true))}>
              <IconPlay size={11} />
            </button>
          </Show>
        </div>
        <div class="ja">
          <JaLine ja={props.line.ja} analysis={analysis()} />
        </div>
        <div class="zh">{props.line.zh}</div>
        <button
          class="icon star"
          classList={{ on: fav() }}
          title={t(fav() ? "line.unfav" : "line.fav")}
          onClick={(e) => (e.stopPropagation(), app.toggleFav(props.song, props.line))}
        >
          <IconStar filled={fav()} />
        </button>
      </div>
      <Show when={open()}>
        <LineDetail song={props.song} line={props.line} analysis={analysis()} />
      </Show>
    </div>
  );
}
