// Cuts the promo from the two recorded acts (promo/record.sh zh, then detail):
//   node promo/make.mjs
// Title card → 夜に駆ける's chorus in Chinese (lyrics, furigana, a line's breakdown) → adding
// 優しい彗星 → Codex annotating it (sped up) → one line of 優しい彗星 taken apart (phrases matched
// across Japanese and Chinese, words, conjugations, a grammar point in the outline) → end card. The window sits on a backdrop with bilingual captions under
// it; the music is what Spotify played during the recording, in sync wherever lyrics show.
// Writes promo/out/kotone-promo.mp4 (1920×1080, 60 fps).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = "promo/out";
const CARDS = `${OUT}/cards`;
const W = 1920;
const H = 1080;
// the window on the backdrop, with the caption band below it
const WIN = { x: 208, y: 28, w: 1504, h: 940 };
const TITLE = 3.2;
const END = 3.6;
const XFADE_IN = 0.5;
const XFADE_OUT = 0.7;

// ---- the recordings ------------------------------------------------------------------------------

/** Marks (unix seconds by label) and when each file's first sample was taken */
function readAct(act, songStart) {
  const text = fs.readFileSync(`${OUT}/${act}/marks.log`, "utf8") + fs.readFileSync(`${OUT}/${act}/record.log`, "utf8");
  const marks = {};
  // [unix seconds, seconds into the song] wherever a mark was taken with the music playing
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
  for (const need of ["start", "end"]) if (!marks[need]) throw new Error(`${act}: no "${need}" mark — record it again`);
  const at = (label, d = 0) => {
    if (!marks[label]) throw new Error(`${act}: no "${label}" mark`);
    return marks[label] + d;
  };
  // a moment of the song: from the mark nearest it (Spotify may stall to buffer between marks),
  // or from the start mark, taken at `songStart`
  if (!sync.length) sync.push([marks.start, songStart]);
  const song = (t) => {
    const [epoch, at] = sync.reduce((a, b) => (Math.abs(b[1] - t) < Math.abs(a[1] - t) ? b : a));
    return epoch + (t - at);
  };
  return { act, marks, video, audio, at, song };
}

const zh = readAct("zh", 70);
const detail = readAct("detail", 184);

/**
 * The window's part of the video: [act, from, to, length on screen]. Typing and the search wait
 * are squeezed if slow; Codex's run is sped up to a few seconds.
 */
const fit = (from, to, max) => Math.min(to - from, max);
const segments = [
  { rec: zh, from: zh.song(74), to: zh.at("add", -0.25), name: "chorus" },
  { rec: zh, from: zh.at("add", -0.25), to: zh.at("results", 0.5), max: 4.2, name: "search" },
  { rec: zh, from: zh.at("results", 0.5), to: zh.at("added", 1.0), max: 7, name: "pick" },
  { rec: zh, from: zh.at("annotate", -0.3), to: zh.at("annotated", 1.8), max: 6.5, name: "codex" },
  { rec: detail, from: detail.song(185.6), to: detail.at("end"), name: "detail" },
].map((s) => ({ ...s, length: s.max ? fit(s.from, s.to, s.max) : s.to - s.from }));
let t = 0;
for (const s of segments) {
  s.speed = (s.to - s.from) / s.length;
  s.at = t; // start on the window track
  t += s.length;
}
const main = t;
const seg = (name) => segments.find((s) => s.name === name);
/** A moment of a recording, on the window track (inside the segment that has it) */
function onTrack(rec, epoch) {
  const s = segments.find((s) => s.rec === rec && epoch >= s.from - 0.01 && epoch <= s.to + 0.01);
  if (!s) throw new Error(`${rec.act}: ${epoch} isn't in the cut`);
  return s.at + (epoch - s.from) / s.speed;
}
const codex = seg("codex");
const speedup = Math.round(codex.speed);

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

const caption = (zhText, enText) =>
  page(
    `<div class="cap"><div class="zh">${zhText}</div><div class="en">${enText}</div></div>`,
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
    `<div class="pill">Codex <b>×${speedup}</b></div>`,
    `.pill { position: fixed; right: ${W - WIN.x - WIN.w}px; top: ${(WIN.y + WIN.h + H) / 2 - 18}px; padding: 8px 16px; border-radius: 999px;
       background: rgba(20,20,26,.78); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(10px);
       font: 500 19px/1 ${font}; color: rgba(242,242,244,.85); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
     b { color: #b9b8fb; font-weight: 600; margin-left: 4px; }`,
  ),
};

/** [card, from, to] on the window track */
const captions = [
  [
    "lyrics",
    caption("歌词跟着 Spotify 逐行走，注音和译文随时开关", "Lyrics follow Spotify line by line, with furigana and translation on demand"),
    0,
    onTrack(zh, zh.at("panel", -0.4)),
  ],
  [
    "breakdown",
    caption("点开任意一句：每个词的读音、意思和语法", "Open any line for every word’s reading, meaning and grammar"),
    onTrack(zh, zh.at("panel", -0.4)),
    seg("search").at,
  ],
  [
    "add",
    caption("一次搜索加入新歌：Spotify 曲目，加上带时间轴的歌词", "Add a song in one search: the Spotify track and time-synced lyrics"),
    seg("search").at,
    codex.at,
  ],
  [
    "codex",
    caption("用你自己的 Codex 标注整首歌：读音、分词、语法、翻译", "Your own Codex annotates the whole song: readings, words, grammar, translation"),
    codex.at,
    codex.at + codex.length,
  ],
  [
    "compare",
    caption("点开一句：日文和中文按短语一一对照", "Open a line: the Japanese and the Chinese, matched phrase by phrase"),
    seg("detail").at,
    onTrack(detail, detail.at("word", -0.4)),
  ],
  [
    "words",
    caption("点一个词：读音、词性、JLPT 级别，还有动词怎么变形", "Tap a word: its reading, part of speech, JLPT level, and how the verb conjugates"),
    onTrack(detail, detail.at("word", -0.4)),
    onTrack(detail, detail.at("grammar", -0.4)),
  ],
  [
    "grammar",
    caption("语法点直通语法大纲，例句来自你资料库里的歌", "Grammar points open the outline, with examples from the songs in your library"),
    onTrack(detail, detail.at("grammar", -0.4)),
    main,
  ],
];

fs.mkdirSync(CARDS, { recursive: true });
execFileSync("sips", ["-s", "format", "png", "-Z", "512", "macos/AppIcon.icns", "--out", `${CARDS}/icon.png`], { stdio: "ignore" });
const render = (name, html) => {
  fs.writeFileSync(`${CARDS}/${name}.html`, html);
  execFileSync(`${OUT}/bin/card`, [`${CARDS}/${name}.html`, `${CARDS}/${name}.png`]);
  return `${CARDS}/${name}.png`;
};
for (const [name, html] of Object.entries(cards)) render(name, html);
for (const c of captions) c[1] = render(`cap-${c[0]}`, c[1]);

// ---- the edit ------------------------------------------------------------------------------------------

const inputs = [];
const input = (...args) => (inputs.push(args), inputs.length - 1);
const zhVideo = input("-i", `${OUT}/zh/window.mov`);
const detailVideo = input("-i", `${OUT}/detail/window.mov`);
const zhAudio = input("-i", `${OUT}/zh/audio.wav`);
const detailAudio = input("-i", `${OUT}/detail/audio.wav`);
const still = (file, seconds) => input("-loop", "1", "-framerate", "60", "-t", seconds.toFixed(3), "-i", file);
const backdrop = still(`${CARDS}/backdrop.png`, main);
const mask = still(`${OUT}/zh/window.png`, main);
const title = still(`${CARDS}/title.png`, TITLE);
const end = still(`${CARDS}/end.png`, END);
const speedPill = still(`${CARDS}/speed.png`, codex.length);
const capInputs = captions.map(([, file, from, to]) => ({ i: still(file, to - from), from, to }));

const f = [];
const fmt = (n) => n.toFixed(3);
const videoOf = (rec) => (rec === zh ? zhVideo : detailVideo);
const uses = (rec) => segments.filter((s) => s.rec === rec).length;
for (const rec of [zh, detail]) {
  const outs = segments.filter((s) => s.rec === rec).map((s) => `[raw${segments.indexOf(s)}]`);
  f.push(`[${videoOf(rec)}:v]split=${uses(rec)}${outs.join("")}`);
}
segments.forEach((s, i) => {
  const from = s.from - s.rec.video;
  const to = s.to - s.rec.video;
  f.push(
    `[raw${i}]trim=start=${fmt(from)}:end=${fmt(to)},setpts=(PTS-STARTPTS)/${s.speed.toFixed(4)},fps=60,delogo=x=4:y=4:w=144:h=58,scale=${WIN.w}:${WIN.h}:flags=lanczos,setsar=1[seg${i}]`,
  );
});
f.push(`${segments.map((_, i) => `[seg${i}]`).join("")}concat=n=${segments.length}:v=1:a=0,format=yuva420p[win]`);
f.push(`[${mask}:v]scale=${WIN.w}:${WIN.h}:flags=lanczos,format=rgba,alphaextract,format=gray[mask]`);
f.push(`[win][mask]alphamerge[winA]`);
f.push(`[${backdrop}:v]scale=${W}:${H}:flags=lanczos,format=yuva420p[bg]`);
f.push(`[bg][winA]overlay=${WIN.x}:${WIN.y}:eof_action=pass[m0]`);
const lights = still(`${CARDS}/lights.png`, main);
f.push(`[${lights}:v]scale=${W}:${H}:flags=lanczos,format=rgba[lights]`);
f.push(`[m0][lights]overlay=eof_action=pass[m1]`);
let last = "m1";
const overlay = (i, from, length, name) => {
  f.push(
    `[${i}:v]scale=${W}:${H}:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${fmt(length - 0.3)}:d=0.3:alpha=1,setpts=PTS+${fmt(from)}/TB[${name}]`,
  );
  f.push(`[${last}][${name}]overlay=eof_action=pass[${name}o]`);
  last = `${name}o`;
};
overlay(speedPill, codex.at, codex.length, "speed");
capInputs.forEach((c, k) => overlay(c.i, c.from, c.to - c.from, `cap${k}`));
const norm = "fps=60,format=yuv420p,settb=AVTB";
f.push(`[${last}]${norm}[main]`);
f.push(`[${title}:v]scale=${W}:${H}:flags=lanczos,${norm}[title]`);
f.push(`[${end}:v]scale=${W}:${H}:flags=lanczos,${norm}[end]`);
const mainAt = TITLE - XFADE_IN;
f.push(`[title][main]xfade=transition=fade:duration=${XFADE_IN}:offset=${fmt(mainAt)}[tm]`);
f.push(`[tm][end]xfade=transition=fade:duration=${XFADE_OUT}:offset=${fmt(mainAt + main - XFADE_OUT)}[v]`);
const total = mainAt + main - XFADE_OUT + END;

// music: 夜に駆ける runs on from before the title until the cut to act 2, where it crossfades
// into 優しい彗星; both line up with the window wherever lyrics are on screen
const second = mainAt + seg("detail").at;
const cross = 0.9;
const zhFrom = zh.song(74) - mainAt - zh.audio;
const zhLength = second + cross / 2;
const detailFrom = detail.song(185.6) - cross / 2 - detail.audio;
const detailLength = total - second + cross / 2;
f.push(
  `[${zhAudio}:a]atrim=start=${fmt(zhFrom)}:duration=${fmt(zhLength)},asetpts=PTS-STARTPTS,afade=t=in:d=0.8,afade=t=out:st=${fmt(zhLength - cross)}:d=${cross}[za]`,
);
f.push(
  `[${detailAudio}:a]atrim=start=${fmt(detailFrom)}:duration=${fmt(detailLength)},asetpts=PTS-STARTPTS,afade=t=in:d=${cross},afade=t=out:st=${fmt(detailLength - 2.2)}:d=2.2,adelay=${Math.round((second - cross / 2) * 1000)}:all=1[ea]`,
);
f.push(`[za][ea]amix=inputs=2:normalize=0:duration=longest,atrim=duration=${fmt(total)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);

const file = `${OUT}/kotone-promo.mp4`;
fs.writeFileSync(`${OUT}/filter.txt`, f.join(";\n"));
console.log(
  segments.map((s) => `${s.name.padEnd(8)} ${s.length.toFixed(1)}s${s.speed > 1.05 ? ` (×${s.speed.toFixed(1)})` : ""}`).join("\n"),
  `\ntotal ${total.toFixed(1)}s`,
);
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    "-stats",
    ...inputs.flat(),
    "-filter_complex_script",
    `${OUT}/filter.txt`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-movflags",
    "+faststart",
    file,
  ],
  { stdio: "inherit" },
);
console.log(`✓ ${path.resolve(file)}`);
