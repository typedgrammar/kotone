// The breakdown of one lyric line, organised around its phrases (chunks): the line itself is the
// tab bar. "Whole line" gives the sentence-level picture; picking a phrase shows just its words and
// the grammar it touches, so nothing needs a long scroll. ←/→ step through the phrases.

import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { POS_ZH, type LineAnalysis, type ResolvedChunk, type ResolvedGrammar, type ResolvedToken } from "../../../core/analyze.ts";
import { CLASS_INFO, STEP_INFO } from "../../../core/conjugate.ts";
import { rubyFor } from "../../../core/furigana.ts";
import type { Line, Song } from "../../../core/types.ts";
import { agent } from "../agent.ts";
import { label, lang, t } from "../i18n.ts";
import { app } from "../state.ts";
import { IconArrow } from "./icons.tsx";
import { CHUNK_COLORS, JaLine, Ruby, ZhLine } from "./Text.tsx";

const ordered = (gs: ResolvedGrammar[]) => gs.filter((g) => !g.auto).concat(gs.filter((g) => g.auto));
const within = (g: ResolvedGrammar, c: ResolvedChunk) => g.start >= c.start && g.end <= c.end;
const touches = (g: ResolvedGrammar, c: ResolvedChunk) => g.start < c.end && c.start < g.end;

export function LineDetail(props: { song: Song; line: Line; analysis: LineAnalysis }) {
  const [hot, setHot] = createSignal<number | null>(null);
  const [focus, setFocus] = createSignal<[number, number] | null>(null);
  const [picked, setPicked] = createSignal<number | null>(null);
  /** null = whole line */
  const [sel, setSel] = createSignal<number | null>(null);
  const a = () => props.analysis;
  const chunk = () => (sel() === null ? null : a().chunks[sel()!]);

  function select(i: number | null) {
    setSel(i);
    setPicked(null);
    setFocus(null);
  }
  // clicking a word in the line opens its phrase with that word picked
  function pickToken(i: number) {
    const c = a().chunks.find((c) => i >= c.tokenStart && i < c.tokenEnd);
    select(c ? c.index : null);
    setPicked(i);
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.metaKey || e.altKey || app.settingsOpen()) return;
      if ((e.target as Element).closest?.("input, textarea") || !a().chunks.length) return;
      e.preventDefault();
      // whole line sits before the first phrase: -1, 0 … n-1
      const n = a().chunks.length;
      const cur = sel() ?? -1;
      const next = e.key === "ArrowRight" ? Math.min(n - 1, cur + 1) : Math.max(-1, cur - 1);
      select(next < 0 ? null : next);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div class="detail" onClick={(e) => e.stopPropagation()}>
      <Show when={a().tokens.length} fallback={<Unannotated song={props.song} line={props.line} />}>
        <section class="structure">
          <div class="structure-bar">
            <button class="whole" classList={{ on: sel() === null }} onClick={() => select(null)}>
              {t("detail.whole")}
            </button>
            <Show when={a().chunks.length > 1}>
              <span class="keys" title={t("detail.keysTip")}>
                <kbd>←</kbd>
                <kbd>→</kbd>
              </span>
            </Show>
          </div>
          <div class="structure-ja">
            <JaLine
              ja={props.line.ja}
              analysis={a()}
              chunks
              hot={hot()}
              onHot={setHot}
              focus={focus()}
              onToken={pickToken}
              selected={sel()}
              onChunk={(i) => select(sel() === i ? null : i)}
            />
          </div>
          <Show when={props.line.zh}>
            <div class="structure-zh">
              <ZhLine zh={props.line.zh!} analysis={a()} hot={hot()} onHot={setHot} selected={sel()} onChunk={(i) => select(sel() === i ? null : i)} />
            </div>
          </Show>
        </section>

        <Show when={chunk()} keyed fallback={<Whole line={props.line} analysis={a()} hot={hot()} onHot={setHot} onSelect={select} onFocus={setFocus} picked={picked()} onPick={setPicked} />}>
          {(c) => <Phrase c={c} line={props.line} analysis={a()} picked={picked()} onPick={setPicked} onFocus={setFocus} />}
        </Show>
      </Show>
    </div>
  );
}

/** Fades the bottom edge while there's more to scroll to, so a clipped list doesn't look finished. */
function fadeWhenClipped(el: HTMLElement) {
  const update = () => el.classList.toggle("clipped", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  const ro = new ResizeObserver(update);
  ro.observe(el);
  // a picked word card grows the content without resizing the box
  queueMicrotask(() => [...el.children].forEach((c) => ro.observe(c)));
  el.addEventListener("scroll", update, { passive: true });
  onCleanup(() => ro.disconnect());
}

/** Whole line: the sentence note, one row per phrase (each opens it), grammar spanning phrases. */
function Whole(props: {
  line: Line;
  analysis: LineAnalysis;
  hot: number | null;
  onHot: (i: number | null) => void;
  onSelect: (i: number) => void;
  onFocus: (r: [number, number] | null) => void;
  picked: number | null;
  onPick: (i: number | null) => void;
}) {
  const a = () => props.analysis;
  const across = () => ordered(a().grammar.filter((g) => !a().chunks.some((c) => within(g, c))));
  // words no phrase claims (or every word, for a line annotated without chunks)
  const loose = () => a().tokens.filter((tk) => !a().chunks.some((c) => tk.index >= c.tokenStart && tk.index < c.tokenEnd));
  return (
    <div class="tab-body" ref={fadeWhenClipped}>
      <Show when={props.line.note}>
        <p class="line-note">{props.line.note}</p>
      </Show>
      <Show when={a().chunks.length}>
        <ul class="phrase-list">
          <For each={a().chunks}>
            {(c) => (
              <li
                class={`c${c.index % CHUNK_COLORS}`}
                classList={{ hot: props.hot === c.index }}
                onMouseEnter={() => props.onHot(c.index)}
                onMouseLeave={() => props.onHot(null)}
                onClick={() => props.onSelect(c.index)}
              >
                <span class="dot" />
                <span class="pl-role">{c.chunk.role}</span>
                <span class="pl-ja">{c.chunk.ja}</span>
                <span class="pl-zh">{c.zh.map(([s, e]) => props.line.zh!.slice(s, e)).join("…")}</span>
                <span class="pl-note">{c.chunk.note}</span>
                <IconArrow />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={loose().length}>
        <Words tokens={loose()} picked={props.picked} onPick={props.onPick} />
      </Show>
      <Show when={across().length}>
        <div>
          <h4>{t(a().chunks.length ? "detail.lineGrammar" : "detail.points")}</h4>
          <ul class="grammar-refs">
            <For each={across()}>{(g) => <GrammarRow g={g} line={props.line} onFocus={props.onFocus} />}</For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

/** One phrase: what it does in the sentence, its words, the grammar it touches. */
function Phrase(props: {
  c: ResolvedChunk;
  line: Line;
  analysis: LineAnalysis;
  picked: number | null;
  onPick: (i: number | null) => void;
  onFocus: (r: [number, number] | null) => void;
}) {
  const tokens = () => props.analysis.tokens.slice(props.c.tokenStart, props.c.tokenEnd);
  const grammar = createMemo(() => ordered(props.analysis.grammar.filter((g) => touches(g, props.c))));
  const zh = () => props.c.zh.map(([s, e]) => props.line.zh!.slice(s, e)).join("…");
  return (
    <div class={`tab-body phrase c${props.c.index % CHUNK_COLORS}`} ref={fadeWhenClipped}>
      <div class="phrase-head">
        <span class="pl-role">{props.c.chunk.role}</span>
        <span class="ph-ja">{props.c.chunk.ja}</span>
        <Show when={zh()}>
          <span class="ph-zh">{zh()}</span>
        </Show>
      </div>
      <Show when={props.c.chunk.note}>
        <p class="line-note">{props.c.chunk.note}</p>
      </Show>
      <div class="phrase-cols" classList={{ single: !grammar().length }}>
        <div>
          <h4>{t("detail.words")}</h4>
          <Words tokens={tokens()} picked={props.picked} onPick={props.onPick} />
        </div>
        <Show when={grammar().length}>
          <div>
            <h4>{t("detail.points")}</h4>
            <ul class="grammar-refs">
              <For each={grammar()}>{(g) => <GrammarRow g={g} line={props.line} onFocus={props.onFocus} />}</For>
            </ul>
          </div>
        </Show>
      </div>
    </div>
  );
}

function Words(props: { tokens: ResolvedToken[]; picked: number | null; onPick: (i: number | null) => void }) {
  return (
    <div class="words">
      <For each={props.tokens}>
        {(tk) => <WordCard t={tk} picked={props.picked === tk.index} onPick={() => props.onPick(props.picked === tk.index ? null : tk.index)} />}
      </For>
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
