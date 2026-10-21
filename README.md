# Kotone 言音

一个极简的 macOS 日语歌词播放器：为了**读懂自己喜欢的歌**而学日语，面向 N5–N4 水平的中文母语学习者。

- 歌词默认带**假名注音**，和**中文翻译并排**显示，播放时当前句随时间轴高亮
- 点开任意一句，按需查看拆解：**句子成分 ↔ 中文片段**同色对应、每个词从辞书形一步步**怎么变形**来的（规则可展开）、本句用到的**语法点**和针对本句的讲解
- 句子可以**收藏**；“语法大纲”从知识点反查收藏（或全部）歌词里的例句，“词汇”按 JLPT 级别把词和用例组织起来
- **添加歌曲**（侧栏、资料库或 ⌘N）：搜索 Spotify 曲库，每首结果自动配上歌词（参考 [LDDC](https://github.com/chenmozhijin/LDDC)，从网易云音乐、QQ音乐、酷狗、LRCLIB 下载，优先带时间轴的日语原文，**不取平台译文**，中文翻译只由 agent 写），歌词、封面和 Spotify 曲目一起加入资料库，之后由 Spotify 在后台播放；也可以给已有的歌补全歌词和时间轴，已经标注过的句子原样保留
- **在 App 里直接让 Codex 标注**：点歌名右侧的“标注整首歌”，走你自己的 ChatGPT 账号额度；每一句通过校验就立刻出现在歌词里，不用离开播放器
- 校验是确定性的：App 和 `kotone` CLI 共用同一个检查器，会重新推导 agent 写下的每个读音、变形和中文对应，不一致就把报错交还给 agent 修正
- **整个 App 只有 1 MB**（zip 后约 550 KB）：原生 macOS App，不打包浏览器内核；Swift 程序 377 KB、界面 276 KB，剩下 370 KB 是图标

![拆解面板](docs/screenshots/breakdown.png)

| 语法大纲：从知识点找到收藏的歌词 | 深色模式 |
|---|---|
| ![语法大纲](docs/screenshots/grammar-outline.png) | ![深色](docs/screenshots/breakdown-dark.png) |

UI 是 Solid，外壳是一层薄薄的 Swift：系统自带的 WKWebView + 你本机的 Spotify（播放，备选 AVPlayer 放本地文件）+ URLSession（下载歌词）+ 你本机的 Codex（标注），不打包浏览器内核，所以整个 App 只有 1 MB。

界面支持中文和 English（设置 → 语言，默认跟随系统；菜单栏也会跟着切换）。歌词的翻译、讲解和语法大纲是写给中文母语学习者的，切换界面语言时保持中文。

## 快速开始

需要 Node ≥ 22.18（直接运行 TS）、pnpm、Xcode Command Line Tools（`swiftc`）。

```sh
pnpm install
pnpm app          # 构建 web + Swift 外壳 → build/Kotone.app 并打开
pnpm dev          # 只在浏览器里调 UI（http://localhost:5173），读同一个资料库
pnpm test         # 变形引擎 / 注音 / 校验器 / CLI 的测试
```

自带的示例是 YOASOBI《夜に駆ける》中的 **6 行摘录**（歌词有版权，仓库里不放全文）。点歌名下的“下载完整歌词”，选一个结果再点“补全《夜に駆ける》”，就会换成带时间轴的完整原文，已标注的几句照旧可以展开拆解；再点“标注整首歌”，边听边看其余句子陆续补上（见下一节）。装了 Spotify 桌面版的话，直接点左下角的封面就能播放（见“用 Spotify 播放”）；没有的话点“关联音频文件…”选你自己的音频。

## 用 Spotify 播放

参考 LyricsX、SpotMenu 等开源客户端的做法，Kotone 把本机的 Spotify 桌面版当作播放器，所有操作都在 Kotone 里完成，Spotify 不会跳到前台：

- **找歌**：Kotone 在一个不显示的 WebView 里打开 Spotify 自己的网页搜索，从页面的 API 返回里读出曲目（不需要开发者账号）；曲名和歌手都对得上才用，原版优先于 THE FIRST TAKE、翻奏等。找到的曲目记在资料库的 `state.json` 里，下次直接播放。打开一首歌时就会提前查好。
- **播放与进度**：AppleScript 控制播放/暂停/跳转（点某句前面的 ▶ 从那句开始）；Spotify 的播放状态通知 + 每 1.5 秒读一次进度，歌词跟着高亮并滚到中间。Spotify 没开时会在后台隐藏启动。
- **跟随**：在 Spotify（或手机遥控）里切到资料库里有的歌，Kotone 自动切过去。
- 第一次播放时 macOS 会问是否允许 Kotone 控制 Spotify（系统设置 › 隐私与安全性 › 自动化）。Spotify 上没有的歌，可以照旧关联本地音频文件。

快捷键：`空格` 播放/暂停 · `↑/↓`（`j/k`）逐句打开拆解 · `Esc` 收起 · `F` 注音 · `T` 译文。

## 在 App 里用 Codex 标注

App 会在后台启动你本机的 `codex app-server`（[Codex CLI](https://github.com/openai/codex) 的 JSON-RPC 接口），所以用的是你自己的 ChatGPT 登录、套餐额度和模型设置；Codex 相关的细节都在设置（⌘, 或侧边栏左下角的齿轮）里：可用性检测（版本、账号、本周额度）、ChatGPT 登录、Codex 路径（默认在 shell 的 PATH 里自动查找）、快速模式。没装 Codex 的话先 `npm i -g @openai/codex`。

Codex 拿到的是标注规范和整首歌的原文，以及 App 注册给它的三个工具，别的都没有：只读沙箱、不批准任何命令、关闭网页搜索；Codex 自带的编程系统提示被换成一句话的标注员设定，你全局配置里的 hooks、插件、记忆、shell 等在这个会话里都关掉（它们对标注没用，却会拖慢每一步）：

| 工具 | 作用 |
|---|---|
| `submit_lines` | 一次提交多句的完整标注。App 当场用和 `kotone check` 相同的规则逐句校验：通过的立即保存并显示；没通过的把错误列表还给 Codex，它修正后再一次性重交 |
| `conj` | 推导变形（同 `kotone conj`） |
| `grammar_search` | 查语法点 id（同 `kotone grammar`） |

每个会话一次提交一整批（`submit_lines`），多个会话并行：最多 8 个，每个约 ⌈行数/8⌉ 句，49 句就是 8 个会话各写 7 句。推理强度固定 `medium`（不跟随全局配置：实测 `xhigh` 慢 2 倍多、在校验器下质量没有差别），“快速模式”（Codex 的 Fast 服务档，约 1.6 倍速）默认打开，可以在设置里关掉。实测在 App 里 8 句约 35 秒、24 句约 40 秒。一句两轮都没通过就跳过并列出来，随时可以点“停止”。翻译只能由 Codex 自己写（见“歌词下载”）。

协议客户端在 `core/codex.ts`，标注循环在 `core/annotator.ts`（都能脱离 UI 测试）；`macos/Sources/Agent.swift` 只负责启动进程、转发每一行 JSON。

## 用外部 agent 标注（CLI）

不开 App、或者想用别的 agent 时，同样的流程也可以走 CLI：

```sh
alias kotone="node $PWD/cli/kotone.ts"

kotone lyrics 夜に駆ける YOASOBI             # 在四个平台搜索，列出歌词引用
kotone init netease:1409311773 --id yoru-ni-kakeru \
  --reuse songs/yoru-ni-kakeru/song.json     # 下载原文并生成骨架（zh 留空）；--reuse 复用已标注过的同一句
kotone prompt yoru-ni-kakeru.song.json      # 生成交给 agent 的任务说明
# …agent 按 `kotone spec` 的规范逐行补全，并反复运行 check 直到 0 错误…
kotone add yoru-ni-kakeru.song.json --audio ~/Music/夜に駆ける.m4a
```

`init` 也接受自己的 LRC / 纯文本文件；LDDC 导出的双语 LRC 里与原文同一时间戳的译文行、罗马音行会被丢弃。切回 App 窗口就会出现在资料库里。在 App 里“添加歌曲”加入的歌已经在资料库中，直接 `kotone prompt <歌曲 id>` 即可（`status` / `check` / `times` 同样接受资料库 id）。

仓库里带了一个 Claude Code skill（[`.claude/skills/annotate-lyrics`](.claude/skills/annotate-lyrics/SKILL.md)），在这个目录里对 Claude 说“帮我把《夜に駆ける》标注完”即可。

| 命令 | 作用 |
|---|---|
| `spec` | 打印给 agent 的完整标注规范（[docs/annotation-guide.md](docs/annotation-guide.md) + 变形 steps 表 + 语法点 id） |
| `lyrics <关键词>` / `lyrics <引用> [-o x.lrc]` | 搜索歌词 / 下载原文 LRC（见下文“歌词下载”） |
| `init` / `status` / `prompt` | 生成骨架（文件或歌词引用）、查看进度、生成任务说明 |
| `check [--json] [--strict]` | 校验（见下） |
| `conj 奪う:うばう godan Passive Ta` | 推导变形并解释每一步，给 agent 自查用 |
| `grammar [关键词\|id]` / `ruby 初めて はじめて` | 查语法大纲 / 预览注音切分 |
| `times <song.json> <lrc> --write` | 按歌词文本把 LRC 时间轴合并进已有标注 |
| `add` / `library` | 导入 / 列出 App 资料库（`~/Library/Application Support/Kotone`，可用 `KOTONE_HOME` 覆盖） |

`check` 会验证：tokens 逐字拼回原句；读音只能是假名，并且和词里的送り仮名对得上（顺带算出注音该怎么切）；每个动词/形容词的 `lemma + class + steps` 能**推导出**它在歌词里的样子和读音；chunk 的中文片段真的出现在译文里；语法点 id 存在（拼错会给出最接近的候选）。例如：

```
✗ L03 tokens[4]「呼んだ」 读音「よんた」和「呼んだ」里的假名对不上
✗ L03 tokens[4]「呼んだ」 呼ぶ(ichidan) +Ta：一段动词的辞书形以「る」结尾
✗ L03 grammar[1] verb-ta-form 未知的语法点 id，是不是：verb-ta / verb-tara / verb-tari
```

## 歌词下载

参考 [LDDC](https://github.com/chenmozhijin/LDDC) 支持的同一组来源，在 `core/lyrics/` 里用 TS 重新实现（没有拷贝 LDDC 的 GPL 代码），CLI 和 App 共用：

| 来源 | 搜索 | 歌词 |
|---|---|---|
| 网易云音乐 | 公开 web 接口（不需要 eapi 加密） | 只请求原文 LRC（`lv`，不带 `tv`） |
| QQ音乐 | musicu.fcg（匿名 session）；偶尔被限流时退回搜索框联想 | `trans: 0`；关掉 QRC 直接拿明文 LRC，不需要 3DES 解密 |
| 酷狗 | 按文件 hash 找歌词候选 | KRC（XOR + zlib），忽略其中的 `[language:]` 译文/罗马音标签 |
| LRCLIB | 开放 API | LRC |

**翻译体系只接受 agent 生成的内容**：下载链路不请求、不解析、不保存任何平台译文，下载的数据结构里也没有译文字段；`init` / 补全生成的骨架 `zh` 一律为空，只有复用的已标注行带着当初 agent 写的 `zh`。双语 LRC 里的译文行会被丢弃。只保留逐行时间轴和原文；“作词：…”这类署名行和开头的“曲名 - 歌手”会被摘出来放进 `source`。逐字（卡拉OK）时间轴目前不用。

**封面**跟歌词一起自动下载（`core/lyrics/cover.ts`），存成资料库里的 `songs/<id>/cover.jpg`：歌词来自网易云时直接用那首歌的专辑图，否则查 iTunes Store（官方封面，800px），再退回网易云搜索；搜索结果必须曲名匹配才采用，找不到就留占位图，不会拿错歌的封面。之前下载的歌在启动时补一次。封面用在资料库的封面墙、侧栏缩略图，以及歌词页模糊后的背景。

这些接口需要浏览器页面发不了的请求头，所以 App 里的请求经由 Swift 的 URLSession 发出（只放行这几个域名和封面图床，并跟随系统代理）；`pnpm dev` 时由开发服务器代理。CLI 会读取 `https_proxy` 等环境变量走代理。这些都是非官方接口，随时可能变化：某个来源失败时，界面里会在该来源下显示原因，其它来源不受影响。

## 数据格式

一首歌是一个 JSON（类型定义见 [core/types.ts](core/types.ts)，完整说明见 [标注规范](docs/annotation-guide.md)）。一行大致是：

```jsonc
{
  "id": "L03", "time": 47.2,
  "ja": "初めて会った日から",
  "zh": "从初次相遇的那天起",
  "tokens": [
    { "text": "初めて", "reading": "はじめて", "pos": "adverb", "gloss": "初次" },
    { "text": "会った", "reading": "あった", "pos": "verb", "gloss": "相遇",
      "lemma": { "text": "会う", "reading": "あう", "class": "godan" }, "steps": ["Ta"] },
    { "text": "日", "reading": "ひ", "pos": "noun", "gloss": "那天" },
    { "text": "から", "pos": "particle", "gloss": "从……起" }
  ],
  "chunks": [   // 句子成分 ↔ 中文片段（UI 里同色）
    { "ja": "会った", "zh": "相遇的", "role": "定语", "note": "た形直接修饰名词…" },
    { "ja": "から", "zh": ["从", "起"], "role": "起点" }
  ],
  "grammar": [  // 引用语法大纲；变形类知识点由 steps 自动生成
    { "id": "relative-clause", "ja": "初めて会った日", "note": "「初めて会った」整体修饰「日」…" }
  ],
  "note": "这一行只是时间起点，谓语在下一行「奪った」。"
}
```

注音不需要单独标：由 `text` + `reading` 自动对齐（`初めて/はじめて → 初(はじ)めて`），熟字训等对不齐时才用 `ruby` 手写。

## 结构

```
core/      共享的 TS：变形引擎、注音对齐、语法大纲、单行解析/校验、跨歌索引、歌词下载（CLI 和 UI 共用同一份）
cli/       kotone CLI（Node 直接运行 .ts，无构建步骤）
web/       Solid UI，样式全部是 Tailwind v4 工具类：设计 token（颜色、字体、动画）在 styles.css 的 @theme 里，
           深浅色跟随系统；多处共用的写法是 ui.ts 里的类名字符串（方便以后的原生版本直接复用）；
           bridge.ts 在 WKWebView 里走原生桥，在浏览器里退化为 <audio> + localStorage + 开发服务器
macos/     Swift 外壳（build.sh 用 swiftc 直接出 .app，不需要 Xcode 工程）：窗口与 vibrancy、kotone:// 资源协议、JS 桥、Spotify 控制与后台搜索、AVPlayer/Now Playing、资料库读写、歌词请求、codex app-server 进程
songs/     随 App 打包的示例标注
docs/      标注规范（也是 `kotone spec` 的正文）
```

CLI 与 App 共享 `core/analyze.ts`：`check` 通过的标注，在 App 里就会以完全相同的方式渲染。

## 关于 typed-japanese 的 DSL 思路

结论：**有帮助，但它最有价值的是“验证语义”，而不是“书写语法”。**

typed-japanese 的 annotate 流水线（tsc 类型检查 + 逐字还原原句 + 结构审计 + 带诊断重试）在 hard eval 上把可靠性推到 100%，本质证明的是：*让 agent 只声明推导、由确定性的检查器重算结果、对不上就反馈重试*，这个闭环能把 LLM 的“看起来对”变成“算出来对”。Kotone 的 IR 直接继承了这一点：

- `lemma + class + steps` 就是 `ConjugateVerb<V, Form>` 的值层版本：checker 重新推导表层形和读音，和歌词对不上就报错。词类标错（比如把五段的 呼ぶ 标成一段）在绝大多数变形上都会因此暴露。
- “tokens 必须逐字拼回原句”对应“最后一个 alias 必须 resolve 成原句”。
- 语法点 id 是封闭集合，相当于类型名。

没有直接用 TS 类型当存储/书写格式，是因为这个场景里：

1. **播放器需要的大多不是语法正确性**：读音（注音）、语境义、成分↔译文的对应、时间轴、讲解。TJ 的值只有表层字符串，读音不在类型里，最后仍然需要一个 JSON 旁注。
2. **消费成本**：要从 TS 里拿到结构，得像 TypedTranslate 那样在运行时调 TS Compiler API；放进播放器意味着打包 tsc。
3. **逃逸口**：`SuffixPart`/字面量让模型能“绕过”推导，所以 annotate.ts 积累了二十多条 hard rules 和一个结构审计。封闭枚举 + 运行时检查器能把其中很多条变成代码里的硬约束（“动词必须有 lemma”“steps 必须推导一致”），而不是 prompt 里的软约束。
4. **组合性与读音**：eval 里提到 Passive+Ta 无法链式表达（ConjugateVerbChain 提案）；这里 `steps` 天然是数组，并且同时推导汉字形和假名读音（来る→来た/きた），注音因此也是被验证过的。
5. **报错可读性**：深层条件类型的报错对 agent 修复不够直接；运行时检查器可以直接说“`奪う(godan) +Te` 推导出「奪って」，但 token 写的是「奪った」”。

两者其实是同构、可以互补的：class 名沿用了 TJ 的 `godan` / `ichidan`，step 名也尽量对齐 TJ 的 ConjugationForm（`Te` `Ta` `Masu` `Potential` `Passive`…）。有一处语义不同：TJ 的 `Nai`/`Potential` 产出的是词干（話さ、行け），这里每一步都产出完整的词（話さない、行ける），因为它要直接展示给学习者，并且能继续往下链（話さない → 話さなかった）。一个自然的下一步是 `kotone export --typed-japanese`：把每行转成 `Sentence<[...]>` 交给 tsc 做第二重校验；反过来，TJ 的 eval 语料也可以转成这里的 IR 来回归测试这个变形引擎。

## 版权

仓库只包含《夜に駆ける》（作词作曲 Ayase）中用于讲解的几行歌词。下载的歌词和封面版权归原作者所有，只保存在本机资料库中，供个人学习使用；请不要把资料库里的歌词提交进仓库或公开分发。本地音频请使用你自己合法获得的文件。
