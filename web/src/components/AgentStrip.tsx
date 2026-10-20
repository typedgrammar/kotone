// Codex in the song header: one action (annotate the whole song) and its progress. Everything about
// the Codex setup — path, account, quota, Fast mode — lives in the settings dialog.

import { Match, Switch } from "solid-js";
import { isAnnotated } from "../../../core/analyze.ts";
import type { RateWindow } from "../../../core/codex.ts";
import type { Song } from "../../../core/types.ts";
import { agent } from "../agent.ts";
import { agentErrorText, t } from "../i18n.ts";
import { app } from "../state.ts";
import { btn, link } from "../ui.ts";

const windowName = (w: RateWindow) =>
  w.windowDurationMins === 10080 ? t("quota.week") : w.windowDurationMins ? t("quota.hours", { h: Math.round(w.windowDurationMins / 60) }) : "";

export function quotaText(): string {
  const l = agent.state.limits;
  return [l?.primary, l?.secondary]
    .filter((w): w is RateWindow => !!w)
    .map((w) => t("quota.used", { window: windowName(w), pct: Math.round(w.usedPercent) }))
    .join(" · ");
}

const pendingOf = (song: Song) => song.lines.filter((l) => !isAnnotated(l)).map((l) => l.id);

/** Right side of the header, next to 注音 / 译文. */
export function AnnotateAction(props: { song: Song }) {
  const mine = () => agent.state.status === "working" && agent.state.songId === props.song.id;
  return (
    <Switch>
      <Match when={mine()}>
        <div class="flex items-center gap-2 text-[12px] text-fg-2 tabular-nums">
          <span class="size-[7px] flex-none animate-agent-pulse rounded-full bg-accent" />
          {t("agent.progress", { n: agent.state.saved.length, total: agent.state.queue.length })}
          <button class={btn({ small: true })} onClick={() => agent.stop()}>
            {t("agent.stop")}
          </button>
        </div>
      </Match>
      <Match when={agent.state.status === "starting"}>
        <button class={btn({ primary: true, small: true })} disabled>
          {t("agent.connecting")}
        </button>
      </Match>
      <Match when={pendingOf(props.song).length}>
        <button
          class={btn({ primary: true, small: true })}
          disabled={agent.state.status === "working"}
          title={agent.state.status === "working" ? t("agent.busyOther") : t("agent.annotateTip", { n: pendingOf(props.song).length })}
          onClick={() => agent.annotate(props.song, pendingOf(props.song))}
        >
          {t("agent.annotateSong")}
        </button>
      </Match>
    </Switch>
  );
}

const notice = "mt-1.5 flex flex-wrap items-baseline gap-2 text-[12px]";

/** Under the song meta, only when something needs attention. */
export function AgentNotice() {
  return (
    <Switch>
      <Match when={agent.state.status === "login"}>
        <div class={`${notice} text-fg-2`}>
          {t("agent.needLogin")}
          <button class={link} onClick={() => app.setSettingsOpen(true)}>
            {t("agent.openSettings")}
          </button>
        </div>
      </Match>
      <Match when={agent.state.error}>
        <div class={`${notice} text-c0`}>
          {agentErrorText(agent.state.error!)}
          <button class={link} onClick={() => app.setSettingsOpen(true)}>
            {t("agent.settings")}
          </button>
        </div>
      </Match>
    </Switch>
  );
}
