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
import { IconArrow, IconRedo } from "./icons.tsx";
import { JaLine, Ruby, ZhLine } from "./Text.tsx";
import { chunkColor, level, link, sectionLabel } from "../ui.ts";

const ordered = (gs: ResolvedGrammar[]) => gs.filter((g) => !g.auto).concat(gs.filter((g) => g.auto));
const within = (g: ResolvedGrammar, c: ResolvedChunk) => g.start >= c.start && g.end <= c.end;
const touches = (g: ResolvedGrammar, c: ResolvedChunk) => g.start < c.end && c.start < g.end;

const lineNote = "m-0 text-[13.5px]/[1.75]";
const plRole = "font-ui text-[11px]/[normal] font-semibold whitespace-nowrap text-(--cc)";

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
    <div class="flex min-h-0 flex-auto cursor-auto flex-col gap-3 px-3.5 pt-3 pb-3.5 select-text" onClick={(e) => e.stopPropagation()}>
      <Show when={a().tokens.length} fallback={<Unannotated song={props.song} line={props.line} />}>
        {/* the line is the tab bar: it stays put; only what's below it scrolls */}
        <section class="flex-none rounded-xl bg-panel px-4.5 pt-2.5 pb-3">
          <div class="mb-0.5 flex items-center gap-3">
            <button
              class={`rounded-full border px-2.5 py-0.5 text-[12px] ${sel() === null ? "border-transparent bg-accent-soft text-accent" : "border-line text-fg-2"}`}
              onClick={() => select(null)}
            >
              {t("detail.whole")}
            </button>
            <Redo song={props.song} line={props.line} />
            <Show when={a().chunks.length > 1}>
              <span class="flex gap-[3px]" title={t("detail.keysTip")}>
                <kbd class={kbd}>←</kbd>
                <kbd class={kbd}>→</kbd>
              </span>
            </Show>
          </div>
          <div class="font-ja text-[22px]/[3] tracking-[0.03em]">
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
            <div class="mt-3.5 font-zh text-[17px]/[1.9]">
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

const kbd = "min-w-4.5 rounded-[5px] border border-b-2 border-line px-1 py-px text-center font-ui text-[11px]/[1.3] text-fg-3";

/** Below the line: scrolls on its own, and fades its bottom edge (data-clipped) while there's
 *  more to scroll to, so a clipped list doesn't look finished. */
const tabBody =
  "grid min-h-0 flex-auto animate-tab-in content-start gap-3 overflow-y-auto overscroll-contain px-1 pb-1 data-clipped:[mask-image:linear-gradient(to_bottom,#000_calc(100%_-_40px),transparent)]";

function fadeWhenClipped(el: HTMLElement) {
  const update = () => el.toggleAttribute("data-clipped", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
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
    <div class={tabBody} ref={fadeWhenClipped}>
      <Show when={props.line.note}>
        <p class={lineNote}>{props.line.note}</p>
      </Show>
      <Show when={a().chunks.length}>
        <ul class="m-0 grid list-none gap-px p-0">
          <For each={a().chunks}>
            {(c) => (
              <li
                class={`grid cursor-pointer grid-cols-[8px_auto_auto_auto_minmax(0,1fr)_16px] items-baseline gap-2.5 rounded-lg px-2 py-[3px] text-[12.5px] [&>svg]:self-center [&>svg]:text-fg-3 ${chunkColor(c.index)} ${
                  props.hot === c.index ? "bg-hover [&>svg]:opacity-100" : "[&>svg]:opacity-0"
                }`}
                onMouseEnter={() => props.onHot(c.index)}
                onMouseLeave={() => props.onHot(null)}
                onClick={() => props.onSelect(c.index)}
              >
                <span class="size-2 self-center rounded-full bg-(--cc)" />
                <span class={plRole}>{c.chunk.role}</span>
                <span class="font-ja text-[15px]/[normal] whitespace-nowrap">{c.chunk.ja}</span>
                <span class="font-zh text-[14px]/[normal] whitespace-nowrap text-fg-2">{c.zh.map(([s, e]) => props.line.zh!.slice(s, e)).join("…")}</span>
                <span class="leading-[1.6]">{c.chunk.note}</span>
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
          <h4 class={sectionLabel}>{t(a().chunks.length ? "detail.lineGrammar" : "detail.points")}</h4>
          <ul class={grammarRefs}>
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
    <div class={`${tabBody} ${chunkColor(props.c.index)}`} ref={fadeWhenClipped}>
      <div class="flex flex-wrap items-baseline gap-3">
        <span class={`${plRole} self-center rounded-md bg-(--cc-bg) px-2 py-[3px]`}>{props.c.chunk.role}</span>
        <span class="font-ja text-[21px]/[normal]">{props.c.chunk.ja}</span>
        <Show when={zh()}>
          <span class="font-zh text-[16px]/[normal] text-fg-2">{zh()}</span>
        </Show>
      </div>
      <Show when={props.c.chunk.note}>
        <p class={lineNote}>{props.c.chunk.note}</p>
      </Show>
      {/* words beside grammar when there's room for both */}
      <div
        class={`grid grid-cols-[minmax(0,1fr)] items-start gap-6 ${grammar().length ? "min-[981px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""}`}
      >
        <div>
          <h4 class={sectionLabel}>{t("detail.words")}</h4>
          <Words tokens={tokens()} picked={props.picked} onPick={props.onPick} />
        </div>
        <Show when={grammar().length}>
          <div>
            <h4 class={sectionLabel}>{t("detail.points")}</h4>
            <ul class={grammarRefs}>
              <For each={grammar()}>{(g) => <GrammarRow g={g} line={props.line} onFocus={props.onFocus} />}</For>
            </ul>
          </div>
        </Show>
      </div>
    </div>
  );
}

const grammarRefs = "grid list-none gap-px p-0";

function Words(props: { tokens: ResolvedToken[]; picked: number | null; onPick: (i: number | null) => void }) {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={props.tokens}>
        {(tk) => <WordCard t={tk} picked={props.picked === tk.index} onPick={() => props.onPick(props.picked === tk.index ? null : tk.index)} />}
      </For>
    </div>
  );
}

/**
 * For the odd line whose annotation turns out wrong once heard: one click hands just this line back
 * to Codex. The old annotation stays until the new one passes the check.
 */
function Redo(props: { song: Song; line: Line }) {
  const queued = () => agent.isQueued(props.song.id, props.line.id);
  const busy = () => agent.state.status === "working" || agent.state.status === "starting";
  return (
    <Show
      when={queued()}
      fallback={
        <button
          class="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-fg-3 enabled:hover:bg-hover enabled:hover:text-fg-2 [&_svg]:size-3"
          disabled={busy()}
          title={t(busy() ? "detail.redoBusy" : "detail.redoTip")}
          onClick={() => agent.annotate(props.song, [props.line.id])}
        >
          <IconRedo />
          {t("detail.redo")}
        </button>
      }
    >
      <span class="ml-auto flex items-center gap-1.5 text-[11.5px] text-fg-2">
        <span class="size-1.5 flex-none animate-agent-pulse rounded-full bg-accent" />
        {t(agent.state.retries[props.line.id] ? "detail.agentFixing" : "detail.redoing")}
      </span>
    </Show>
  );
}

function Unannotated(props: { song: Song; line: Line }) {
  const active = () => agent.isWorking(props.song.id, props.line.id);
  return (
    <div class="flex flex-wrap items-center gap-2.5">
      <Show when={agent.isQueued(props.song.id, props.line.id)} fallback={<span class="text-fg-2">{t("detail.unannotated")}</span>}>
        <span class="size-[7px] flex-none animate-agent-pulse rounded-full bg-accent" />
        <span class="text-fg-2">
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
    <div
      class={`max-w-full cursor-pointer rounded-[10px] border px-3 pt-1.5 pb-[9px] transition-[border-color] duration-120 ${
        props.picked ? "border-accent" : "border-line hover:border-accent"
      } ${fn() ? "min-w-0 bg-transparent" : "min-w-23 bg-elev"}`}
      onClick={props.onPick}
    >
      <div class="font-ja text-[20px]/[2]">
        <Ruby segs={props.t.ruby} />
      </div>
      <div class="flex flex-wrap gap-1.5 text-[11px] text-fg-2">
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
          <span class={level(tok().jlpt)}>{tok().jlpt}</span>
        </Show>
      </div>
      <Show when={tok().gloss}>
        <div class="mt-0.5 text-[13px]">{tok().gloss}</div>
      </Show>
      <Show when={d()?.ok && d()!.steps.length && tok().lemma}>
        <div class="mt-1.5 flex flex-wrap items-center gap-1 font-ja text-[14px]/[2]">
          <span class="text-fg-2">
            <Ruby segs={rubyFor(tok().lemma!.text, tok().lemma!.reading)} />
          </span>
          <For each={d()!.steps}>
            {(s) => (
              <>
                <span class="inline-flex items-center after:ml-1 after:font-ui after:text-fg-3 after:content-['→']">
                  <span class="rounded-[5px] bg-accent-soft px-1.5 py-[3px] font-ui text-[10.5px]/none font-semibold text-accent">
                    {STEP_INFO[s.step].label}
                  </span>
                </span>
                <span class="text-fg">{s.text}</span>
              </>
            )}
          </For>
        </div>
        <Show when={props.picked}>
          <ol class="mt-1.5 max-w-105 list-decimal pl-4.5 text-[12px]/[1.7] text-fg-2">
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
        <div class="mt-1.5 text-[12px] text-fg-2">{tok().note}</div>
      </Show>
    </div>
  );
}

function GrammarRow(props: { g: ResolvedGrammar; line: Line; onFocus: (r: [number, number] | null) => void }) {
  const p = () => props.g.point;
  return (
    <li
      class="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-lg px-2.5 py-[7px] hover:bg-hover"
      onMouseEnter={() => props.onFocus([props.g.start, props.g.end])}
      onMouseLeave={() => props.onFocus(null)}
    >
      <span class={level(p()?.level)}>{p()?.level ?? "?"}</span>
      <div>
        <div class="flex flex-wrap items-baseline gap-2">
          <span class={`font-ja text-[14px]/[normal] ${props.g.auto ? "font-medium" : "font-semibold"}`}>{p()?.title ?? props.g.id}</span>
          <span class="text-fg-2">{p()?.zh}</span>
          <span class="font-ja text-[13px]/[normal] text-fg-3">「{props.line.ja.slice(props.g.start, props.g.end)}」</span>
        </div>
        <Show when={props.g.note}>
          <div class="mt-0.5 text-[12.5px]/[1.65]">{props.g.note}</div>
        </Show>
      </div>
      <Show when={p()}>
        <button class={link} title={t("detail.outlineTip")} onClick={() => app.openGrammar(props.g.id)}>
          {t("detail.outline")} <IconArrow />
        </button>
      </Show>
    </li>
  );
}
