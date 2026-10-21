// The beat of a recorded song, so the tours can click on it and the edit can cut on it:
//   node promo/beats.mjs <act> [from to [slowest fastest]]   (song seconds; BPM, default 70 180)
// Reads promo/out/<act>/audio.wav (what Spotify played) and the act's marks (which tie the
// recording's clock to seconds into the song), and prints the tempo, a beat and a bar's first
// beat, in seconds into the song: { bpm, beat, bar }.

import fs from "node:fs";

/** Mono samples of a 16-bit PCM WAV */
export function readWav(file) {
  const buf = fs.readFileSync(file);
  let at = 12;
  let rate = 48000;
  let channels = 2;
  while (at < buf.length) {
    const id = buf.toString("ascii", at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(at + 10);
      rate = buf.readUInt32LE(at + 12);
    } else if (id === "data") {
      const frames = Math.floor(size / (2 * channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += buf.readInt16LE(at + 8 + (i * channels + c) * 2);
        out[i] = s / channels / 32768;
      }
      return { rate, samples: out };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error(`${file}: no data`);
}

const HOP = 0.01; // onset envelope resolution, s

/** Rise in loudness per 10 ms (log energy, half-wave rectified): high-passed for the beat, low-passed for the kick */
function onsets(samples, rate, lowpass) {
  const hop = Math.round(rate * HOP);
  const n = Math.floor(samples.length / hop);
  const env = new Float32Array(n);
  let prev = 0;
  let lp = 0;
  let last = 0;
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const x = samples[i];
      lp += 0.02 * (x - lp); // ~150 Hz one-pole
      const v = lowpass ? lp : x - prev;
      prev = x;
      e += v * v;
    }
    const l = Math.log(1e-9 + e);
    env[f] = Math.max(0, l - last);
    last = l;
  }
  return env;
}

const comb = (env, period, phase) => {
  let s = 0;
  let k = 0;
  for (let t = phase; t < env.length - 1; t += period, k++) {
    const i = Math.floor(t);
    s += env[i] * (1 - (t - i)) + env[i + 1] * (t - i);
  }
  return s / Math.max(1, k);
};

export function beatOf(samples, rate, slowest = 70, fastest = 180) {
  const env = onsets(samples, rate, false);
  // tempo: the comb that collects the most onsets, preferring 120 BPM-ish over its halves and doubles
  let best = { score: -1 };
  for (let bpm = slowest; bpm <= fastest; bpm += 0.05) {
    const period = 60 / bpm / HOP;
    let top = 0;
    let at = 0;
    for (let p = 0; p < period; p += 0.5) {
      const s = comb(env, period, p);
      if (s > top) [top, at] = [s, p];
    }
    const score = top * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2 / 0.6 ** 2);
    if (score > best.score) best = { score, bpm, phase: at };
  }
  const period = 60 / best.bpm / HOP;
  // a bar's first beat: of four in a row, the one with the most kick
  const kick = onsets(samples, rate, true);
  let bar = 0;
  let loudest = -1;
  for (let b = 0; b < 4; b++) {
    const s = comb(kick, period * 4, best.phase + b * period);
    if (s > loudest) [loudest, bar] = [s, b];
  }
  return { bpm: best.bpm, beat: best.phase * HOP, bar: (best.phase + bar * period) * HOP };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [act, from, to, slowest, fastest] = process.argv.slice(2);
  const dir = `promo/out/${act}`;
  const log = fs.readFileSync(`${dir}/marks.log`, "utf8") + fs.readFileSync(`${dir}/record.log`, "utf8");
  const sync = [...log.matchAll(/^MARK (\S+) \S+ (\S+)$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
  const audioAt = Number(log.match(/^AUDIO (\S+)$/m)[1]);
  if (!sync.length) throw new Error(`${act}: no marks with song times`);
  // song seconds ↔ seconds into audio.wav, from the mark nearest
  const toAudio = (t) => {
    const [epoch, at] = sync.reduce((a, b) => (Math.abs(b[1] - t) < Math.abs(a[1] - t) ? b : a));
    return epoch + (t - at) - audioAt;
  };
  const { rate, samples } = readWav(`${dir}/audio.wav`);
  const start = from ? Math.max(0, toAudio(Number(from))) : 0;
  const end = to ? Math.min(samples.length / rate, toAudio(Number(to))) : samples.length / rate;
  const r = beatOf(samples.subarray(Math.round(start * rate), Math.round(end * rate)), rate, Number(slowest ?? 70), Number(fastest ?? 180));
  // back to song seconds (the window's start is at song `from`, or wherever the recording began)
  const song0 = from ? Number(from) - (toAudio(Number(from)) - start) : sync[0][1] - (toAudio(sync[0][1]) - start);
  console.log(JSON.stringify({ bpm: Number(r.bpm.toFixed(2)), beat: Number((song0 + r.beat).toFixed(3)), bar: Number((song0 + r.bar).toFixed(3)) }));
}
