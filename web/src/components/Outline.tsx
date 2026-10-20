// Grammar outline, vocabulary and favourites: the "reverse" views that go from a knowledge
// point or word back to the lyric lines that use it.

import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { POS_ZH } from "../../../core/analyze.ts";
import { CLASS_INFO } from "../../../core/conjugate.ts";
import { rubyFor } from "../../../core/furigana.ts";
import { CATEGORIES, GRAMMAR } from "../../../core/grammar.ts";
import { analysisOf, indexGrammar, indexVocab, type LineFilter, type LineRef } from "../../../core/library.ts";
import type { GrammarPoint } from "../../../core/types.ts";
import { label, t } from "../i18n.ts";
import { app } from "../state.ts";
import { empty, level as levelBadge, link, searchField, sectionLabel, view, viewHead, viewTitle, viewTools } from "../ui.ts";
import { Segmented } from "./controls.tsx";
import { IconStar } from "./icons.tsx";
import { Excerpt, JaLine, Ruby } from "./Text.tsx";

// shared by the three views: the outline list on the left, the detail on the right
const split = "grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)]";
const outline = "min-w-0 overflow-y-auto border-r border-line px-2 pt-1 pb-6";
const cat = "px-2 pt-3.5 pb-1 font-ui text-[11px]/[normal] font-semibold tracking-[0.06em] text-fg-3";
const detail = "overflow-y-auto px-9 pt-6 pb-12 select-text";
const detailHead = "flex items-baseline gap-2.5";
const detailTitle = "m-0 font-ja text-[26px]/[1.8] font-semibold";
const detailZh = "text-[14px] text-fg-2";
const summary = "my-3.5 max-w-160 text-[14px]/[1.8]";
const cards = "grid gap-2";
// an example / favourite line card
const card = "cursor-pointer rounded-xl border border-line bg-elev px-4 pt-2.5 pb-3 transition-[border-color] duration-120 hover:border-accent";
const cardJa = "flex justify-between gap-2 font-ja text-[19px]/[2.15]";
const cardZh = "font-zh text-[14px]/[1.6] text-fg-2";
const cardSrc = "mt-1.5 flex items-center justify-between text-[11px] text-fg-3";

/** A row of the outline list; the selected one is filled with the accent */
function pointRow(sel: boolean) {
  return `grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2 rounded-md px-2 py-1.25 text-left ${sel ? "bg-accent text-white" : "hover:bg-hover"}`;
}
const pointTitle = "font-ja text-[14px]/[normal] whitespace-nowrap";
const pointZh = (sel: boolean) => `truncate text-[11.5px] ${sel ? "text-white" : "text-fg-3"}`;
const pointCount = (sel: boolean) => `ml-auto text-[11px] tabular-nums ${sel ? "text-white" : "text-fg-3"}`;

const scopeFilter = (): LineFilter => (app.settings.scope === "favorites" ? (s, l) => app.isFav(s.id, l.id) : () => true);

function ScopeBar(props: { title: string; children?: JSX.Element }) {
  return (
    <header class={viewHead}>
      <h2 class={viewTitle}>{props.title}</h2>
      <div class={viewTools}>
        {props.children}
        <Segmented
          value={app.settings.scope}
          options={[
            ["favorites", t("scope.favorites")],
            ["all", t("scope.all")],
          ]}
          onChange={(scope) => app.setSettings({ scope })}
        />
      </div>
    </header>
  );
}

type Level = "all" | "N5" | "N4" | "N3+";
const levelOk = (lv: string | undefined, f: Level) => f === "all" || (f === "N3+" ? !lv || !["N5", "N4"].includes(lv) : lv === f);

function ExampleRow(props: { ex: LineRef; range: [number, number]; note?: string }) {
  const a = () => analysisOf(props.ex.song, props.ex.line);
  return (
    <li class={card} onClick={() => app.jumpTo(props.ex.song.id, props.ex.line.id)}>
      <div class={cardJa}>
        <Excerpt ja={props.ex.line.ja} analysis={a()} range={props.range} />
        <Show when={app.isFav(props.ex.song.id, props.ex.line.id)}>
          <span class="text-star">
            <IconStar filled />
          </span>
        </Show>
      </div>
      <div class={cardZh}>{props.ex.line.zh}</div>
      <Show when={props.note}>
        <div class="mt-1.5 text-[12.5px]/[1.65]">{props.note}</div>
      </Show>
      <div class={cardSrc}>
        {props.ex.song.title} · {props.ex.song.artist}
      </div>
    </li>
  );
}

function EmptyScope(props: { all: number }) {
  return (
    <p class="m-0 text-fg-2">
      <Show when={app.settings.scope === "favorites"} fallback={t("grammar.noneInLibrary")}>
        {t("grammar.noneInFavorites")}
        <Show when={props.all}>
          <button class={link} onClick={() => app.setSettings({ scope: "all" })}>
            {t("grammar.seeAll", { n: props.all })}
          </button>
        </Show>
      </Show>
    </p>
  );
}

// ---- grammar outline ------------------------------------------------------------------

export function GrammarView() {
  const [level, setLevel] = createSignal<Level>("all");
  const [q, setQ] = createSignal("");
  const scoped = createMemo(() => indexGrammar(app.songs(), scopeFilter()));
  const all = createMemo(() => indexGrammar(app.songs()));
  const points = createMemo(() => {
    const seen = new Set(GRAMMAR.map((g) => g.id));
    const custom = app.songs().flatMap((s) => (s.customGrammar ?? []).filter((g) => !seen.has(g.id) && seen.add(g.id)));
    return [...GRAMMAR, ...custom].filter(
      (g) => levelOk(g.level, level()) && (!q() || [g.id, g.title, g.zh, g.summary].some((s) => s.includes(q()))),
    );
  });
  const selected = createMemo<GrammarPoint | undefined>(() => {
    const id = app.grammarFocus();
    return (
      [...GRAMMAR, ...app.songs().flatMap((s) => s.customGrammar ?? [])].find((g) => g.id === id) ??
      points().find((g) => scoped().get(g.id)?.length) ??
      points()[0]
    );
  });
  const examples = () => (selected() ? (scoped().get(selected()!.id) ?? []) : []);

  return (
    <div class={view}>
      <ScopeBar title={t("grammar.title")}>
        <input class={searchField} placeholder={t("outline.search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <Segmented
          value={level()}
          options={[
            ["all", t("outline.levelAll")],
            ["N5", "N5"],
            ["N4", "N4"],
            ["N3+", t("outline.advanced")],
          ]}
          onChange={setLevel}
        />
      </ScopeBar>
      <div class={split}>
        <nav class={outline}>
          <For each={CATEGORIES}>
            {(c) => (
              <Show when={points().some((g) => g.category === c.id)}>
                <div class={cat}>{label.category(c.id, c.zh)}</div>
                <For each={points().filter((g) => g.category === c.id)}>
                  {(g) => {
                    const n = () => scoped().get(g.id)?.length ?? 0;
                    const sel = () => selected()?.id === g.id;
                    return (
                      <button class={pointRow(sel())} onClick={() => app.setGrammarFocus(g.id)}>
                        {/* points no lyric uses yet are dimmed */}
                        <span class={`${pointTitle} ${!sel() && !n() ? "text-fg-2" : ""}`}>{g.title}</span>
                        <span class={pointZh(sel())}>{g.zh}</span>
                        <Show when={n()}>
                          <span class={pointCount(sel())}>{n()}</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </Show>
            )}
          </For>
        </nav>
        <Show when={selected()}>
          {(g) => (
            <article class={detail}>
              <div class={detailHead}>
                <h3 class={detailTitle}>{g().title}</h3>
                <span class={levelBadge(g().level)}>{g().level}</span>
                <span class={detailZh}>{g().zh}</span>
              </div>
              <Show when={g().pattern}>
                <div class="mt-1 inline-block rounded-md bg-panel px-2.5 py-0.75 font-ja text-[14px]/[normal]">{g().pattern}</div>
              </Show>
              <p class={summary}>{g().summary}</p>
              <Show when={g().example}>
                {(ex) => (
                  <div class="mb-6.5 flex items-baseline gap-3.5 text-[14px]">
                    <span class="font-ja text-[17px]">{ex().ja}</span>
                    <span class="text-fg-2">{ex().zh}</span>
                  </div>
                )}
              </Show>
              <h4 class={sectionLabel}>{t("grammar.examples")}</h4>
              <Show when={examples().length} fallback={<EmptyScope all={all().get(g().id)?.length ?? 0} />}>
                <ul class={cards}>
                  <For each={examples()}>{(e) => <ExampleRow ex={e} range={[e.start, e.end]} note={e.auto ? undefined : e.note} />}</For>
                </ul>
              </Show>
            </article>
          )}
        </Show>
      </div>
    </div>
  );
}

// ---- vocabulary ---------------------------------------------------------------------

export function VocabView() {
  const [level, setLevel] = createSignal<Level>("all");
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal<string | null>(null);
  const words = createMemo(() =>
    indexVocab(app.songs(), scopeFilter())
      .filter(
        (w) =>
          levelOk(w.jlpt, level()) &&
          (!q() || [w.text, w.reading ?? "", ...w.glosses].some((s) => s.includes(q()))),
      )
      .sort((a, b) => (a.jlpt ?? "N9").localeCompare(b.jlpt ?? "N9") * -1 || b.examples.length - a.examples.length),
  );
  const groups = createMemo(() => {
    const order = ["N5", "N4", "N3", "N2", "N1", ""];
    return order
      .map((lv) => ({ lv, list: words().filter((w) => (w.jlpt ?? "") === lv) }))
      .filter((g) => g.list.length);
  });
  const selected = createMemo(() => words().find((w) => w.key === sel()) ?? words()[0]);

  return (
    <div class={view}>
      <ScopeBar title={t("vocab.title")}>
        <input class={searchField} placeholder={t("outline.search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <Segmented
          value={level()}
          options={[
            ["all", t("outline.levelAll")],
            ["N5", "N5"],
            ["N4", "N4"],
            ["N3+", t("outline.other")],
          ]}
          onChange={setLevel}
        />
      </ScopeBar>
      <Show
        when={words().length}
        fallback={
          <p class={empty}>
            {t(app.settings.scope === "favorites" ? "vocab.emptyFavorites" : "vocab.emptyAll")}
          </p>
        }
      >
        <div class={split}>
          <nav class={outline}>
            <For each={groups()}>
              {(g) => (
                <>
                  <div class={cat}>{g.lv || t("outline.unleveled")}</div>
                  <For each={g.list}>
                    {(w) => {
                      const sel = () => selected()?.key === w.key;
                      return (
                        <button class={pointRow(sel())} onClick={() => setSel(w.key)}>
                          <span class={pointTitle}>{w.text}</span>
                          <span class={pointZh(sel())}>{w.glosses[0]}</span>
                          <span class={pointCount(sel())}>{w.examples.length}</span>
                        </button>
                      );
                    }}
                  </For>
                </>
              )}
            </For>
          </nav>
          <Show when={selected()}>
            {(w) => (
              <article class={detail}>
                <div class={detailHead}>
                  <h3 class={detailTitle}>
                    <Ruby segs={rubyFor(w().text, w().reading)} />
                  </h3>
                  <Show when={w().jlpt}>
                    <span class={levelBadge(w().jlpt)}>{w().jlpt}</span>
                  </Show>
                  <span class={detailZh}>
                    {label.pos(w().pos, POS_ZH[w().pos])}
                    {w().cls ? ` · ${label.cls(w().cls!, CLASS_INFO[w().cls!])}` : ""}
                  </span>
                </div>
                <p class={summary}>{w().glosses.join("；")}</p>
                <h4 class={sectionLabel}>{t("vocab.usage")}</h4>
                <ul class={cards}>
                  <For each={w().examples}>
                    {(e) => (
                      <ExampleRow
                        ex={e}
                        range={[e.start, e.end]}
                        note={e.form !== w().text ? t("vocab.form", { form: e.form }) : undefined}
                      />
                    )}
                  </For>
                </ul>
              </article>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ---- favourites -----------------------------------------------------------------------

export function FavoritesView() {
  const rows = createMemo(() =>
    app.favorites.lines
      .map((f) => {
        const song = app.songs().find((s) => s.id === f.songId);
        const line = song?.lines.find((l) => l.id === f.lineId);
        return { f, song, line };
      })
      .reverse(),
  );
  return (
    <div class={view}>
      <header class={viewHead}>
        <h2 class={viewTitle}>{t("fav.title")}</h2>
        <div class={`${viewTools} text-fg-2`}>{t("fav.count", { n: app.favorites.lines.length })}</div>
      </header>
      <Show when={rows().length} fallback={<p class={empty}>{t("fav.empty")}</p>}>
        <ul class={`${cards} px-7 pt-5 pb-12`}>
          <For each={rows()}>
            {({ f, song, line }) => (
              <Show
                when={song && line}
                fallback={
                  <li class={`${card} cursor-default! opacity-60`}>
                    <div class={cardJa}>{f.ja}</div>
                    <div class={cardSrc}>{t("fav.missing")}</div>
                  </li>
                }
              >
                <li class={card} onClick={() => app.jumpTo(song!.id, line!.id)}>
                  <div class={cardJa}>
                    <JaLine ja={line!.ja} analysis={analysisOf(song!, line!)} />
                  </div>
                  <div class={cardZh}>{line!.zh}</div>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <For each={analysisOf(song!, line!).grammar.filter((g) => !g.auto && g.point)}>
                      {(g) => (
                        <button
                          class="rounded-full bg-accent-soft px-2 py-px font-ja text-[12px]/[1.7] text-accent"
                          onClick={(e) => (e.stopPropagation(), app.openGrammar(g.id))}
                        >
                          {g.point!.title}
                        </button>
                      )}
                    </For>
                  </div>
                  <div class={cardSrc}>
                    {song!.title} · {song!.artist}
                    <button
                      class="inline-grid size-6.5 place-items-center rounded-md text-star hover:bg-hover"
                      title={t("fav.remove")}
                      onClick={(e) => (e.stopPropagation(), app.toggleFav(song!, line!))}
                    >
                      <IconStar filled />
                    </button>
                  </div>
                </li>
              </Show>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
