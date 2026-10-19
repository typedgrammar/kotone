// Rendering primitives for annotated Japanese: furigana, chunk colouring, focus ranges and
// the matching coloured Chinese translation.

import { For, Show, type JSX } from "solid-js";
import type { LineAnalysis, ResolvedChunk, ResolvedToken } from "../../../core/analyze.ts";
import type { RubySeg } from "../../../core/furigana.ts";

export const CHUNK_COLORS = 6;

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
}) {
  const token = (t: ResolvedToken): JSX.Element => (
    <span
      class="tok"
      classList={{ focus: overlaps(t, props.focus), clickable: !!props.onToken }}
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
                  class={`chunk c${c().index % CHUNK_COLORS}`}
                  classList={{ hot: props.hot === c().index }}
                  onMouseEnter={() => props.onHot?.(c().index)}
                  onMouseLeave={() => props.onHot?.(null)}
                >
                  <For each={g.tokens}>{token}</For>
                  <span class="role">{c().chunk.role}</span>
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
export function ZhLine(props: { zh: string; analysis: LineAnalysis; hot?: number | null; onHot?: (i: number | null) => void }) {
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
            class={`zfrag c${p.c % CHUNK_COLORS}`}
            classList={{ hot: props.hot === p.c }}
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
    <span class="excerpt">
      <JaLine ja={props.ja} analysis={props.analysis} focus={props.range} />
    </span>
  );
}
