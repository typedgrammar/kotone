// Settings (⌘, or the gear in the sidebar): language, and how Kotone reaches the user's Codex.

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { agent } from "../agent.ts";
import { agentErrorText, t, tx } from "../i18n.ts";
import { app } from "../state.ts";
import { quotaText } from "./AgentStrip.tsx";
import { btn, err, field, muted } from "../ui.ts";
import { Segmented } from "./controls.tsx";

function Toggle(props: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      class="relative h-[19px] w-8 self-center rounded-full bg-sel transition-colors duration-150 after:absolute after:top-0.5 after:left-0.5 after:size-3.75 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,0.25)] after:transition-transform after:duration-150 aria-checked:bg-accent aria-checked:after:translate-x-3.25"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      onClick={() => props.onChange(!props.on)}
    />
  );
}

const group = "px-6 pt-2 pb-1";
const groupTitle = "mt-2.5 mb-0.5 font-ui text-[11px]/[normal] font-semibold tracking-[0.06em] text-fg-3";
const row = "grid grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-3";
const rowLabel = "text-fg-2";
const rowValue = "min-w-0 wrap-anywhere";
const hint = "mt-1 mb-1.5 text-[11.5px] text-fg-3";
const dot = "mr-1.5 inline-block size-1.75 rounded-full align-[1px]";

export function Settings() {
  const [path, setPath] = createSignal(app.settings.codexPath);
  const close = () => app.setSettingsOpen(false);
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
  onMount(() => {
    window.addEventListener("keydown", onKey, true);
    void agent.check();
  });
  onCleanup(() => window.removeEventListener("keydown", onKey, true));

  function savePath() {
    if (path().trim() === app.settings.codexPath) return;
    app.setSettings({ codexPath: path().trim() });
    agent.restart();
    void agent.check();
  }

  const s = agent.state;
  const account = () => (s.plan ? `ChatGPT ${s.plan[0].toUpperCase()}${s.plan.slice(1)}${s.email ? ` · ${s.email}` : ""}` : "");

  return (
    <div data-modal class="fixed inset-0 z-50 grid place-items-center bg-black/22 backdrop-blur-[2px]" onClick={close}>
      <div
        class="max-h-[calc(100vh-80px)] w-[min(560px,calc(100vw-48px))] overflow-y-auto rounded-[14px] bg-elev shadow-[var(--shadow),0_24px_64px_rgba(0,0,0,0.25)] select-text"
        role="dialog"
        aria-label={t("settings.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <header class="px-6 pt-5 pb-1">
          <h3 class="m-0 font-ui text-[17px]/[normal] font-semibold">{t("settings.title")}</h3>
        </header>

        <section class={group}>
          <h4 class={groupTitle}>{t("settings.general")}</h4>
          <div class={row}>
            <div class={rowLabel}>{t("settings.language")}</div>
            <div class={rowValue}>
              <Segmented
                value={app.settings.lang}
                options={[
                  ["auto", t("settings.langAuto")],
                  ["zh", "中文"],
                  ["en", "English"],
                ]}
                onChange={(lang) => app.setSettings({ lang })}
              />
            </div>
          </div>
        </section>

        <section class={group}>
          <h4 class={groupTitle}>{t("settings.codex")}</h4>
          <p class={hint}>{t("settings.codexIntro")}</p>

          <div class={row}>
            <div class={rowLabel}>{t("settings.status")}</div>
            <div class={rowValue}>
              <Show when={!s.probing} fallback={<span class={muted}>{t("settings.checking")}</span>}>
                <Show
                  when={s.probe?.error}
                  fallback={
                    <Show when={s.probe?.version} fallback={<span class={muted}>{t("settings.unchecked")}</span>}>
                      <span
                        class={`${dot} ${
                          s.status === "ready" || s.status === "working" ? "bg-c1" : s.status === "login" || s.status === "error" ? "bg-n3" : "bg-fg-3"
                        }`}
                      />
                      <span>{s.probe!.version}</span>
                      <Show when={s.status === "login"}>
                        <span class={muted}> · {t("settings.notLoggedIn")}</span>
                      </Show>
                      <Show when={account()}>
                        <span class={muted}> · {account()}</span>
                      </Show>
                    </Show>
                  }
                >
                  <span class={`${dot} bg-n3`} />
                  <span class={err}>{tx(s.probe!.error!)}</span>
                </Show>
              </Show>
              <Show when={s.error && !s.probe?.error}>
                <div class={`${hint} text-c0!`}>{agentErrorText(s.error!)}</div>
              </Show>
            </div>
            <button class={btn({ small: true })} disabled={s.probing} onClick={() => agent.check()}>
              {t("settings.recheck")}
            </button>
          </div>

          <Show when={s.status === "login"}>
            <div class={row}>
              <div class={rowLabel}>{t("settings.account")}</div>
              <div class={`${rowValue} ${muted}`}>{t("settings.loginHint")}</div>
              <button class={btn({ primary: true, small: true })} onClick={() => agent.login()}>
                {t("settings.login")}
              </button>
            </div>
          </Show>

          <Show when={quotaText()}>
            <div class={row}>
              <div class={rowLabel}>{t("settings.quota")}</div>
              <div class={rowValue}>{quotaText()}</div>
            </div>
          </Show>

          <div class={row}>
            <div class={rowLabel}>{t("settings.path")}</div>
            <div class={rowValue}>
              <input
                class={field}
                placeholder={t("settings.pathAuto")}
                value={path()}
                onInput={(e) => setPath(e.currentTarget.value)}
                onChange={savePath}
                onKeyDown={(e) => e.key === "Enter" && savePath()}
                spellcheck={false}
              />
              <div class={hint}>
                <Show when={s.probe?.path} fallback={t("settings.pathInstall")}>
                  {t("settings.pathNow", { path: s.probe!.path! })}
                </Show>
              </div>
            </div>
          </div>

          <div class={row}>
            <div class={rowLabel}>{t("settings.fast")}</div>
            <div class={`${rowValue} ${hint}`}>{t("settings.fastHint")}</div>
            <Toggle label={t("settings.fast")} on={app.settings.codexFast} onChange={(v) => app.setSettings({ codexFast: v })} />
          </div>
        </section>

        <footer class="flex justify-end px-6 pt-2 pb-5">
          <button class={btn({ primary: true })} onClick={close}>
            {t("settings.done")}
          </button>
        </footer>
      </div>
    </div>
  );
}
