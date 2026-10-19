# Kotone 歌词标注规范（给 agent）

你在为一首日语歌准备“学习用歌词”。读者母语是中文，日语大约 **N5–N4**：会五十音，汉字常常不知道怎么读，变形规则记不牢。他们想弄懂自己喜欢的歌词，而不是刷考试题。所以：

- **讲清楚“这句为什么这样说”**，而不是罗列术语。每条讲解都要能对应回中文译文里的某个部分。
- 讲解用简体中文，口吻像耐心的朋友。一条 note 尽量不超过 60 字。
- 超出 N4 的知识点照样标，但讲解要从 N5–N4 已知的东西出发。

## 工作流程

```sh
kotone init song.lrc --id my-song --title 曲名 --artist 歌手   # 生成骨架（LRC 带时间轴）
# 或：kotone lyrics 曲名 歌手 → kotone init netease:… --id my-song（下载原文，zh 留空）
kotone status my-song.song.json                               # 看哪些行待标注（也可以写资料库里的歌曲 id）
# …逐行编辑 JSON…
kotone check my-song.song.json                                # 直到 0 错误
kotone add my-song.song.json --audio ~/Music/xxx.m4a           # 导入播放器
```

`check` 会**重新推导**你写的东西：分词必须拼回原句、读音必须和假名对得上、变形必须能由 `lemma + steps` 算出来、`chunks` 的中文片段必须真的出现在译文里。它的报错就是修改指南——不要绕过它（比如把变形词标成名词来逃避推导）。

辅助命令：

- `kotone conj 奪う:うばう godan Passive Ta` —— 不确定变形时先算一遍。
- `kotone grammar から` —— 按关键词找语法点 id。
- `kotone ruby 初めて はじめて` —— 预览注音切分。

## 文件结构

```jsonc
{
  "version": 1,
  "id": "yoru-ni-kakeru",          // 小写字母/数字/连字符
  "title": "夜に駆ける",
  "titleReading": "よるにかける",
  "artist": "YOASOBI",
  "lines": [ /* Line[] */ ],
  "customGrammar": [ /* 可选：大纲里没有的语法点 */ ]
}
```

每一行（Line）：

```jsonc
{
  "id": "L03",                      // init 生成，不要改
  "time": 47.2,                     // 秒，可选（init/times 从 LRC 写入）
  "ja": "初めて会った日から",        // 原句，不要改
  "zh": "从初次相遇的那天起",         // 你的中文翻译
  "tokens": [ /* 分词，见下 */ ],
  "chunks": [ /* 句子成分 ↔ 中文片段 */ ],
  "grammar": [ /* 本句的语法点 */ ],
  "note": "这一行只是时间起点，谓语在下一行……"   // 整句讲解
}
```

### zh：翻译

- 自己翻译，自然、有诗意，但**尽量保留日语的语序和意象**，方便对照。
- 跨行的长句，每行译出本行对应的部分即可，整体关系写进 note。
- 翻译必须是你自己写的：不要从歌词平台、网页或其它现成译文搬运或改写，也不要去搜索现成译文。

### tokens：分词

`tokens[].text` 依次拼接（忽略空格）必须**严格等于** `ja`。

```jsonc
{ "text": "会った", "reading": "あった", "pos": "verb", "gloss": "相遇",
  "lemma": { "text": "会う", "reading": "あう", "class": "godan" }, "steps": ["Ta"], "jlpt": "N5" }
```

| 字段 | 说明 |
|---|---|
| `text` | 原文片段，不含空格 |
| `reading` | **平假名**读音。含汉字时必填；纯假名词不写 |
| `pos` | `noun` `pronoun` `proper-noun` `verb` `i-adj` `na-adj` `adverb` `adnominal` `particle` `aux` `copula` `conjunction` `interjection` `prefix` `suffix` `numeral` `counter` `expression` `symbol` |
| `gloss` | 这个词**在本句里**的中文意思（简短） |
| `lemma` | 辞书形 + 词类。`verb` / `i-adj` / `na-adj` 必填；其他可选 |
| `steps` | 从 lemma 推到 text 的变形链，按顺序（见附录 B） |
| `jlpt` | 有把握时标 N5–N1，用于词汇表分级 |
| `ruby` | 只有熟字训/当て字等对不齐时才用：`[["今日","きょう"]]` |
| `note` | 词级补充说明（可选） |

分词粒度（以“学习者能看懂结构”为准）：

1. **每个助词单独一个 token**（は が を に の で と も から まで だけ…）。
2. 变形后的词**整体一个 token**，用 `lemma + steps` 表达变形：会った、奪われた、してた、会いたくなかった。
3. 「〜ている／〜てる／〜てしまう／〜ちゃう」并进动词 token（steps `TeIru` / `Teru` / `TeShimau` / `Chau`）；其他「て＋补助动词」**拆开**：`溶けて` + `ゆく`，`教えて` + `くれた`，再用 grammar 标出句型。
4. `ように` / `ような` 作一个 token：`pos: "aux"`，lemma `{ "text": "よう", "class": "na-adj" }`，steps `Adverbial` / `Na`。
5. 名词＋する（勉強する）是一个 `suru` 词，不要拆成名词＋する。
6. のだ／んだ：拆成 `ん`(particle) + `だ`(copula)。
7. 熟语、固定说法（どこか、いつか）可以作一个词，用 note 和 grammar 说明构成。
8. **按词的真实活用类别标 class**：帰る、走る、知る、入る、切る 是五段（godan），不是一段。
9. いい 的 lemma 写 `{ "text": "いい", "class": "i-adj" }`，推导会自动用 よい 变形。

### chunks：句子成分 ↔ 中文

把一行切成几个**意义块**，告诉学习者“这一块在中文里对应哪里、在句子里充当什么”。播放器会用同一种颜色同时标出日文块和中文片段。

```jsonc
{ "ja": "会った", "zh": "相遇的", "role": "定语", "note": "た形直接放在名词前作定语。" }
{ "ja": "から", "zh": ["从", "起"], "role": "起点" }   // 中文被拆开时用数组
{ "ja": "んだ", "role": "语气", "note": "没有对应的中文词" }   // 可以没有 zh
```

- `ja` 必须是**连续的若干 token**；chunks 按顺序排列、互不重叠。
- `zh` 必须是译文的**原样子串**；同一片段出现多次时，按 chunk 顺序依次占用。
- `role` 用简短的成分名：主题 主语 宾语 谓语 定语 中心语 状语 补语 时间 地点 起点 对象 比喻 原因 条件 连接 语气……
- 粒度一般是“文节”（词＋后面的助词），覆盖整行，让每个重要部分都有颜色。

### grammar：本句的语法点

```jsonc
{ "id": "relative-clause", "ja": "初めて会った日", "note": "「初めて会った」整体修饰「日」……" }
```

- `id` 来自语法大纲（附录 C / `kotone grammar`）。大纲里没有的，在顶层 `customGrammar` 里补充：
  `{ "id": "x-...", "title": "…", "zh": "…", "level": "N3", "category": "pattern", "summary": "…" }`
- `ja` 是原句里体现这个语法点的片段，边界最好落在 token 边界上；同一片段出现多次时用 `"nth": 2`。
- `note` 写**这句话里**的具体用法，不要照抄大纲的通用解释。
- **变形类语法点会从 steps 自动生成**（た形、ない形、ている…），不必重复写；需要针对本句补充时再写。
- 重点标：句子结构（定语从句、主语省略、倒装、体言止め）、助词的具体用法、句型、口语/歌词特有表达。

### note：整句讲解

一到三句话：这一行的骨架是什么（可以用 `[定语] 名词 + 助词` 这样的括号写法）、和前后行怎么连、有什么言外之意或歧义。歌词常常故意留白、跨行、倒装——把这些“韵味”讲出来。

## 质量自检

- [ ] 每个含汉字的 token 都有 reading，check 无注音报错
- [ ] 每个动词/形容词都有正确的 lemma.class，变形用 steps 而不是硬写
- [ ] chunks 覆盖全行，role 和中文片段让人一眼看懂结构
- [ ] grammar 的 note 针对本句，引用了中文译文里的对应部分
- [ ] note 讲出了跨行关系、省略或者歧义
- [ ] `kotone check` 0 错误
