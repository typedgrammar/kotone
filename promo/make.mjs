// Cuts the promo from the recorded acts (promo/record.sh annotate, add, chorus, detail), in two
// scores:
//   node promo/make.mjs [yoasobi|bgm]...     (default: both)
//
// yoasobi: title over 夜に駆ける's pre-chorus → its chorus (lyrics, furigana, a line's breakdown)
//   → adding 優しい彗星 → Codex annotating it, as the chorus runs on → one line of 優しい彗星 taken
//   apart, to its own music → end card.
// bgm: Kotone's own music (promo/bgm.swift) under the title, adding the song and Codex; it drops
//   into 夜に駆ける's chorus on the downbeat, crossfades to 優しい彗星 for the breakdown, and comes
//   back for the end card.
//
// Every cut falls on a beat of what's playing (130 BPM for 夜に駆ける and the BGM, 90 for
// 優しい彗星; see promo/beats.mjs), and the tours click on beats too. The window sits on a
// backdrop with bilingual captions below it. Writes promo/out/kotone-promo-<score>.mp4
// (1920×1080, 60 fps).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = "promo/out";
const CARDS = `${OUT}/cards`;
const W = 1920;
const H = 1080;
// the window on the backdrop, with the caption band below it
const WIN = { x: 208, y: 28, w: 1504, h: 940 };

// the beat grids the tours were timed on (promo/tour/chorus.js, detail.js)
const YORU = { bpm: 130, at: 75.113 }; // 夜に駆ける: the chorus's first downbeat
const SUISEI = { bpm: 90, at: 186.897 }; // 優しい彗星: the bar L37's breakdown opens on
const beatsOf = (grid) => (n) => grid.at + (n * 60) / grid.bpm;
const yoru = beatsOf(YORU);
const suisei = beatsOf(SUISEI);
const BAR = (4 * 60) / 130; // a bar of 夜に駆ける, and of the BGM
const XF = 0.25; // the title's crossfade into the window

// ---- the recordings ------------------------------------------------------------------------------

/** Marks (unix seconds by label), seconds into the song for marks taken while music played, and when each file starts */
function readAct(act) {
  const text = fs.readFileSync(`${OUT}/${act}/marks.log`, "utf8") + fs.readFileSync(`${OUT}/${act}/record.log`, "utf8");
  const marks = {};
  const sync = [];
  let video;
  let audio;
  for (const line of text.split("\n")) {
    const [kind, value, label, songAt] = line.split(" ");
    if (kind === "MARK") marks[label] = Number(value);
    if (kind === "MARK" && songAt) sync.push([Number(value), Number(songAt)]);
    else if (kind === "VIDEO") video = Number(value);
    else if (kind === "AUDIO") audio = Number(value);
  }
  if (!marks.end) throw new Error(`${act}: no "end" mark — record it again`);
  const at = (label, d = 0) => {
    if (!marks[label]) throw new Error(`${act}: no "${label}" mark`);
    return marks[label] + d;
  };
  /** A moment of the song, from the mark nearest it (Spotify may stall to buffer between marks) */
  const song = (t) => {
    if (!sync.length) throw new Error(`${act}: no marks with song times`);
    const [epoch, s] = sync.reduce((a, b) => (Math.abs(b[1] - t) < Math.abs(a[1] - t) ? b : a));
    return epoch + (t - s);
  };
  return { act, marks, video, audio, at, song };
}

const { chorus, add, annotate, detail } = Object.fromEntries(["chorus", "add", "annotate", "detail"].map((a) => [a, readAct(a)]));

/**
 * The window's clips: parts of a recording (unix seconds), squeezed or stretched to a length so
 * the next cut lands on a beat. Captions are [card, from, to] inside the clip, in seconds.
 */
function clip(name, rec, parts, length) {
  const real = parts.reduce((s, [a, b]) => s + (b - a), 0);
  const speed = real / length;
  let t = 0;
  const pieces = parts.map(([from, to]) => {
    const p = { from, to, at: t, length: (to - from) / speed };
    t += p.length;
    return p;
  });
  /** A moment of the recording, in seconds into the clip */
  const time = (epoch) => {
    const p = pieces.find((p) => epoch >= p.from - 0.01 && epoch <= p.to + 0.01);
    if (!p) throw new Error(`${name}: ${epoch} isn't in the clip`);
    return p.at + (epoch - p.from) / speed;
  };
  return { name, rec, pieces, length, speed, time, captions: [] };
}

// the chorus: five bars from its first downbeat, in sync with the music
const c1 = clip("chorus", chorus, [[chorus.song(yoru(0)), chorus.song(yoru(20))]], 20 * (60 / 130));
// adding the song, the network's waits cut out: two bars
const c2 = clip(
  "add",
  add,
  add.at("matched") - add.at("picked") > 0.5
    ? [
        [add.at("add", -0.2), add.at("typed", 0.35)],
        [add.at("results", -0.05), add.at("picked", 0.3)],
        [add.at("matched", -0.05), add.at("added", 0.6)],
      ]
    : [
        [add.at("add", -0.2), add.at("typed", 0.35)],
        [add.at("results", -0.05), add.at("added", 0.6)],
      ],
  2 * BAR,
);
// Codex's run, sped up into two bars
const c3 = clip("codex", annotate, [[annotate.at("annotate", -0.2), annotate.at("annotated", 1.0)]], 2 * BAR);
// one line taken apart: twenty beats of 優しい彗星, in sync with it
const c4 = clip("detail", detail, [[detail.song(suisei(-1)), detail.song(suisei(19))]], 20 * (60 / 90));

const caption = (name, zh, en) => ({ name, zh, en });
c1.captions = [
  [
    caption("lyrics", "歌词跟着 Spotify 逐行走，注音和译文随时开关", "Lyrics follow Spotify line by line, with furigana and translation on demand"),
    0,
    c1.time(chorus.at("panel", -0.5)),
  ],
  [
    caption("breakdown", "点开任意一句：每个词的读音、意思和语法", "Open any line for every word’s reading, meaning and grammar"),
    c1.time(chorus.at("panel", -0.5)),
    c1.length,
  ],
];
c2.captions = [[caption("add", "一次搜索加入新歌：Spotify 曲目，加上带时间轴的歌词", "Add a song in one search: the Spotify track and time-synced lyrics"), 0, c2.length]];
c3.captions = [
  [caption("codex", "用你自己的 Codex 标注整首歌：读音、分词、语法、翻译", "Your own Codex annotates the whole song: readings, words, grammar, translation"), 0, c3.length],
];
c4.captions = [
  [
    caption("compare", "点开一句：日文和中文按短语一一对照", "Open a line: the Japanese and the Chinese, matched phrase by phrase"),
    0,
    c4.time(detail.at("word", -0.5)),
  ],
  [
    caption("words", "点一个词：读音、词性、JLPT 级别，还有动词怎么变形", "Tap a word: its reading, part of speech, JLPT level, and how the verb conjugates"),
    c4.time(detail.at("word", -0.5)),
    c4.time(detail.at("grammar", -0.5)),
  ],
  [
    caption("grammar", "语法点直通语法大纲，例句来自你资料库里的歌", "Grammar points open the outline, with examples from the songs in your library"),
    c4.time(detail.at("grammar", -0.5)),
    c4.length,
  ],
];

// ---- the two scores -------------------------------------------------------------------------------

/**
 * Each score: the clips in order, how long the end card lasts, and the music as pieces
 * { file, from (seconds into the file), at (seconds into the video), length, fadeIn, fadeOut, gain (dB) }.
 * The window's first clip starts at TITLE, the title crossfading into it just before.
 */
const TITLE = 2 * BAR;
// rendered quieter than a mastered record: lifted to sit level with the songs around it
const BGM = { file: `${OUT}/bgm.wav`, bar: (n) => n * BAR, length: 8 * BAR + 3, gain: 3 };
const recAudio = (rec, songAt) => ({ file: `${OUT}/${rec.act}/audio.wav`, from: rec.song(songAt) - rec.audio });

function yoasobi() {
  const end = 3.6;
  const toDetail = TITLE + c1.length + c2.length + c3.length;
  const total = toDetail + c4.length + end;
  return {
    clips: [c1, c2, c3, c4],
    end,
    music: [
      // 夜に駆ける from two bars before the chorus, on under adding the song and Codex
      { ...recAudio(chorus, yoru(-8)), at: 0, length: toDetail + 0.12, fadeIn: 0.4, fadeOut: 0.24 },
      // 優しい彗星 under the breakdown and the end card
      { ...recAudio(detail, suisei(-1) - 0.12), at: toDetail - 0.12, length: total - toDetail + 0.12, fadeIn: 0.24, fadeOut: 2.4 },
    ],
  };
}

function bgm() {
  const toChorus = TITLE + c2.length + c3.length; // the BGM's bar 6, its last beat before left empty
  const toDetail = toChorus + c1.length;
  const toEnd = toDetail + c4.length;
  const end = 2 * BAR + 1.6;
  return {
    clips: [c2, c3, c1, c4],
    end,
    music: [
      // the BGM's intro, groove and build under the title, adding the song and Codex
      { file: BGM.file, from: 0, at: 0, length: toChorus, fadeIn: 0, fadeOut: 0.03, gain: BGM.gain },
      // the chorus comes in on that empty beat (its pickup) and plays on into the breakdown
      { ...recAudio(chorus, yoru(-1)), at: toChorus - 60 / 130, length: c1.length + 60 / 130 + 0.12, fadeIn: 0.03, fadeOut: 0.24 },
      { ...recAudio(detail, suisei(-1) - 0.12), at: toDetail - 0.12, length: c4.length + 0.6, fadeIn: 0.24, fadeOut: 0.6 },
      // the BGM's outro for the end card, ringing out
      { file: BGM.file, from: BGM.bar(6) - 0.3, at: toEnd - 0.3, length: BGM.length - BGM.bar(6) + 0.3, fadeIn: 0.3, fadeOut: 1.5, gain: BGM.gain },
    ],
  };
}

// ---- cards -------------------------------------------------------------------------------------------

const font = `-apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
const mincho = `"Hiragino Mincho ProN", "Songti SC", serif`;
const page = (body, css = "") => `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: transparent; -webkit-font-smoothing: antialiased; }
body { font-family: ${font}; color: #f2f2f4; }
.backdrop { position: fixed; inset: 0; background:
  radial-gradient(1100px 700px at 12% 8%, rgba(142,140,245,.30), transparent 70%),
  radial-gradient(900px 640px at 92% 96%, rgba(232,163,61,.16), transparent 70%),
  radial-gradient(800px 600px at 80% 10%, rgba(233,94,126,.14), transparent 70%),
  linear-gradient(160deg, #17161f, #101015 60%, #141218); }
.center { position: fixed; inset: 0; display: grid; place-content: center; justify-items: center; text-align: center; }
${css}</style>${body}`;

const captionPage = (c) =>
  page(
    `<div class="cap"><div class="zh">${c.zh}</div><div class="en">${c.en}</div></div>`,
    `.cap { position: fixed; left: 0; right: 0; top: ${WIN.y + WIN.h}px; bottom: 0; display: grid; place-content: center; justify-items: center; gap: 4px; }
     .zh { font: 600 29px/1.25 "PingFang SC", ${font}; letter-spacing: .02em; text-shadow: 0 2px 12px rgba(0,0,0,.5); }
     .en { font: 400 18.5px/1.3 ${font}; color: rgba(242,242,244,.62); letter-spacing: .01em; }`,
  );

const cards = {
  backdrop: page(
    `<div class="backdrop"></div><div class="win"></div>`,
    `.win { position: fixed; left: ${WIN.x}px; top: ${WIN.y}px; width: ${WIN.w}px; height: ${WIN.h}px; border-radius: 20px;
       background: #1d1d1f; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 30px 80px rgba(0,0,0,.55), 0 8px 24px rgba(0,0,0,.35); }`,
  ),
  title: page(
    `<div class="backdrop"></div><div class="center">
       <img src="icon.png">
       <div class="name"><span class="ja">言音</span><span class="en">Kotone</span></div>
       <div class="tag">用喜欢的歌学日语</div>
       <div class="tag-en">Learn Japanese from the songs you love</div>
     </div>`,
    `img { width: 168px; height: 168px; margin-bottom: 30px; filter: drop-shadow(0 18px 40px rgba(0,0,0,.45)); }
     .name { display: flex; align-items: baseline; gap: 26px; }
     .ja { font: 600 92px/1.1 ${mincho}; letter-spacing: .08em; }
     .en { font: 300 58px/1.1 ${font}; letter-spacing: .06em; color: rgba(242,242,244,.8); }
     .tag { margin-top: 34px; font: 500 34px/1.3 "PingFang SC", ${font}; letter-spacing: .12em; }
     .tag-en { margin-top: 10px; font: 400 22px/1.3 ${font}; color: rgba(242,242,244,.6); letter-spacing: .02em; }`,
  ),
  end: page(
    `<div class="backdrop"></div><div class="center">
       <img src="icon.png">
       <div class="name"><span class="en">Kotone</span><span class="ja">言音</span></div>
       <div class="meta">macOS <i>·</i> Spotify <i>·</i> Codex</div>
       <div class="tag">边听边学 <i>·</i> Listen, and understand</div>
     </div>`,
    `img { width: 132px; height: 132px; margin-bottom: 26px; filter: drop-shadow(0 16px 36px rgba(0,0,0,.45)); }
     .name { display: flex; align-items: baseline; gap: 22px; }
     .ja { font: 600 64px/1.1 ${mincho}; letter-spacing: .08em; color: rgba(242,242,244,.85); }
     .en { font: 500 64px/1.1 ${font}; letter-spacing: .03em; }
     .meta { margin-top: 26px; font: 500 24px/1.3 ${font}; letter-spacing: .08em; color: #b9b8fb; }
     .tag { margin-top: 14px; font: 400 21px/1.3 "PingFang SC", ${font}; color: rgba(242,242,244,.6); }
     i { font-style: normal; opacity: .5; margin: 0 6px; }`,
  ),
  // while a window is captured, macOS draws a sharing badge where its traffic lights are: the
  // badge is painted out of the recording and the lights (14pt, as on screen) put back
  lights: page(
    [[236, 103, 101], [242, 202, 68], [101, 196, 102]]
      .map(([r, g, b], i) => `<i style="left:${WIN.x + ((15.75 + 23 * i) * WIN.w) / 1280 - 7 * (WIN.w / 1280)}px;background:rgb(${r},${g},${b})"></i>`)
      .join(""),
    `i { position: fixed; top: ${WIN.y + (8.75 * WIN.w) / 1280}px; width: ${(14 * WIN.w) / 1280}px; height: ${(14 * WIN.w) / 1280}px; border-radius: 50%;
       box-shadow: inset 0 0 0 .5px rgba(0,0,0,.18); }`,
  ),
  speed: page(
    `<div class="pill">Codex <b>×${Math.round(c3.speed)}</b></div>`,
    `.pill { position: fixed; right: ${W - WIN.x - WIN.w}px; top: ${(WIN.y + WIN.h + H) / 2 - 18}px; padding: 8px 16px; border-radius: 999px;
       background: rgba(20,20,26,.78); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(10px);
       font: 500 19px/1 ${font}; color: rgba(242,242,244,.85); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
     b { color: #b9b8fb; font-weight: 600; margin-left: 4px; }`,
  ),
};

/** A Swift tool from promo/, built when missing or older than its source */
function tool(name) {
  const bin = `${OUT}/bin/${name}`;
  if (!fs.existsSync(bin) || fs.statSync(`promo/${name}.swift`).mtimeMs > fs.statSync(bin).mtimeMs) {
    fs.mkdirSync(`${OUT}/bin`, { recursive: true });
    execFileSync("swiftc", ["-O", `promo/${name}.swift`, "-o", bin], { stdio: "inherit" });
  }
  return bin;
}

function renderCards() {
  fs.mkdirSync(CARDS, { recursive: true });
  execFileSync("sips", ["-s", "format", "png", "-Z", "512", "macos/AppIcon.icns", "--out", `${CARDS}/icon.png`], { stdio: "ignore" });
  const card = tool("card");
  const render = (name, html) => {
    fs.writeFileSync(`${CARDS}/${name}.html`, html);
    execFileSync(card, [`${CARDS}/${name}.html`, `${CARDS}/${name}.png`]);
  };
  for (const [name, html] of Object.entries(cards)) render(name, html);
  for (const c of [c1, c2, c3, c4]) for (const [cap] of c.captions) render(`cap-${cap.name}`, captionPage(cap));
}

// ---- the edit ------------------------------------------------------------------------------------------

const fmt = (n) => n.toFixed(3);

function cut(name, score) {
  const inputs = [];
  const input = (...args) => (inputs.push(args), inputs.length - 1);
  const still = (file, seconds) => input("-loop", "1", "-framerate", "60", "-t", fmt(seconds), "-i", file);
  const f = [];

  // the window track: the clips back to back
  const main = score.clips.reduce((s, c) => s + c.length, 0);
  const videos = new Map();
  for (const c of score.clips) if (!videos.has(c.rec)) videos.set(c.rec, input("-i", `${OUT}/${c.rec.act}/window.mov`));
  const pieces = score.clips.flatMap((c) => c.pieces.map((p) => ({ ...p, c })));
  for (const [rec, i] of videos) {
    const mine = pieces.filter((p) => p.c.rec === rec);
    f.push(`[${i}:v]split=${mine.length}${mine.map((p) => `[raw${pieces.indexOf(p)}]`).join("")}`);
  }
  pieces.forEach((p, i) => {
    f.push(
      `[raw${i}]trim=start=${fmt(p.from - p.c.rec.video)}:end=${fmt(p.to - p.c.rec.video)},setpts=(PTS-STARTPTS)/${p.c.speed.toFixed(5)},fps=60,` +
        `delogo=x=4:y=4:w=144:h=58,scale=${WIN.w}:${WIN.h}:flags=lanczos,setsar=1,trim=duration=${fmt(p.length)}[seg${i}]`,
    );
  });
  f.push(`${pieces.map((_, i) => `[seg${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0,format=yuva420p[win]`);
  const mask = still(`${OUT}/chorus/window.png`, main);
  f.push(`[${mask}:v]scale=${WIN.w}:${WIN.h}:flags=lanczos,format=rgba,alphaextract,format=gray[mask]`);
  f.push(`[win][mask]alphamerge[winA]`);
  const backdrop = still(`${CARDS}/backdrop.png`, main);
  f.push(`[${backdrop}:v]scale=${W}:${H}:flags=lanczos,format=yuva420p[bg]`);
  f.push(`[bg][winA]overlay=${WIN.x}:${WIN.y}:eof_action=pass[m0]`);
  const lights = still(`${CARDS}/lights.png`, main);
  f.push(`[${lights}:v]scale=${W}:${H}:flags=lanczos,format=rgba[lights]`);
  f.push(`[m0][lights]overlay=eof_action=pass[m1]`);
  let last = "m1";
  const overlay = (file, from, length, label) => {
    const i = still(file, length);
    f.push(
      `[${i}:v]scale=${W}:${H}:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${fmt(length - 0.2)}:d=0.2:alpha=1,setpts=PTS+${fmt(from)}/TB[${label}]`,
    );
    f.push(`[${last}][${label}]overlay=eof_action=pass[${label}o]`);
    last = `${label}o`;
  };
  let t = 0;
  for (const c of score.clips) {
    if (c === c3) overlay(`${CARDS}/speed.png`, t, c.length, "speed");
    for (const [cap, a, b] of c.captions) overlay(`${CARDS}/cap-${cap.name}.png`, t + a, b - a, `cap_${cap.name}`);
    t += c.length;
  }
  const norm = "fps=60,format=yuv420p,settb=AVTB";
  f.push(`[${last}]${norm}[main]`);
  const title = still(`${CARDS}/title.png`, TITLE);
  const end = still(`${CARDS}/end.png`, score.end + 0.5);
  f.push(`[${title}:v]scale=${W}:${H}:flags=lanczos,${norm}[title]`);
  f.push(`[${end}:v]scale=${W}:${H}:flags=lanczos,${norm},fade=t=out:st=${fmt(score.end - 0.1)}:d=0.6[end]`);
  // the window is fully in at TITLE (on the downbeat), and the end card at TITLE + main
  f.push(`[title][main]xfade=transition=fade:duration=${XF}:offset=${fmt(TITLE - XF)}[tm]`);
  f.push(`[tm][end]xfade=transition=fade:duration=0.5:offset=${fmt(TITLE - XF + main - 0.5)}[v]`);
  const total = TITLE - XF + main - 0.5 + score.end + 0.5;

  // the music: the window's frames are at TITLE - XF + clip time, so shift it to match
  const tracks = score.music.map((m, k) => {
    const i = input("-i", m.file);
    const at = m.at - XF;
    const trimmed = at < 0 ? -at : 0;
    f.push(
      `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${m.gain ?? 0}dB,atrim=start=${fmt(m.from + trimmed)}:duration=${fmt(m.length - trimmed)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:d=${fmt(Math.max(0.01, m.fadeIn))},afade=t=out:st=${fmt(m.length - trimmed - m.fadeOut)}:d=${fmt(Math.max(0.01, m.fadeOut))},` +
        `adelay=${Math.round(Math.max(0, at) * 1000)}:all=1[a${k}]`,
    );
    return `[a${k}]`;
  });
  f.push(`${tracks.join("")}amix=inputs=${tracks.length}:normalize=0:duration=longest,atrim=duration=${fmt(total)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);

  const filter = `${OUT}/filter-${name}.txt`;
  fs.writeFileSync(filter, f.join(";\n"));
  const file = `${OUT}/kotone-promo-${name}.mp4`;
  const speeds = score.clips.map((c) => `${c.name} ${c.length.toFixed(2)}s${Math.abs(c.speed - 1) > 0.05 ? ` (×${c.speed.toFixed(2)})` : ""}`);
  console.log(`${name}: ${speeds.join(", ")}; ${total.toFixed(1)}s`);
  execFileSync(
    "ffmpeg",
    [
      ...["-y", "-v", "error", ...inputs.flat(), "-filter_complex_script", filter, "-map", "[v]", "-map", "[a]"],
      ...["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", file],
    ],
    { stdio: "inherit" },
  );
  console.log(`✓ ${path.resolve(file)}`);
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["yoasobi", "bgm"];
renderCards();
if (wanted.includes("bgm")) execFileSync(tool("bgm"), [`${OUT}/bgm.wav`], { stdio: "inherit" });
for (const name of wanted) cut(name, { yoasobi, bgm }[name]());
