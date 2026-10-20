// Class strings for the few patterns several screens share. Everything else is written inline as
// Tailwind utilities; these stay plain strings (not CSS) so a native port can import them as-is.

export const muted = "text-fg-2";
export const err = "text-c0";
export const link = "inline-flex items-center gap-0.5 text-[12px] whitespace-nowrap text-accent hover:underline";
/** Square 26px icon button */
export const iconButton = "inline-grid size-6.5 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg";
/** A view's placeholder text ("nothing here yet") */
export const empty = "m-0 p-8 text-fg-2";
/** Small caps-ish label over a section */
export const sectionLabel = "m-0 mb-2 font-ui text-[11px]/[normal] font-semibold tracking-[0.08em] text-fg-3";

export function btn(o: { primary?: boolean; small?: boolean } = {}): string {
  return [
    "rounded-lg whitespace-nowrap",
    o.small ? "px-2.5 py-0.75 text-[12px]" : "px-3 py-1.25",
    o.primary ? "bg-accent text-white enabled:hover:brightness-108" : "bg-hover enabled:hover:bg-sel",
  ].join(" ");
}

/** Text input: monospace (paths, ids) */
export const field = "w-full rounded-[7px] border border-line bg-bg px-[9px] py-1 font-mono text-[12px]/[normal] outline-none focus:border-accent";
/** The search box in a view header */
export const searchField = "w-30 rounded-[7px] border border-line bg-elev px-[9px] py-0.75 outline-none focus:border-accent";

// views with a header (library, grammar, vocab, favorites, lyric search)
export const view = "flex h-full flex-col";
export const viewHead = "flex flex-wrap items-end justify-between gap-3 border-b border-line px-7 pt-8.5 pb-3.5";
export const viewTitle = "m-0 font-ui text-[22px]/[1.2] font-semibold";
export const viewTools = "flex items-center gap-2";

/** JLPT level badge */
export function level(lv?: string): string {
  const tone = lv === "N5" ? "text-n5 bg-n5/14" : lv === "N4" ? "text-n4 bg-n4/14" : "text-n3 bg-n3/14";
  return `inline-block mt-0.5 rounded px-1.25 py-0.75 text-center font-ui text-[10px]/none font-semibold ${tone}`;
}

/** Sets --cc / --cc-bg to chunk colour i, for children styled with text-(--cc), bg-(--cc-bg)… */
export const CHUNK = [
  "[--cc:var(--c0)] [--cc-bg:var(--c0-bg)]",
  "[--cc:var(--c1)] [--cc-bg:var(--c1-bg)]",
  "[--cc:var(--c2)] [--cc-bg:var(--c2-bg)]",
  "[--cc:var(--c3)] [--cc-bg:var(--c3-bg)]",
  "[--cc:var(--c4)] [--cc-bg:var(--c4-bg)]",
  "[--cc:var(--c5)] [--cc-bg:var(--c5-bg)]",
];
export const chunkColor = (i: number) => CHUNK[i % CHUNK.length];
