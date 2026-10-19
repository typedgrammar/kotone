// Settings (⌘, or the gear in the sidebar): language, and how Kotone reaches the user's Codex.

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { agent } from "../agent.ts";
import { agentErrorText, t, tx } from "../i18n.ts";
import { app } from "../state.ts";
import { quotaText } from "./AgentStrip.tsx";
import { Segmented } from "./Outline.tsx";

function Toggle(props: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button class="switch" classList={{ on: props.on }} role="switch" aria-checked={props.on} aria-label={props.label} onClick={() => props.onChange(!props.on)} />;
}

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
    <div class="modal-backdrop" onClick={close}>
      <div class="modal" role="dialog" aria-label={t("settings.title")} onClick={(e) => e.stopPropagation()}>
        <header class="modal-head">
          <h3>{t("settings.title")}</h3>
        </header>

        <section class="settings-group">
          <h4>{t("settings.general")}</h4>
          <div class="setting-row">
            <div class="setting-label">{t("settings.language")}</div>
            <div class="setting-value">
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

        <section class="settings-group">
          <h4>{t("settings.codex")}</h4>
          <p class="setting-hint">{t("settings.codexIntro")}</p>

          <div class="setting-row">
            <div class="setting-label">{t("settings.status")}</div>
            <div class="setting-value">
              <Show when={!s.probing} fallback={<span class="muted">{t("settings.checking")}</span>}>
                <Show
                  when={s.probe?.error}
                  fallback={
                    <Show when={s.probe?.version} fallback={<span class="muted">{t("settings.unchecked")}</span>}>
                      <span class="status-dot" classList={{ ok: s.status === "ready" || s.status === "working", warn: s.status === "login" || s.status === "error" }} />
                      <span>{s.probe!.version}</span>
                      <Show when={s.status === "login"}>
                        <span class="muted"> · {t("settings.notLoggedIn")}</span>
                      </Show>
                      <Show when={account()}>
                        <span class="muted"> · {account()}</span>
                      </Show>
                    </Show>
                  }
                >
                  <span class="status-dot warn" />
                  <span class="err">{tx(s.probe!.error!)}</span>
                </Show>
              </Show>
              <Show when={s.error && !s.probe?.error}>
                <div class="err setting-hint">{agentErrorText(s.error!)}</div>
              </Show>
            </div>
            <button class="btn small" disabled={s.probing} onClick={() => agent.check()}>
              {t("settings.recheck")}
            </button>
          </div>

          <Show when={s.status === "login"}>
            <div class="setting-row">
              <div class="setting-label">{t("settings.account")}</div>
              <div class="setting-value muted">{t("settings.loginHint")}</div>
              <button class="btn primary small" onClick={() => agent.login()}>
                {t("settings.login")}
              </button>
            </div>
          </Show>

          <Show when={quotaText()}>
            <div class="setting-row">
              <div class="setting-label">{t("settings.quota")}</div>
              <div class="setting-value">{quotaText()}</div>
            </div>
          </Show>

          <div class="setting-row">
            <div class="setting-label">{t("settings.path")}</div>
            <div class="setting-value">
              <input
                class="field"
                placeholder={t("settings.pathAuto")}
                value={path()}
                onInput={(e) => setPath(e.currentTarget.value)}
                onChange={savePath}
                onKeyDown={(e) => e.key === "Enter" && savePath()}
                spellcheck={false}
              />
              <div class="setting-hint">
                <Show when={s.probe?.path} fallback={t("settings.pathInstall")}>
                  {t("settings.pathNow", { path: s.probe!.path! })}
                </Show>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">{t("settings.fast")}</div>
            <div class="setting-value setting-hint">{t("settings.fastHint")}</div>
            <Toggle label={t("settings.fast")} on={app.settings.codexFast} onChange={(v) => app.setSettings({ codexFast: v })} />
          </div>
        </section>

        <footer class="modal-foot">
          <button class="btn primary" onClick={close}>
            {t("settings.done")}
          </button>
        </footer>
      </div>
    </div>
  );
}
