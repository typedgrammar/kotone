// Helpers for the promo tours, prepended to each act (promo/record.sh). The live app is driven
// through its DOM, with a drawn cursor (a window recording has none) moving to what it clicks;
// `kotone.app` / `kotone.agent` (exposed for --tour) are read for timing and set-up only.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (m) => webkit.messageHandlers.tour.postMessage(m);
/** Prints "MARK <unix seconds> <label> <seconds into the song>" (the song part while Spotify plays) */
const mark = (label) => post({ mark: window.kotone?.app.spotify.state === "playing" ? `${label} ${songTime().toFixed(3)}` : label });
const log = (text) => post({ log: String(text) });

async function waitFor(test, timeout = 30000, what = "condition") {
  const end = Date.now() + timeout;
  for (;;) {
    const v = test();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/** The button (or other element) whose own text is exactly `text` */
const byText = (text, sel = "button") => $$(sel).find((el) => el.textContent.trim() === text);

/** Seconds into the song Spotify plays (from its last report, not the page's animation frames) */
function songTime() {
  const s = kotone.app.spotify;
  return (s.position ?? 0) + (s.state === "playing" ? (performance.now() - s.at) / 1000 : 0);
}
// right after a seek Spotify reports the new position before it actually plays from there:
// start an act's timed steps several seconds past where it seeks to
const atSong = (t) => waitFor(() => kotone.app.spotify.state === "playing" && songTime() >= t, 120000, `song time ${t}`);

// ---- on the beat ---------------------------------------------------------------------------------

/** The song seconds of beat n on a grid { bpm, at } (`at`: a beat, as promo/beats.mjs measures) */
const beats = (grid) => (n) => grid.at + (n * 60) / grid.bpm;
const resolve = (x) => (typeof x === "function" ? x() : x);

/** Click so the press lands at song second t (the cursor sets off just in time) */
async function clickOn(t, target, { ms = 320, ...opts } = {}) {
  await atSong(t - ms / 1000 - 0.09);
  await click(resolve(target), { ...opts, ms });
}
/** Click empty space at (x, y), landing at song second t */
async function clickAtOn(t, x, y, ms = 320) {
  await atSong(t - ms / 1000 - 0.09);
  await clickAt(x, y, ms);
}
/** Arrive over an element at song second t */
async function hoverOn(t, target, ms = 300) {
  await atSong(t - ms / 1000);
  await hover(resolve(target), ms);
}
/** Press a key at song second t, showing it as keycaps */
async function keyOn(t, k, ...caps) {
  await atSong(t);
  if (caps.length) showKeys(...caps);
  key(k);
}

// ---- the real pointer, kept out ------------------------------------------------------------------

// whatever the real mouse rests on would show its hover state (a row's star, its play button) where
// the drawn cursor isn't: a transparent sheet over the page takes the hover instead. Scripted
// clicks go to their elements directly. Scroll bars, which flash as the lyrics follow, are hidden.
const shield = document.createElement("div");
Object.assign(shield.style, { position: "fixed", inset: "0", zIndex: "2147483640" });
const quiet = document.createElement("style");
quiet.textContent = "::-webkit-scrollbar { display: none !important; }";
document.documentElement.append(shield, quiet);

// ---- the cursor ------------------------------------------------------------------------------

const cursor = document.createElement("div");
cursor.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M5 2.5v18.2l4.6-4.4 3 6.9 3.1-1.3-3-6.8h6.4z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
Object.assign(cursor.style, {
  position: "fixed",
  left: "0",
  top: "0",
  zIndex: "2147483647",
  pointerEvents: "none",
  filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
  transformOrigin: "5px 3px",
  transition: "opacity .25s",
  opacity: "0",
});
const ring = document.createElement("div");
Object.assign(ring.style, {
  position: "fixed",
  zIndex: "2147483646",
  pointerEvents: "none",
  width: "34px",
  height: "34px",
  margin: "-17px 0 0 -17px",
  borderRadius: "50%",
  background: "rgba(143,177,232,.35)",
  border: "2px solid rgba(143,177,232,.9)",
  opacity: "0",
});
let at = { x: 0, y: 0 };
function place(x, y, scale = 1) {
  at = { x, y };
  cursor.style.transform = `translate(${x - 5}px, ${y - 3}px) scale(${scale})`;
}

function showCursor(x, y) {
  if (!cursor.isConnected) document.body.append(ring, cursor);
  place(x, y);
  cursor.style.opacity = "1";
}
function hideCursor() {
  cursor.style.opacity = "0";
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where to point at an element: its centre, or a fraction of its box */
function pointOf(el, fx = 0.5, fy = 0.5) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * fx, y: r.top + r.height * fy };
}

/** Glide to a point (or an element's centre), on a slight arc, in a time that grows with distance */
async function moveTo(target, ms) {
  const to = target instanceof Element ? pointOf(target) : target;
  const from = { ...at };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  ms ??= Math.min(900, 280 + dist * 0.9);
  const bend = Math.min(60, dist * 0.12);
  const start = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - start) / ms);
    const e = ease(t);
    const arc = Math.sin(Math.PI * e) * bend;
    place(from.x + (to.x - from.x) * e - arc * 0.3, from.y + (to.y - from.y) * e - arc);
    if (t >= 1) break;
    // not requestAnimationFrame: a window that's hidden for a moment would never get the next one
    await sleep(8);
  }
}

async function press() {
  ring.style.left = `${at.x}px`;
  ring.style.top = `${at.y}px`;
  ring.animate(
    [
      { opacity: 1, transform: "scale(.4)" },
      { opacity: 0, transform: "scale(1.25)" },
    ],
    { duration: 450, easing: "ease-out" },
  );
  place(at.x, at.y, 0.86);
  await sleep(110);
  place(at.x, at.y, 1);
}

/** Move to an element, press, and click it the way a pointer would */
async function click(el, { fx = 0.5, fy = 0.5, ms } = {}) {
  if (!el) throw new Error("click: no element");
  await moveTo(pointOf(el, fx, fy), ms);
  await sleep(90);
  const opts = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  const p = press();
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.click();
  await p;
}

/** Rest the cursor on an element, as hovering it would (mouseenter, which Solid listens for) */
let hovered = null;
async function hover(el, ms) {
  await moveTo(pointOf(el), ms);
  unhover();
  el.dispatchEvent(new MouseEvent("mouseenter", { clientX: at.x, clientY: at.y }));
  hovered = el;
}
function unhover() {
  hovered?.dispatchEvent(new MouseEvent("mouseleave", { clientX: at.x, clientY: at.y }));
  hovered = null;
}

/** Click empty space: whatever is under the point gets the pointer events */
async function clickAt(x, y, ms) {
  await moveTo({ x, y }, ms);
  await sleep(90);
  shield.style.pointerEvents = "none";
  const el = document.elementFromPoint(x, y);
  shield.style.pointerEvents = "";
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  const p = press();
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
  await p;
}

// ---- keys --------------------------------------------------------------------------------------

const keycaps = document.createElement("div");
Object.assign(keycaps.style, {
  position: "fixed",
  left: "50%",
  bottom: "96px",
  transform: "translateX(-50%)",
  zIndex: "2147483645",
  pointerEvents: "none",
  display: "flex",
  gap: "8px",
  opacity: "0",
  transition: "opacity .2s",
});

/** Show a shortcut as keycaps for a moment, e.g. showKeys("⌘", "N") */
async function showKeys(...keys) {
  if (!keycaps.isConnected) document.body.append(keycaps);
  keycaps.innerHTML = keys
    .map(
      (k) =>
        `<span style="min-width:44px;height:44px;padding:0 12px;display:grid;place-items:center;border-radius:10px;background:rgba(30,30,34,.82);color:#f2f2f4;font:500 21px -apple-system;border:1px solid rgba(255,255,255,.14);box-shadow:0 6px 20px rgba(0,0,0,.3);backdrop-filter:blur(12px)">${k}</span>`,
    )
    .join("");
  keycaps.style.opacity = "1";
  setTimeout(() => (keycaps.style.opacity = "0"), 1100);
}

function key(k) {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

/** Type into an input a character at a time */
async function type(input, text, perChar = 140) {
  input.focus();
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
    await sleep(perChar);
  }
}

// ---- set-up ------------------------------------------------------------------------------------

/**
 * Settings live in the page's localStorage, which this instance shares with the everyday app:
 * keep the user's the first time, and put them back at the end of the last act.
 */
function keepSettings() {
  if (!localStorage.getItem("promo.kept")) localStorage.setItem("promo.kept", localStorage.getItem("kotone.settings") ?? "{}");
}
function restoreSettings() {
  const kept = localStorage.getItem("promo.kept");
  if (kept === null) return;
  localStorage.setItem("kotone.settings", kept);
  localStorage.removeItem("promo.kept");
}

async function ready() {
  await waitFor(() => window.kotone && $("[data-nav]") && kotone.app.records().length, 20000, "app");
  // until Spotify's first report the app takes it for not installed (and play asks for a file)
  await waitFor(() => kotone.app.spotify.installed && kotone.app.spotify.at > 0, 20000, "Spotify");
  keepSettings();
  kotone.app.setSettings({ furigana: true, translation: true, panelPx: 0 });
}

async function pauseMusic() {
  if (kotone.app.playing()) await kotone.app.togglePlay();
}

async function act(fn) {
  try {
    await ready();
    await fn();
  } catch (e) {
    log(`ERROR ${e?.message ?? e}`);
    await pauseMusic().catch(() => {});
  }
  await sleep(600);
  post({ done: true });
}
