// Bottom bar: the album art doubles as the play button; on the right, progress and where the sound
// comes from — the Spotify app (controlled from here, never brought forward), or a linked local
// file for songs Spotify doesn't have.

import { Match, Show, Switch } from "solid-js";
import { t, tx } from "../i18n.ts";
import { app } from "../state.ts";
import { IconLink, IconPause, IconPlay, IconSpotify } from "./icons.tsx";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function PlayerBar() {
  const rec = () => app.current();
  const id = () => rec()?.song?.id;
  const mine = () => !!id() && app.playingId() === id();
  const playing = () => mine() && app.playing();
  const lookup = () => (id() ? app.spotifyLookup[id()!] : undefined);
  const onSpotify = () => app.spotify.installed && lookup() !== "missing";
  const viaSpotify = () => (mine() ? app.source() === "spotify" : onSpotify());
  const linked = () => mine() || onSpotify() || !!rec()?.audio;
  const dur = () => (mine() ? app.duration() : 0);
  const now = () => (mine() ? app.time() : 0);
  // the saved cover, or Spotify's artwork while it plays this song
  const art = () => rec()?.cover || (mine() && viaSpotify() ? app.spotify.artwork : "") || "";
  const error = () => app.player.error || (app.spotify.installed ? app.spotify.error : "") || "";
  return (
    <footer class="player">
      {/* with art, the album art is the button: play/pause sits on it, and while playing a small
          level meter stands in until the pointer comes over */}
      <button
        class="play"
        classList={{ art: !!art(), playing: playing() }}
        style={art() ? { "background-image": `url("${art()}")` } : undefined}
        disabled={!rec()?.song}
        onClick={() => app.togglePlay()}
        title={t("player.toggle")}
      >
        <span class="play-glyph">
          <Show when={playing()} fallback={<IconPlay size={14} />}>
            <IconPause size={14} />
          </Show>
        </span>
        <Show when={art() && playing()}>
          <span class="meter">
            <i />
            <i />
            <i />
          </span>
        </Show>
      </button>
      <div class="now">
        <div class="now-title">{rec()?.song?.title ?? "—"}</div>
        <div class="now-sub">
          <Switch fallback={rec()?.song?.artist}>
            <Match when={error()}>
              <span class="err">{tx(error())}</span>
            </Match>
            <Match when={lookup() === "searching"}>
              <span class="muted">{t("player.searching")}</span>
            </Match>
            <Match when={lookup() === "missing" && !rec()?.audio}>
              <span class="muted">{t("player.missing")}</span>
            </Match>
          </Switch>
        </div>
      </div>
      <Switch>
        <Match when={linked()}>
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
          <Show
            when={viaSpotify()}
            fallback={
              <button class="icon source-chip" title={t("player.viaFile")} onClick={() => app.linkAudio()}>
                <IconLink />
              </button>
            }
          >
            <span class="icon source-chip spotify" title={t("player.viaSpotify")}>
              <IconSpotify />
            </span>
          </Show>
        </Match>
        <Match when={true}>
          <button class="link-audio" disabled={!rec()?.song} onClick={() => app.linkAudio()}>
            <IconLink /> {t("player.link")}
          </button>
        </Match>
      </Switch>
    </footer>
  );
}
