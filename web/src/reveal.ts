// Scrolls the lyric list to a line. Not scrollIntoView: that also scrolls every clipped ancestor,
// and when the list can't move far enough (first or last lines) it shifts the whole window up.

const EDGE = 28; // the list's faded top edge

export function revealLine(id: string, where: "center" | "start" | "nearest", smooth = false) {
  const el = document.getElementById(`line-${id}`);
  const list = el?.closest<HTMLElement>("[data-lines-scroll]");
  if (!el || !list) return;
  const r = el.getBoundingClientRect();
  const v = list.getBoundingClientRect();
  const offset = r.top - v.top;
  let top: number;
  if (where === "center") top = list.scrollTop + offset - (v.height - r.height) / 2;
  else if (where === "start" || offset < EDGE) top = list.scrollTop + offset - EDGE;
  else if (r.bottom > v.bottom) top = list.scrollTop + r.bottom - v.bottom + 8;
  else return;
  list.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}
