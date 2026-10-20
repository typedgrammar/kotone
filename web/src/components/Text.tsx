// Rendering primitives for annotated Japanese: furigana, chunk colouring, focus ranges and
// the matching coloured Chinese translation.

import { For, Show, type JSX } from "solid-js";
import type { LineAnalysis, ResolvedChunk, ResolvedToken } from "../../../core/analyze.ts";
import type { RubySeg } from "../../../core/furigana.ts";
import { chunkColor } from "../ui.ts";

export function Ruby(props: { segs: RubySeg[] }) {
  return (
    <For each={props.segs}>
      {(s) =>
        s.ruby ? (
          <ruby>
            {s.text}
            <rp>(</rp>
            <rt>{s.ruby}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          s.text
        )
      }
    </For>
  );
}

/** A chunk: underlined in its colour, tinted while hovered or selected, faded while another is. */
function chunkClass(i: number, o: { hot: boolean; sel: boolean; dim: boolean; tab: boolean }) {
  return [
    "relative mx-[3px] inline-block rounded-t-[4px] border-b-[2.5px] border-(--cc) px-0.5 leading-[2.15] [transition:background_0.12s,opacity_0.15s]",
    chunkColor(i),
    o.hot || o.sel ? "bg-(--cc-bg)" : "",
    o.dim && !o.hot ? "opacity-42" : "",
    // in the breakdown the role labels are the tabs
    o.tab ? "group/chunk cursor-pointer text-center" : "",
  ].join(" ");
}

/** The role under a chunk; as a tab it becomes a chip, solid when selected. */
function roleClass(tab: boolean, sel: boolean) {
  const base =
    "absolute top-full left-1/2 -translate-x-1/2 font-ui text-[10.5px]/none font-semibold tracking-[0.04em] whitespace-nowrap";
  if (!tab) return `${base} mt-1 text-(--cc)`;
  return `${base} mt-1.5 rounded-full px-[7px] py-[3px] [transition:background_0.12s,color_0.12s] ${
    sel ? "bg-(--cc) text-elev" : "bg-(--cc-bg) text-(--cc) group-hover/chunk:bg-(--cc)/26"
  }`;
}

/** Width of a role label drawn as a tab, so a one-kana chunk is still wide enough for it. */
const chipWidth = (role: string) => [...role].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 11 : 6.5), 18);

const overlaps = (t: ResolvedToken, r?: [number, number] | null) => !!r && t.start >= 0 && t.start < r[1] && r[0] < t.end;

interface Group {
  chunk: ResolvedChunk | null;
  tokens: ResolvedToken[];
  gap: string;
}

function groupTokens(a: LineAnalysis, byChunk: boolean): Group[] {
  const groups: Group[] = [];
  a.tokens.forEach((t, i) => {
    const chunk = byChunk ? (a.chunks.find((c) => i >= c.tokenStart && i < c.tokenEnd) ?? null) : null;
    const last = groups.at(-1);
    if (last && chunk && last.chunk === chunk) last.tokens.push(t);
    else groups.push({ chunk, tokens: [t], gap: t.gap });
  });
  return groups;
}

export function JaLine(props: {
  ja: string;
  analysis: LineAnalysis;
  /** Colour chunks and label them with their role */
  chunks?: boolean;
  focus?: [number, number] | null;
  hot?: number | null;
  onHot?: (i: number | null) => void;
  onToken?: (i: number) => void;
  /** The chunk being looked at; the others dim */
  selected?: number | null;
  onChunk?: (i: number) => void;
}) {
  const token = (t: ResolvedToken): JSX.Element => (
    <span
      classList={{ "bg-focus shadow-[inset_0_-2px_var(--accent)]": overlaps(t, props.focus), "cursor-pointer": !!props.onToken }}
      onClick={props.onToken ? (e) => (e.stopPropagation(), props.onToken!(t.index)) : undefined}
    >
      <Ruby segs={t.ruby} />
    </span>
  );
  return (
    <Show when={props.analysis.tokens.length} fallback={<span>{props.ja}</span>}>
      <For each={groupTokens(props.analysis, !!props.chunks)}>
        {(g) => (
          <>
            {g.gap ? " " : ""}
            <Show when={g.chunk} fallback={<For each={g.tokens}>{token}</For>}>
              {(c) => (
                <span
                  data-chunk={c().index}
                  class={chunkClass(c().index, {
                    hot: props.hot === c().index,
                    sel: props.selected === c().index,
                    dim: props.selected != null && props.selected !== c().index,
                    tab: !!props.onChunk,
                  })}
                  style={props.onChunk ? { "min-width": `${chipWidth(c().chunk.role)}px` } : undefined}
                  onClick={props.onChunk ? (e) => (e.stopPropagation(), props.onChunk!(c().index)) : undefined}
                  onMouseEnter={() => props.onHot?.(c().index)}
                  onMouseLeave={() => props.onHot?.(null)}
                >
                  <For each={g.tokens}>{token}</For>
                  <span class={roleClass(!!props.onChunk, props.selected === c().index)}>{c().chunk.role}</span>
                </span>
              )}
            </Show>
          </>
        )}
      </For>
    </Show>
  );
}

/** The translation with each chunk's fragments tinted in the chunk's colour. */
export function ZhLine(props: {
  zh: string;
  analysis: LineAnalysis;
  hot?: number | null;
  onHot?: (i: number | null) => void;
  selected?: number | null;
  onChunk?: (i: number) => void;
}) {
  const parts = () => {
    const marks = props.analysis.chunks
      .flatMap((c) => c.zh.map(([s, e]) => ({ s, e, c: c.index })))
      .sort((a, b) => a.s - b.s);
    const out: { text: string; c: number | null }[] = [];
    let pos = 0;
    for (const m of marks) {
      if (m.s > pos) out.push({ text: props.zh.slice(pos, m.s), c: null });
      out.push({ text: props.zh.slice(m.s, m.e), c: m.c });
      pos = m.e;
    }
    if (pos < props.zh.length) out.push({ text: props.zh.slice(pos), c: null });
    return out;
  };
  return (
    <For each={parts()}>
      {(p) =>
        p.c === null ? (
          p.text
        ) : (
          <span
            class={`rounded-t-[3px] border-b-2 border-(--cc) px-px [transition:background_0.12s,opacity_0.15s] ${chunkColor(p.c)} ${
              props.hot === p.c ? "bg-(--cc-bg)" : props.selected != null && props.selected !== p.c ? "opacity-42" : ""
            } ${props.onChunk ? "cursor-pointer" : ""}`}
            onClick={props.onChunk ? (e) => (e.stopPropagation(), props.onChunk!(p.c!)) : undefined}
            onMouseEnter={() => props.onHot?.(p.c)}
            onMouseLeave={() => props.onHot?.(null)}
          >
            {p.text}
          </span>
        )
      }
    </For>
  );
}

/** Plain lyric text with a highlighted [start, end) range — used in example lists. */
export function Excerpt(props: { ja: string; analysis: LineAnalysis; range: [number, number] }) {
  return (
    <span>
      <JaLine ja={props.ja} analysis={props.analysis} focus={props.range} />
    </span>
  );
}
