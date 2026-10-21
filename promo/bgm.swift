// Kotone's own music for the promo: written here note by note and played offline through macOS's
// General MIDI sound bank, so it's free to use anywhere.
//
//   bgm <out.wav>
//
// B♭ major at 130 BPM (the tempo of 夜に駆ける, whose G minor it lands on), on the J-pop
// "royal road" E♭maj7 → F → Dm7 → Gm7. Eight bars and a tail, in sections the edit cuts on:
//   bars 0–1 intro (keys and bells), 2–3 groove (drums and bass come in), 4–5 build (a riser and
//   a snare roll, cut off a beat early so the next thing lands on the downbeat), 6–7 outro
//   (resolving to B♭), then the last chord rings out.

import AVFoundation

let bpm = 130.0
let beat = 60 / bpm
let rate = 48000.0
let bars = 8
let tail = 3.0

struct Note {
  var at: Double  // beats from the start
  var key: UInt8
  var length: Double  // beats
  var velocity: UInt8
  var part: Int
}

enum Part: Int, CaseIterable {
  case keys, bells, pad, bass, drums, riser
  /// GM program, and whether it's the percussion bank
  var program: (UInt8, Bool) {
    switch self {
    case .keys: return (4, false)  // Electric Piano 1
    case .bells: return (9, false)  // Glockenspiel
    case .pad: return (89, false)  // Pad 2 (warm)
    case .bass: return (33, false)  // Electric Bass (finger)
    case .drums: return (0, true)  // Standard kit
    case .riser: return (119, false)  // Reverse Cymbal
    }
  }
  var gain: Float {
    switch self {
    case .keys: return 0.9
    case .bells: return 0.55
    case .pad: return 0.35
    case .bass: return 0.9
    case .drums: return 0.85
    case .riser: return 0.5
    }
  }
}

var notes: [Note] = []
func add(_ part: Part, _ at: Double, _ key: Int, _ length: Double, _ velocity: Int) {
  notes.append(Note(at: at, key: UInt8(key), length: length, velocity: UInt8(velocity), part: part.rawValue))
}

// MIDI note numbers
let Bb2 = 46, C3 = 48, D3 = 50, Eb3 = 51, F3 = 53, G3 = 55, A3 = 57, Bb3 = 58
let C4 = 60, D4 = 62, Eb4 = 63, F4 = 65, G4 = 67, A4 = 69, Bb4 = 70
let C5 = 72, D5 = 74, Eb5 = 75, F5 = 77, G5 = 79, A5 = 81, Bb5 = 82

struct Chord {
  var root: Int  // bass note
  var voicing: [Int]  // keys
  var arp: [Int]  // bells, eight eighths
}
let EbMaj7 = Chord(root: Eb3 - 12, voicing: [G3, Bb3, D4, Eb4], arp: [Eb5, G5, Bb5, D5, G5, Bb4, D5, G5])
let F = Chord(root: F3 - 12, voicing: [A3, C4, F4, G4], arp: [F5, A5, C5, F5, G5, C5, A4, C5])
let Dm7 = Chord(root: D3 - 12, voicing: [F3, A3, C4, D4], arp: [D5, F5, A5, C5, F5, A4, C5, F5])
let Gm7 = Chord(root: G3 - 12, voicing: [F3, Bb3, D4, G4], arp: [G5, Bb5, D5, G5, F5, D5, Bb4, D5])
let Bb = Chord(root: Bb2 - 12, voicing: [D4, F4, Bb4, C5], arp: [Bb5, F5, D5, C5, F5, D5, Bb4, F5])
let progression = [EbMaj7, F, Dm7, Gm7, EbMaj7, F, EbMaj7, Bb]

// drum keys (GM)
let kick = 36, snare = 38, clap = 39, hat = 42, openHat = 46, crash = 49, tamb = 54

for (bar, chord) in progression.enumerated() {
  let b = Double(bar * 4)
  let intro = bar < 2, groove = (2...3).contains(bar), build = (4...5).contains(bar), outro = bar >= 6
  let last = bar == bars - 1

  // pad under everything
  for k in chord.voicing { add(.pad, b, k, last ? 4 + tail / beat : 4, 40) }

  // keys: held in the intro and at the end, stabs (1, 2&, 4) in between
  if intro || last {
    for k in chord.voicing { add(.keys, b, k, last ? 4 + tail / beat : 3.8, intro ? 62 : 70) }
  } else {
    for (at, len, vel) in [(0.0, 1.2, 78), (1.5, 0.8, 66), (3.0, 0.8, 70)] {
      for k in chord.voicing { add(.keys, b + at, k, len, vel) }
    }
  }

  // bells: the arpeggio in eighths; sixteenths through the build; one long note to finish
  if last {
    for (i, k) in [Bb5, F5, D5].enumerated() { add(.bells, b + Double(i) * 0.5, k, 3, 64 - i * 8) }
  } else if build {
    for i in 0..<16 where !(bar == 5 && i >= 12) {
      add(.bells, b + Double(i) * 0.25, chord.arp[i % 8], 0.3, 46 + i * 2)
    }
  } else {
    for (i, k) in chord.arp.enumerated() { add(.bells, b + Double(i) * 0.5, k, 0.45, intro ? 50 + (i % 2) * 6 : 58 + (i % 2) * 8) }
  }

  // bass from the groove on: eighths on the root, an octave jump on the and of 3
  if !intro {
    let pattern: [(Double, Int)] = last ? [(0, 0)] : [(0, 0), (0.5, 0), (1, 0), (1.5, 12), (2, 0), (2.5, 0), (3, 0), (3.5, 12)]
    for (at, up) in pattern where !(bar == 5 && at >= 3) {
      add(.bass, b + at, chord.root + up, last ? 4 : 0.42, at == 0 ? 96 : 80)
    }
  }

  // drums: four-on-the-floor kick, claps on 2 and 4, hats in eighths
  if groove || build || outro {
    if bar == 2 || bar == 6 { add(.drums, b, crash, 2, 92) }
    for i in 0..<4 where !(bar == 5 && i == 3) && !(last && i > 0) {
      add(.drums, b + Double(i), kick, 0.5, i == 0 ? 112 : 100)
    }
    if !last {
      for i in [1, 3] where !(bar == 5 && i == 3) {
        add(.drums, b + Double(i), clap, 0.5, 90)
        add(.drums, b + Double(i), snare, 0.5, 52)
      }
      for i in 0..<8 where !(bar == 5 && i >= 6) {
        add(.drums, b + Double(i) * 0.5, i % 2 == 1 ? (i == 7 ? openHat : hat) : hat, 0.25, i % 2 == 1 ? 74 : 54)
        if groove || build { add(.drums, b + Double(i) * 0.5 + 0.25, tamb, 0.2, 30) }
      }
    }
  }

  // the build: a reverse cymbal swelling into the cut, and a snare roll over the last bar
  if bar == 4 { add(.riser, b + 2.2, C4, 5.8, 96) }
  if bar == 5 {
    for i in 0..<12 { add(.drums, b + Double(i) * 0.25, snare, 0.2, 50 + i * 5) }
  }
}

// ---- render ------------------------------------------------------------------------------------

let bank = URL(fileURLWithPath: "/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls")
let engine = AVAudioEngine()
let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)

let reverb = AVAudioUnitReverb()
reverb.loadFactoryPreset(.mediumHall)
reverb.wetDryMix = 22
engine.attach(reverb)
engine.connect(reverb, to: engine.mainMixerNode, format: format)
// the reverb takes one input: the instruments meet in a mixer first
let band = AVAudioMixerNode()
engine.attach(band)
engine.connect(band, to: reverb, format: format)

var samplers: [AVAudioUnitSampler] = []
for part in Part.allCases {
  let s = AVAudioUnitSampler()
  engine.attach(s)
  engine.connect(s, to: band, format: format)
  let (program, percussion) = part.program
  try s.loadSoundBankInstrument(
    at: bank, program: program,
    bankMSB: UInt8(percussion ? kAUSampler_DefaultPercussionBankMSB : kAUSampler_DefaultMelodicBankMSB),
    bankLSB: UInt8(kAUSampler_DefaultBankLSB))
  s.volume = part.gain
  samplers.append(s)
}
// the notes go on sequencer tracks, one per instrument, so they're timed in the render's samples
let sequencer = AVAudioSequencer(audioEngine: engine)
let tempo = AVExtendedTempoEvent(tempo: bpm)
sequencer.tempoTrack.addEvent(tempo, at: 0)
let tracks = samplers.map { sampler -> AVMusicTrack in
  let track = sequencer.createAndAppendTrack()
  track.destinationAudioUnit = sampler
  return track
}
for n in notes {
  tracks[n.part].addEvent(AVMIDINoteEvent(channel: 0, key: UInt32(n.key), velocity: UInt32(n.velocity), duration: n.length), at: n.at)
}

try engine.start()
sequencer.prepareToPlay()
try sequencer.start()

let total = Double(bars * 4) * beat + tail
let out = try AVAudioFile(
  forWriting: URL(fileURLWithPath: CommandLine.arguments[1]),
  settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 24,
    AVLinearPCMIsFloatKey: false],
  commonFormat: .pcmFormatFloat32, interleaved: false)
let block: AVAudioFrameCount = 1024
let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: block)!
var frame: AVAudioFramePosition = 0
while Double(frame) / rate < total {
  let status = try engine.renderOffline(block, to: buffer)
  guard status == .success else { fatalError("render: \(status.rawValue)") }
  try out.write(from: buffer)
  frame += AVAudioFramePosition(block)
}
print(String(format: "✓ %@ — %.2fs, %d bars at %.0f BPM", CommandLine.arguments[1], total, bars, bpm))
