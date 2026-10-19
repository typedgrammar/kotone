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
import { IconStar } from "./icons.tsx";
import { Excerpt, JaLine, Ruby } from "./Text.tsx";

export function Segmented<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="segmented">
      <For each={props.options}>
        {([v, label]) => (
          <button classList={{ on: props.value === v }} onClick={() => props.onChange(v)}>
            {label}
          </button>
        )}
      </For>
    </div>
  );
}

const scopeFilter = (): LineFilter => (app.settings.scope === "favorites" ? (s, l) => app.isFav(s.id, l.id) : () => true);

function ScopeBar(props: { title: string; children?: JSX.Element }) {
  return (
    <header class="view-head">
      <h2>{props.title}</h2>
      <div class="view-tools">
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
    <li class="example" onClick={() => app.jumpTo(props.ex.song.id, props.ex.line.id)}>
      <div class="ex-ja">
        <Excerpt ja={props.ex.line.ja} analysis={a()} range={props.range} />
        <Show when={app.isFav(props.ex.song.id, props.ex.line.id)}>
          <span class="ex-star">
            <IconStar filled />
          </span>
        </Show>
      </div>
      <div class="ex-zh">{props.ex.line.zh}</div>
      <Show when={props.note}>
        <div class="ex-note">{props.note}</div>
      </Show>
      <div class="ex-src">
        {props.ex.song.title} · {props.ex.song.artist}
      </div>
    </li>
  );
}

function EmptyScope(props: { all: number }) {
  return (
    <p class="muted empty">
      <Show when={app.settings.scope === "favorites"} fallback={t("grammar.noneInLibrary")}>
        {t("grammar.noneInFavorites")}
        <Show when={props.all}>
          <button class="link" onClick={() => app.setSettings({ scope: "all" })}>
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
    <div class="outline-view">
      <ScopeBar title={t("grammar.title")}>
        <input class="search" placeholder={t("outline.search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
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
      <div class="split">
        <nav class="outline">
          <For each={CATEGORIES}>
            {(cat) => (
              <Show when={points().some((g) => g.category === cat.id)}>
                <div class="cat">{label.category(cat.id, cat.zh)}</div>
                <For each={points().filter((g) => g.category === cat.id)}>
                  {(g) => {
                    const n = () => scoped().get(g.id)?.length ?? 0;
                    return (
                      <button class="point" classList={{ sel: selected()?.id === g.id, dim: !n() }} onClick={() => app.setGrammarFocus(g.id)}>
                        <span class="p-title">{g.title}</span>
                        <span class="p-zh">{g.zh}</span>
                        <Show when={n()}>
                          <span class="count">{n()}</span>
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
            <article class="point-detail">
              <div class="pd-head">
                <h3>{g().title}</h3>
                <span class={`lv ${g().level}`}>{g().level}</span>
                <span class="pd-zh">{g().zh}</span>
              </div>
              <Show when={g().pattern}>
                <div class="pattern">{g().pattern}</div>
              </Show>
              <p class="summary">{g().summary}</p>
              <Show when={g().example}>
                {(ex) => (
                  <div class="generic-ex">
                    <span class="ja-font">{ex().ja}</span>
                    <span class="muted">{ex().zh}</span>
                  </div>
                )}
              </Show>
              <h4>{t("grammar.examples")}</h4>
              <Show when={examples().length} fallback={<EmptyScope all={all().get(g().id)?.length ?? 0} />}>
                <ul class="examples">
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
    <div class="outline-view">
      <ScopeBar title={t("vocab.title")}>
        <input class="search" placeholder={t("outline.search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
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
          <p class="muted empty pad">
            {t(app.settings.scope === "favorites" ? "vocab.emptyFavorites" : "vocab.emptyAll")}
          </p>
        }
      >
        <div class="split">
          <nav class="outline">
            <For each={groups()}>
              {(g) => (
                <>
                  <div class="cat">{g.lv || t("outline.unleveled")}</div>
                  <For each={g.list}>
                    {(w) => (
                      <button class="point word-item" classList={{ sel: selected()?.key === w.key }} onClick={() => setSel(w.key)}>
                        <span class="p-title ja-font">{w.text}</span>
                        <span class="p-zh">{w.glosses[0]}</span>
                        <span class="count">{w.examples.length}</span>
                      </button>
                    )}
                  </For>
                </>
              )}
            </For>
          </nav>
          <Show when={selected()}>
            {(w) => (
              <article class="point-detail">
                <div class="pd-head">
                  <h3 class="ja-font">
                    <Ruby segs={rubyFor(w().text, w().reading)} />
                  </h3>
                  <Show when={w().jlpt}>
                    <span class={`lv ${w().jlpt}`}>{w().jlpt}</span>
                  </Show>
                  <span class="pd-zh">
                    {label.pos(w().pos, POS_ZH[w().pos])}
                    {w().cls ? ` · ${label.cls(w().cls!, CLASS_INFO[w().cls!])}` : ""}
                  </span>
                </div>
                <p class="summary">{w().glosses.join("；")}</p>
                <h4>{t("vocab.usage")}</h4>
                <ul class="examples">
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
    <div class="outline-view">
      <header class="view-head">
        <h2>{t("fav.title")}</h2>
        <div class="view-tools muted">{t("fav.count", { n: app.favorites.lines.length })}</div>
      </header>
      <Show when={rows().length} fallback={<p class="muted empty pad">{t("fav.empty")}</p>}>
        <ul class="fav-list">
          <For each={rows()}>
            {({ f, song, line }) => (
              <Show
                when={song && line}
                fallback={
                  <li class="fav missing">
                    <div class="ex-ja ja-font">{f.ja}</div>
                    <div class="ex-src">{t("fav.missing")}</div>
                  </li>
                }
              >
                <li class="fav" onClick={() => app.jumpTo(song!.id, line!.id)}>
                  <div class="ex-ja">
                    <JaLine ja={line!.ja} analysis={analysisOf(song!, line!)} />
                  </div>
                  <div class="ex-zh">{line!.zh}</div>
                  <div class="chips">
                    <For each={analysisOf(song!, line!).grammar.filter((g) => !g.auto && g.point)}>
                      {(g) => (
                        <button class="chip" onClick={(e) => (e.stopPropagation(), app.openGrammar(g.id))}>
                          {g.point!.title}
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="ex-src">
                    {song!.title} · {song!.artist}
                    <button class="icon star on" title={t("fav.remove")} onClick={(e) => (e.stopPropagation(), app.toggleFav(song!, line!))}>
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
