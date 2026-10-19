// The on-demand breakdown of one lyric line: structure ↔ translation, words with their
// derivations, and the grammar points it demonstrates.

import { createSignal, For, Show } from "solid-js";
import { POS_ZH, type LineAnalysis, type ResolvedGrammar, type ResolvedToken } from "../../../core/analyze.ts";
import { CLASS_INFO, STEP_INFO } from "../../../core/conjugate.ts";
import { rubyFor } from "../../../core/furigana.ts";
import type { Line, Song } from "../../../core/types.ts";
import { agent } from "../agent.ts";
import { label, lang, t } from "../i18n.ts";
import { app } from "../state.ts";
import { IconArrow } from "./icons.tsx";
import { CHUNK_COLORS, JaLine, Ruby, ZhLine } from "./Text.tsx";

export function LineDetail(props: { song: Song; line: Line; analysis: LineAnalysis }) {
  const [hot, setHot] = createSignal<number | null>(null);
  const [focus, setFocus] = createSignal<[number, number] | null>(null);
  const [picked, setPicked] = createSignal<number | null>(null);
  const a = () => props.analysis;
  const notedChunks = () => a().chunks.filter((c) => c.chunk.note);

  return (
    <div class="detail" onClick={(e) => e.stopPropagation()}>
      <Show when={a().tokens.length} fallback={<Unannotated song={props.song} line={props.line} />}>
        <section class="structure">
          <div class="structure-ja">
            <JaLine ja={props.line.ja} analysis={a()} chunks hot={hot()} onHot={setHot} focus={focus()} onToken={setPicked} />
          </div>
          <Show when={props.line.zh}>
            <div class="structure-zh">
              <ZhLine zh={props.line.zh!} analysis={a()} hot={hot()} onHot={setHot} />
            </div>
          </Show>
          <Show when={props.line.note}>
            <p class="line-note">{props.line.note}</p>
          </Show>
          <Show when={notedChunks().length}>
            <ul class="chunk-notes">
              <For each={notedChunks()}>
                {(c) => (
                  <li
                    classList={{ hot: hot() === c.index }}
                    onMouseEnter={() => setHot(c.index)}
                    onMouseLeave={() => setHot(null)}
                  >
                    <span class={`dot c${c.index % CHUNK_COLORS}`} />
                    <span class="cn-ja">{c.chunk.ja}</span>
                    <Show when={c.zh.length}>
                      <span class="cn-zh">{c.zh.map(([s, e]) => props.line.zh!.slice(s, e)).join("…")}</span>
                    </Show>
                    <span class="cn-role">{c.chunk.role}</span>
                    <span class="cn-note">{c.chunk.note}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        <section>
          <h4>{t("detail.words")}</h4>
          <div class="words">
            <For each={a().tokens}>
              {(t) => <WordCard t={t} picked={picked() === t.index} onPick={() => setPicked(picked() === t.index ? null : t.index)} />}
            </For>
          </div>
        </section>

        <Show when={a().grammar.length}>
          <section>
            <h4>{t("detail.points")}</h4>
            <ul class="grammar-refs">
              <For each={a().grammar.filter((g) => !g.auto).concat(a().grammar.filter((g) => g.auto))}>
                {(g) => <GrammarRow g={g} line={props.line} onFocus={setFocus} />}
              </For>
            </ul>
          </section>
        </Show>
      </Show>
    </div>
  );
}

function Unannotated(props: { song: Song; line: Line }) {
  const active = () => agent.isWorking(props.song.id, props.line.id);
  return (
    <div class="unannotated">
      <Show when={agent.isQueued(props.song.id, props.line.id)} fallback={<span class="muted">{t("detail.unannotated")}</span>}>
        <span class="agent-dot" />
        <span class="muted">
          {active() ? t(agent.state.retries[props.line.id] ? "detail.agentFixing" : "detail.agentWorking") : t("detail.agentQueued")}
        </span>
      </Show>
    </div>
  );
}

function WordCard(props: { t: ResolvedToken; picked: boolean; onPick: () => void }) {
  const tok = () => props.t.token;
  const d = () => props.t.derivation;
  const fn = () => ["particle", "aux", "copula", "symbol"].includes(tok().pos) && !tok().steps?.length;
  return (
    <div class="word" classList={{ fn: fn(), picked: props.picked }} onClick={props.onPick}>
      <div class="w-text">
        <Ruby segs={props.t.ruby} />
      </div>
      <div class="w-meta">
        <Show when={tok().reading}>
          <span>{tok().reading}</span>
        </Show>
        <span>{label.pos(tok().pos, POS_ZH[tok().pos] ?? tok().pos)}</span>
        <Show when={tok().lemma}>
          {(l) => {
            const cls = () => label.cls(l().class, CLASS_INFO[l().class]);
            return <span>{tok().pos === "aux" ? t("detail.inflectsLike", { cls: cls() }) : cls()}</span>;
          }}
        </Show>
        <Show when={tok().jlpt}>
          <span class={`lv ${tok().jlpt}`}>{tok().jlpt}</span>
        </Show>
      </div>
      <Show when={tok().gloss}>
        <div class="w-gloss">{tok().gloss}</div>
      </Show>
      <Show when={d()?.ok && d()!.steps.length && tok().lemma}>
        <div class="w-chain">
          <span class="base">
            <Ruby segs={rubyFor(tok().lemma!.text, tok().lemma!.reading)} />
          </span>
          <For each={d()!.steps}>
            {(s) => (
              <>
                <span class="arrow">
                  <span class="step">{STEP_INFO[s.step].label}</span>
                </span>
                <span class="form">{s.text}</span>
              </>
            )}
          </For>
        </div>
        <Show when={props.picked}>
          <ol class="w-rules">
            <For each={d()!.steps}>
              {(s) => (
                <li>
                  <b>{STEP_INFO[s.step].label}</b>
                  {lang() === "en" ? ` (${label.step(s.step, STEP_INFO[s.step].zh)}): ` : `（${STEP_INFO[s.step].zh}）：`}
                  {s.rule}
                </li>
              )}
            </For>
          </ol>
        </Show>
      </Show>
      <Show when={props.picked && tok().note}>
        <div class="w-note">{tok().note}</div>
      </Show>
    </div>
  );
}

function GrammarRow(props: { g: ResolvedGrammar; line: Line; onFocus: (r: [number, number] | null) => void }) {
  const p = () => props.g.point;
  return (
    <li
      class="gref"
      classList={{ auto: props.g.auto }}
      onMouseEnter={() => props.onFocus([props.g.start, props.g.end])}
      onMouseLeave={() => props.onFocus(null)}
    >
      <span class={`lv ${p()?.level ?? ""}`}>{p()?.level ?? "?"}</span>
      <div class="gref-body">
        <div class="gref-head">
          <span class="gref-title">{p()?.title ?? props.g.id}</span>
          <span class="gref-zh">{p()?.zh}</span>
          <span class="gref-span">「{props.line.ja.slice(props.g.start, props.g.end)}」</span>
        </div>
        <Show when={props.g.note}>
          <div class="gref-note">{props.g.note}</div>
        </Show>
      </div>
      <Show when={p()}>
        <button class="link" title={t("detail.outlineTip")} onClick={() => app.openGrammar(props.g.id)}>
          {t("detail.outline")} <IconArrow />
        </button>
      </Show>
    </li>
  );
}
