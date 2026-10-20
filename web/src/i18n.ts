// UI strings in Chinese and English. The learning content itself (translations, notes, grammar
// explanations, derivation rules) stays Chinese: it is written for Chinese-speaking learners.
// `en` must have exactly the keys of `zh`, so a missing translation fails the typecheck.

import type { Pos, WordClass, GrammarCategory, StepId } from "../../core/types.ts";
import type { SourceId } from "../../core/lyrics/index.ts";
import { app } from "./state.ts";

const zh = {
  // nav & shell
  "nav.library": "资料库",
  "nav.lyrics": "歌词",
  "nav.favorites": "收藏",
  "nav.grammar": "语法",
  "nav.vocab": "词汇",
  "nav.search": "添加歌曲",
  "side.songs": "歌曲",
  "library.count": "{n} 首歌",
  "library.finding": "正在找封面…",
  "library.addHint": "搜索歌词和封面",
  "side.unreadable": "无法读取",
  "side.import": "导入标注好的 song.json",
  "side.add": "搜索一首歌，连同歌词和封面加入资料库（⌘N）",
  "side.reveal": "在访达中打开资料库",
  "side.settings": "设置（⌘,）",
  "app.empty": "资料库是空的。点“添加歌曲”搜索一首歌，然后点“标注整首歌”。",

  // lyrics view
  "song.annotated": "{n}/{total} 行已标注",
  "song.excerpt": "摘录",
  "song.getFull": "下载完整歌词",
  "song.getTimed": "下载带时间轴的歌词",
  "toggle.furigana": "注音",
  "toggle.furiganaTip": "注音 (F)",
  "toggle.translation": "译文",
  "toggle.translationTip": "译文 (T)",
  "line.playFrom": "从这句开始播放",
  "line.pause": "暂停（空格）",
  "line.fav": "收藏这句",
  "line.unfav": "取消收藏",

  // line detail
  "detail.whole": "全句",
  "detail.keysTip": "← → 切换句子成分",
  "detail.lineGrammar": "整句语法",
  "detail.words": "词语",
  "detail.points": "知识点",
  "detail.inflectsLike": "按{cls}变化",
  "detail.outline": "大纲",
  "detail.outlineTip": "在语法大纲中查看",
  "detail.unannotated": "这一行还没有标注，点上方的“标注整首歌”让 Codex 补全。",
  "detail.agentFixing": "Codex 正在按校验结果修正这一行…",
  "detail.agentWorking": "Codex 正在标注这一行…",
  "detail.agentQueued": "已排队，Codex 稍后会标注这一行",
  "detail.redo": "重新标注",
  "detail.redoTip": "这句标得不对？让 Codex 对照上下文重新标注这一句。新标注通过校验后才会替换现在的。",
  "detail.redoBusy": "Codex 正在标注，等这次结束再试",
  "detail.redoing": "Codex 正在重新标注这句…",

  // codex in the header
  "agent.annotateSong": "标注整首歌",
  "agent.annotateTip": "用 Codex 标注还没有标注的 {n} 行",
  "agent.busyOther": "Codex 正在标注另一首歌",
  "agent.connecting": "正在连接 Codex…",
  "agent.progress": "正在标注 {n}/{total}",
  "agent.stop": "停止",
  "agent.needLogin": "需要先登录 ChatGPT 才能用 Codex 标注。",
  "agent.openSettings": "打开设置",
  "agent.settings": "设置",
  "agent.err.install": "没有找到 Codex。先在终端安装并登录一次：npm i -g @openai/codex，然后运行 codex。",
  "agent.err.exited": "Codex 退出了（{code}）{detail}",
  "agent.err.stale": "Kotone 已经更新，需要重启才能使用 Codex：按 ⌘Q 退出后重新打开",
  "agent.err.skipped": "{n} 行 Codex 两次都没能通过校验，已跳过：{ids}",
  "agent.err.browser": "浏览器预览需要 pnpm dev 才能使用 Codex",
  "agent.err.notFoundPath": "在 shell 的 PATH 里没有找到 codex",
  "agent.err.notExecutable": "这个路径不存在或不可执行",
  "quota.week": "本周",
  "quota.hours": "{h} 小时内",
  "quota.used": "{window}已用 {pct}%",

  // settings
  "settings.title": "设置",
  "settings.done": "完成",
  "settings.general": "通用",
  "settings.language": "语言 / Language",
  "settings.langAuto": "跟随系统",
  "settings.codex": "Codex 标注",
  "settings.codexIntro": "“标注整首歌”使用你本机的 Codex 和 ChatGPT 账号额度。",
  "settings.status": "状态",
  "settings.checking": "检测中…",
  "settings.unchecked": "未检测",
  "settings.notLoggedIn": "未登录",
  "settings.recheck": "重新检测",
  "settings.account": "账号",
  "settings.loginHint": "登录后才能用 Codex 标注",
  "settings.login": "登录 ChatGPT",
  "settings.quota": "额度",
  "settings.path": "Codex 路径",
  "settings.pathAuto": "自动：在 shell 的 PATH 里查找 codex",
  "settings.pathNow": "当前使用 {path}",
  "settings.pathInstall": "没装的话：npm i -g @openai/codex，然后在终端运行一次 codex 登录。",
  "settings.fast": "快速模式",
  "settings.fastHint": "Codex 的 Fast 服务档：约 1.6 倍速度，消耗更多额度。下一次标注时生效。",

  // outline views
  "scope.favorites": "收藏的句子",
  "scope.all": "全部歌词",
  "outline.search": "搜索",
  "outline.levelAll": "全部",
  "outline.advanced": "进阶",
  "outline.other": "其他",
  "outline.unleveled": "未分级",
  "grammar.title": "语法大纲",
  "grammar.examples": "歌词里的例句",
  "grammar.noneInLibrary": "资料库里还没有用到这个知识点的歌词。",
  "grammar.noneInFavorites": "收藏的句子里还没有出现。",
  "grammar.seeAll": "查看全部歌词里的 {n} 个例句",
  "vocab.title": "词汇",
  "vocab.usage": "歌词里的用法",
  "vocab.form": "这里的形式：{form}",
  "vocab.emptyFavorites": "收藏一些句子后，句子里的词会出现在这里。",
  "vocab.emptyAll": "资料库里还没有已标注的歌词。",
  "fav.title": "收藏",
  "fav.count": "{n} 句",
  "fav.empty": "在歌词里点 ☆ 收藏喜欢的句子。收藏的句子会按知识点和词汇整理进“语法”和“词汇”。",
  "fav.missing": "这首歌已不在资料库中",
  "fav.remove": "取消收藏",

  // player
  "player.toggle": "播放/暂停 (空格)",
  "player.link": "关联音频文件…",
  "player.err.play": "无法播放这个音频文件",
  "player.searching": "正在 Spotify 上查找…",
  "player.missing": "Spotify 上没有找到这首歌",
  "player.viaSpotify": "正在通过 Spotify 播放",
  "player.viaFile": "本地音频文件（点击更换）",
  "spotify.err.permission": "需要允许 Kotone 控制 Spotify：系统设置 › 隐私与安全性 › 自动化",
  "spotify.err.command": "Spotify 没有响应",
  "spotify.err.search": "Spotify 搜索没有响应",

  // adding a song
  "search.title": "添加歌曲",
  "search.placeholder": "歌名、歌手",
  "search.hint": "输入歌名或歌手，按回车搜索。",
  "search.searching": "搜索中…",
  "search.noResults": "没有结果",
  "search.intro1": "搜索 Spotify 曲库，每首歌自动从网易云音乐、QQ音乐、酷狗和 LRCLIB 配上日语原文歌词，优先带时间轴的版本。不会下载平台的译文：中文翻译只由 agent 标注时写出。",
  "search.intro2": "加入资料库时，歌词、封面和 Spotify 曲目一起保存。播放交给后台的 Spotify，不会切走窗口。",
  "search.introNoSpotify": "没有安装 Spotify，结果只来自歌词网站；加入后可以给歌曲关联本地音频文件。",
  "search.localOnly": "歌词和封面只保存在本机的资料库里。",
  "search.lyricsOnly": "只找到歌词",
  "search.spotifyFailed": "Spotify 搜索没有响应，下面只有歌词网站的结果。",
  "search.added": "已添加",
  "search.playsOnSpotify": "用 Spotify 播放",
  "search.notOnSpotify": "不在 Spotify 结果里",
  "search.finding": "正在配歌词…",
  "search.noLyrics": "歌词网站上没找到这首歌的歌词。换个写法再搜一次试试，比如日文歌名。",
  "search.versions": "歌词版本",
  "search.unsure": "这些歌词的歌名对得上，但歌手或时长对不上。确认是同一首歌再选。",
  "search.open": "打开",
  "search.inLibrary": "《{title}》已在资料库里",
  "search.lines": "{n} 行",
  "search.synced": "带时间轴",
  "search.unsynced": "没有时间轴",
  "search.downloading": "正在下载歌词…",
  "search.complete": "补全《{title}》",
  "search.completeDesc": "换成这份 {n} 行的歌词",
  "search.completeTimed": "和时间轴",
  "search.keep": "，保留 {n} 行已有标注",
  "search.lost": "，有 {n} 行标注在新歌词里找不到（旧文件会备份为 song.json.bak）",
  "search.new": "加入资料库",
  "search.newDesc": "歌词和封面一起保存，之后点“标注整首歌”",
  "search.newDescSpotify": "歌词、封面和 Spotify 曲目一起保存，之后点“标注整首歌”",
  "search.reusable": "（{n} 行可复用已有标注）",
  "search.annotated": "已标注",
  "search.unknownArtist": "未知",
  "search.err.notFound": "没有找到",
  "search.err.http": "请求失败（HTTP {status}）",
  "search.err.json": "返回的不是 JSON",
  "search.err.api": "错误码 {code}",
  "search.err.noLyrics": "{source}没有这首歌的歌词",
  "search.err.dev": "下载歌词需要 pnpm dev 或 App",
  "search.err.save": "浏览器预览不能写入资料库",
} as const;

export type Key = keyof typeof zh;

const en: Record<Key, string> = {
  "nav.library": "Library",
  "nav.lyrics": "Lyrics",
  "nav.favorites": "Saved",
  "nav.grammar": "Grammar",
  "nav.vocab": "Words",
  "nav.search": "Add Song",
  "side.songs": "Songs",
  "library.count": "{n} songs",
  "library.finding": "Finding the cover…",
  "library.addHint": "Lyrics and cover art",
  "side.unreadable": "Can't be read",
  "side.import": "Import an annotated song.json",
  "side.add": "Search for a song and add it with its lyrics and cover (⌘N)",
  "side.reveal": "Show library in Finder",
  "side.settings": "Settings (⌘,)",
  "app.empty": "Your library is empty. Click “Add Song” to search for one, then click “Annotate song”.",

  "song.annotated": "{n}/{total} lines annotated",
  "song.excerpt": "Excerpt",
  "song.getFull": "Get the full lyrics",
  "song.getTimed": "Get timed lyrics",
  "toggle.furigana": "Furigana",
  "toggle.furiganaTip": "Furigana (F)",
  "toggle.translation": "Translation",
  "toggle.translationTip": "Translation (T)",
  "line.playFrom": "Play from this line",
  "line.pause": "Pause (Space)",
  "line.fav": "Save this line",
  "line.unfav": "Remove from saved",

  "detail.whole": "Whole line",
  "detail.keysTip": "← → to switch phrases",
  "detail.lineGrammar": "Across the line",
  "detail.words": "Words",
  "detail.points": "Grammar points",
  "detail.inflectsLike": "Inflects like {cls}",
  "detail.outline": "Outline",
  "detail.outlineTip": "Open in the grammar outline",
  "detail.unannotated": "This line isn't annotated yet. Click “Annotate song” above to have Codex fill it in.",
  "detail.agentFixing": "Codex is fixing this line after the check…",
  "detail.agentWorking": "Codex is annotating this line…",
  "detail.agentQueued": "Queued — Codex will get to this line shortly",
  "detail.redo": "Redo",
  "detail.redoTip": "Something wrong in this line? Have Codex annotate it again in context. The new annotation replaces this one only once it passes the check.",
  "detail.redoBusy": "Codex is busy annotating; try again when it's done",
  "detail.redoing": "Codex is re-annotating this line…",

  "agent.annotateSong": "Annotate song",
  "agent.annotateTip": "Have Codex annotate the {n} lines that aren't annotated yet",
  "agent.busyOther": "Codex is annotating another song",
  "agent.connecting": "Connecting to Codex…",
  "agent.progress": "Annotating {n}/{total}",
  "agent.stop": "Stop",
  "agent.needLogin": "Sign in to ChatGPT to annotate with Codex.",
  "agent.openSettings": "Open Settings",
  "agent.settings": "Settings",
  "agent.err.install": "Codex wasn't found. Install it and sign in once from a terminal: npm i -g @openai/codex, then run codex.",
  "agent.err.exited": "Codex exited ({code}) {detail}",
  "agent.err.stale": "Kotone was updated and needs a restart to use Codex: quit with ⌘Q and open it again",
  "agent.err.skipped": "Codex couldn't get {n} lines past the check in two tries; skipped: {ids}",
  "agent.err.browser": "The browser preview needs pnpm dev to use Codex",
  "agent.err.notFoundPath": "codex wasn't found on the shell PATH",
  "agent.err.notExecutable": "This path doesn't exist or isn't executable",
  "quota.week": "this week",
  "quota.hours": "in {h} h",
  "quota.used": "{pct}% used {window}",

  "settings.title": "Settings",
  "settings.done": "Done",
  "settings.general": "General",
  "settings.language": "Language / 语言",
  "settings.langAuto": "System",
  "settings.codex": "Codex annotation",
  "settings.codexIntro": "“Annotate song” runs on your local Codex and your ChatGPT plan's quota.",
  "settings.status": "Status",
  "settings.checking": "Checking…",
  "settings.unchecked": "Not checked",
  "settings.notLoggedIn": "not signed in",
  "settings.recheck": "Check again",
  "settings.account": "Account",
  "settings.loginHint": "Sign in to annotate with Codex",
  "settings.login": "Sign in to ChatGPT",
  "settings.quota": "Quota",
  "settings.path": "Codex path",
  "settings.pathAuto": "Automatic: look for codex on the shell PATH",
  "settings.pathNow": "Using {path}",
  "settings.pathInstall": "Not installed? npm i -g @openai/codex, then run codex once in a terminal to sign in.",
  "settings.fast": "Fast mode",
  "settings.fastHint": "Codex's Fast service tier: about 1.6× faster, uses more quota. Applies to the next annotation run.",

  "scope.favorites": "Saved lines",
  "scope.all": "All lyrics",
  "outline.search": "Search",
  "outline.levelAll": "All",
  "outline.advanced": "Advanced",
  "outline.other": "Other",
  "outline.unleveled": "No level",
  "grammar.title": "Grammar outline",
  "grammar.examples": "In the lyrics",
  "grammar.noneInLibrary": "No lyrics in your library use this point yet.",
  "grammar.noneInFavorites": "None of your saved lines use it yet.",
  "grammar.seeAll": "See {n} examples in all lyrics",
  "vocab.title": "Words",
  "vocab.usage": "In the lyrics",
  "vocab.form": "Form here: {form}",
  "vocab.emptyFavorites": "Save some lines and their words will show up here.",
  "vocab.emptyAll": "No annotated lyrics in your library yet.",
  "fav.title": "Saved",
  "fav.count": "{n} lines",
  "fav.empty": "Click ☆ on a lyric line to save it. Saved lines are sorted into “Grammar” and “Words”.",
  "fav.missing": "This song is no longer in your library",
  "fav.remove": "Remove from saved",

  "player.toggle": "Play/Pause (Space)",
  "player.link": "Link audio file…",
  "player.err.play": "This audio file can't be played",
  "player.searching": "Looking it up on Spotify…",
  "player.missing": "This song isn't on Spotify",
  "player.viaSpotify": "Playing through Spotify",
  "player.viaFile": "Local audio file (click to change)",
  "spotify.err.permission": "Allow Kotone to control Spotify: System Settings › Privacy & Security › Automation",
  "spotify.err.command": "Spotify didn't respond",
  "spotify.err.search": "Spotify search didn't respond",

  "search.title": "Add Song",
  "search.placeholder": "Title, artist",
  "search.hint": "Type a title or artist, then press Return.",
  "search.searching": "Searching…",
  "search.noResults": "No results",
  "search.intro1": "Searches Spotify's catalogue and matches each song with its Japanese lyrics from NetEase Cloud Music, QQ Music, Kugou and LRCLIB, preferring timed versions. Platform translations are never downloaded: every Chinese translation is written by the agent while annotating.",
  "search.intro2": "Adding a song saves its lyrics, cover and Spotify track together. Spotify plays in the background and never takes the window away.",
  "search.introNoSpotify": "Spotify isn't installed, so results come from the lyric sites only; after adding a song you can link a local audio file to it.",
  "search.localOnly": "Lyrics and covers are stored only in your local library.",
  "search.lyricsOnly": "Lyrics only",
  "search.spotifyFailed": "Spotify search didn't respond; these results are from the lyric sites only.",
  "search.added": "Added",
  "search.playsOnSpotify": "Plays on Spotify",
  "search.notOnSpotify": "Not in Spotify's results",
  "search.finding": "Matching lyrics…",
  "search.noLyrics": "The lyric sites have no lyrics for this song. Try searching another way, such as the Japanese title.",
  "search.versions": "Lyric versions",
  "search.unsure": "These match the title but not the artist or length. Make sure it's the same song before choosing one.",
  "search.open": "Open",
  "search.inLibrary": "“{title}” is already in your library",
  "search.lines": "{n} lines",
  "search.synced": "Timed",
  "search.unsynced": "No timing",
  "search.downloading": "Downloading lyrics…",
  "search.complete": "Complete “{title}”",
  "search.completeDesc": "Switch to these {n} lines",
  "search.completeTimed": " with timing",
  "search.keep": ", keeping {n} annotated lines",
  "search.lost": "; {n} annotated lines have no match in the new lyrics (the old file is backed up as song.json.bak)",
  "search.new": "Add to Library",
  "search.newDesc": "Saves the lyrics and cover; then click “Annotate song”",
  "search.newDescSpotify": "Saves the lyrics, cover and Spotify track; then click “Annotate song”",
  "search.reusable": " ({n} lines can reuse existing annotations)",
  "search.annotated": "Annotated",
  "search.unknownArtist": "Unknown",
  "search.err.notFound": "Not found",
  "search.err.http": "Request failed (HTTP {status})",
  "search.err.json": "The response isn't JSON",
  "search.err.api": "Error code {code}",
  "search.err.noLyrics": "{source} has no lyrics for this song",
  "search.err.dev": "Downloading lyrics needs pnpm dev or the app",
  "search.err.save": "The browser preview can't write to the library",
};

export type Lang = "zh" | "en";

export const lang = (): Lang => {
  const pick = app.settings.lang;
  if (pick === "zh" || pick === "en") return pick;
  return /^zh\b/i.test(navigator.language) ? "zh" : "en";
};

/** Text that may be a message key (sent by the native side or the dev server) or plain text. */
export const tx = (text: string): string => (text in zh ? t(text as Key) : text);

export function t(key: Key, params: Record<string, string | number> = {}): string {
  const text: string = (lang() === "en" ? en : zh)[key];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
}

// ---- labels for core vocabularies --------------------------------------------------------

const POS_EN: Record<Pos, string> = {
  noun: "noun",
  pronoun: "pronoun",
  "proper-noun": "proper noun",
  verb: "verb",
  "i-adj": "i-adjective",
  "na-adj": "na-adjective",
  adverb: "adverb",
  adnominal: "adnominal",
  particle: "particle",
  aux: "auxiliary",
  copula: "copula",
  conjunction: "conjunction",
  interjection: "interjection",
  prefix: "prefix",
  suffix: "suffix",
  numeral: "numeral",
  counter: "counter",
  expression: "expression",
  symbol: "symbol",
};

const CLASS_EN: Record<WordClass, string> = {
  godan: "godan verb",
  ichidan: "ichidan verb",
  suru: "suru verb (する)",
  kuru: "kuru verb (来る)",
  "i-adj": "i-adjective",
  "na-adj": "na-adjective",
  copula: "copula だ",
};

const CATEGORY_EN: Record<GrammarCategory, string> = {
  particle: "Particles",
  verb: "Verb forms",
  adjective: "Adjectives & だ",
  structure: "Sentence structure",
  pattern: "Common patterns",
  colloquial: "Colloquial & lyrical",
};

const STEP_EN: Record<StepId, string> = {
  MasuStem: "masu stem",
  Masu: "polite form",
  Te: "linking",
  Ta: "past / completed",
  Nai: "negative",
  Naide: "without…, don't…",
  Zu: "negative (literary)",
  Potential: "can…",
  PotentialRanuki: "can… (colloquial, ら dropped)",
  Passive: "is …-ed",
  Causative: "make / let…",
  Volitional: "let's…, intend to…",
  Imperative: "command",
  Ba: "if…",
  Tara: "if…, after…",
  Tari: "listing actions",
  Tai: "want to…",
  Nagara: "while…",
  Sou: "looks…",
  TeIru: "is …-ing, state",
  Teru: "colloquial ている",
  TeShimau: "end up…, completely",
  Chau: "colloquial てしまう",
  Nakya: "have to… (colloquial)",
  Adverbial: "adverbial (く／に)",
  Na: "modifies a noun",
  Sa: "nominalizes",
};

const SOURCE_EN: Record<SourceId, [string, string]> = {
  netease: ["NetEase Cloud Music", "NetEase"],
  qq: ["QQ Music", "QQ Music"],
  kugou: ["Kugou", "Kugou"],
  lrclib: ["LRCLIB", "LRCLIB"],
};

/** zh labels come from core; en ones from the tables above. */
export const label = {
  pos: (p: Pos, zhLabel: string) => (lang() === "en" ? POS_EN[p] : zhLabel),
  cls: (c: WordClass, zhLabel: string) => (lang() === "en" ? CLASS_EN[c] : zhLabel),
  category: (c: GrammarCategory, zhLabel: string) => (lang() === "en" ? CATEGORY_EN[c] : zhLabel),
  step: (s: StepId, zhLabel: string) => (lang() === "en" ? STEP_EN[s] : zhLabel),
  source: (s: SourceId, zhLabel: string, short = false) => (lang() === "en" ? SOURCE_EN[s][short ? 1 : 0] : zhLabel),
};

// ---- errors ------------------------------------------------------------------------------

export function agentErrorText(e: import("./agent.ts").AgentError): string {
  return "raw" in e ? e.raw : t(e.key, e.params);
}

/** Lyric-source failures carry a code (core/lyrics LyricsError); anything else is shown as-is. */
export function lyricsErrorText(e: unknown): string {
  const err = e as { code?: string; params?: Record<string, string | number>; message?: string };
  switch (err?.code) {
    case "notFound":
      return t("search.err.notFound");
    case "http":
      return t("search.err.http", err.params);
    case "json":
      return t("search.err.json");
    case "api":
      return t("search.err.api", err.params);
    case "noLyrics":
      return t("search.err.noLyrics", { source: label.source(err.params!.source as SourceId, String(err.params!.source)) });
  }
  return tx(err?.message ?? String(e));
}
