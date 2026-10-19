import { Show } from "solid-js";
import { t, tx } from "../i18n.ts";
import { app } from "../state.ts";
import { IconLink, IconPause, IconPlay } from "./icons.tsx";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function PlayerBar() {
  const rec = () => app.current();
  const ready = () => !!rec()?.audio;
  const dur = () => (app.player.loaded === rec()?.song?.id ? app.player.duration : 0);
  const now = () => (app.player.loaded === rec()?.song?.id ? app.time() : 0);
  return (
    <footer class="player">
      <button class="play" disabled={!rec()?.song} onClick={() => app.togglePlay()} title={t(ready() ? "player.toggle" : "player.pick")}>
        <Show when={app.player.playing} fallback={<IconPlay size={14} />}>
          <IconPause size={14} />
        </Show>
      </button>
      <div class="now">
        <div class="now-title">{rec()?.song?.title ?? "—"}</div>
        <div class="now-sub">
          <Show when={app.player.error} fallback={rec()?.song?.artist}>
            <span class="err">{tx(app.player.error)}</span>
          </Show>
        </div>
      </div>
      <Show
        when={ready()}
        fallback={
          <button class="link-audio" disabled={!rec()?.song} onClick={() => app.linkAudio()}>
            <IconLink /> {t("player.link")}
          </button>
        }
      >
        <span class="time">{fmt(now())}</span>
        <input
          class="seek"
          type="range"
          min="0"
          max={dur() || 1}
          step="0.1"
          value={now()}
          style={{ "--p": `${dur() ? (now() / dur()) * 100 : 0}%` }}
          onInput={(e) => app.seek(Number(e.currentTarget.value))}
        />
        <span class="time">{fmt(dur())}</span>
        <button class="icon relink" title={t("player.relink")} onClick={() => app.linkAudio()}>
          <IconLink />
        </button>
      </Show>
    </footer>
  );
}
