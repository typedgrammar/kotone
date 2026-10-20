// Bottom bar: the album art doubles as the play button; on the right, progress and where the sound
// comes from — the Spotify app (controlled from here, never brought forward), or a linked local
// file for songs Spotify doesn't have.

import { Match, Show, Switch } from "solid-js";
import { t, tx } from "../i18n.ts";
import { app } from "../state.ts";
import { err, iconButton } from "../ui.ts";
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
  // the round button, or with art the album art itself; the glyph and level meter sit on it
  const button = () =>
    art()
      ? "group/play relative size-11 flex-none rounded-lg bg-cover bg-center bg-no-repeat shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.22)] transition-[transform,box-shadow] duration-150 hover:scale-104 hover:shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_6px_18px_rgba(0,0,0,0.3)] active:scale-97"
      : "grid size-8.5 flex-none place-items-center rounded-full bg-fg text-bg [&_svg]:ml-px";
  const onArt = "absolute inset-0 m-auto size-6.5 rounded-full bg-black/38 text-white backdrop-blur-[6px] transition-opacity duration-150";
  // while playing, the meter shows and the pause glyph waits for hover
  const glyph = () =>
    art() ? `${onArt} grid place-items-center [&_svg]:size-2.75 ${playing() ? "opacity-0 group-hover/play:opacity-100" : ""}` : "grid place-items-center";
  const bar = "h-2.5 w-[2.5px] origin-bottom animate-meter rounded-[1px] bg-current";
  const time = "w-9 text-center text-[11.5px] text-fg-2 tabular-nums";
  const chip = "inline-grid size-6.5 place-items-center rounded-md";
  return (
    <footer
      data-player
      class="relative flex h-15.5 flex-none items-center gap-3.5 border-t border-line bg-elev px-4.5 group-data-cover/app:bg-elev/55 group-data-cover/app:backdrop-blur-[24px] group-data-cover/app:backdrop-saturate-130"
    >
      {/* with art, the album art is the button: play/pause sits on it, and while playing a small
          level meter stands in until the pointer comes over */}
      <button
        class={button()}
        style={art() ? { "background-image": `url("${art()}")` } : undefined}
        disabled={!rec()?.song}
        onClick={() => app.togglePlay()}
        title={t("player.toggle")}
      >
        <span class={glyph()}>
          <Show when={playing()} fallback={<IconPlay size={14} />}>
            <IconPause size={14} />
          </Show>
        </span>
        <Show when={art() && playing()}>
          <span class={`${onArt} flex items-end justify-center gap-0.5 pb-2 group-hover/play:opacity-0`}>
            <i class={bar} />
            <i class={`${bar} [animation-delay:-0.3s]`} />
            <i class={`${bar} [animation-delay:-0.6s]`} />
          </span>
        </Show>
      </button>
      <div class="w-42.5 min-w-0">
        <div class="truncate font-ja text-[14px]/[normal] font-semibold">{rec()?.song?.title ?? "—"}</div>
        <div class="text-[11.5px] text-fg-2">
          <Switch fallback={rec()?.song?.artist}>
            <Match when={error()}>
              <span class={err}>{tx(error())}</span>
            </Match>
            <Match when={lookup() === "searching"}>
              <span>{t("player.searching")}</span>
            </Match>
            <Match when={lookup() === "missing" && !rec()?.audio}>
              <span>{t("player.missing")}</span>
            </Match>
          </Switch>
        </div>
      </div>
      <Switch>
        <Match when={linked()}>
          <span class={time}>{fmt(now())}</span>
          <input
            class="m-0 h-1 flex-1 appearance-none rounded-[2px] bg-[linear-gradient(to_right,var(--accent)_var(--p),var(--line)_var(--p))] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_0.5px_rgba(0,0,0,0.2),0_1px_3px_rgba(0,0,0,0.3)]"
            type="range"
            min="0"
            max={dur() || 1}
            step="0.1"
            value={now()}
            style={{ "--p": `${dur() ? (now() / dur()) * 100 : 0}%` }}
            onInput={(e) => app.seek(Number(e.currentTarget.value))}
          />
          <span class={time}>{fmt(dur())}</span>
          <Show
            when={viaSpotify()}
            fallback={
              <button class={iconButton} title={t("player.viaFile")} onClick={() => app.linkAudio()}>
                <IconLink />
              </button>
            }
          >
            <span class={`${chip} text-spotify hover:bg-hover`} title={t("player.viaSpotify")}>
              <IconSpotify />
            </span>
          </Show>
        </Match>
        <Match when={true}>
          <button
            class="ml-auto flex items-center gap-1.5 rounded-lg bg-hover px-3 py-1.5 text-fg-2 hover:text-fg"
            disabled={!rec()?.song}
            onClick={() => app.linkAudio()}
          >
            <IconLink /> {t("player.link")}
          </button>
        </Match>
      </Switch>
    </footer>
  );
}
