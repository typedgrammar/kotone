# Promo video

Two cuts of a ~38 s video of the real app with the real music:

- **yoasobi**: YOASOBI throughout.
  1. 夜に駆ける's chorus playing with its lyrics.
  2. 優しい彗星 added from one search and annotated by Codex, while the chorus runs on.
  3. One line of 優しい彗星 opened in the breakdown panel, to its own music: phrases matched
     across the Japanese and the Chinese, words and how the verbs conjugate, and a grammar point
     in the outline.
- **bgm**: Kotone's own music under the title, adding the song and Codex. It drops into
  夜に駆ける's chorus on the downbeat, then 優しい彗星 for the breakdown, and comes back for the
  end card.

The tours click on the beat and the edit cuts on it: 130 BPM for 夜に駆ける and the BGM, 90 for
優しい彗星, measured from the recordings with `promo/beats.mjs`. Nothing is mocked: a script
drives the live app while its window and Spotify's sound are recorded, and ffmpeg cuts the takes
together. The BGM (`promo/bgm.swift`) is composed in code and played through macOS's General MIDI
sound bank, so it's ours to use.

```sh
./macos/build.sh
promo/record.sh annotate  # adds 優しい彗星 and has Codex annotate it (~1 min + Codex's run)
promo/record.sh add       # adding it again, briskly, in a throwaway library (~20 s)
promo/record.sh chorus    # 夜に駆ける's chorus (~30 s)
promo/record.sh detail    # one line of 優しい彗星 taken apart (~25 s)
node promo/make.mjs       # → promo/out/kotone-promo-{yoasobi,bgm}.mp4
```

## What it needs

- Spotify, signed in. The music plays out loud while recording.
- Codex, signed in. The annotate act really annotates a song, which uses your quota.
- The Screen Recording permission for the terminal that runs `record.sh`.
- 夜に駆ける, annotated, in your library (`~/Library/Application Support/Kotone`). The annotate
  and add acts copy it into libraries of their own under `promo/out/`. Your library isn't touched.
- An unlocked screen for the whole take. A locked screen stops the window from drawing.
  `record.sh` keeps the display awake while it runs. The window floats above the others, on
  every Space, during a take: a covered page has its timers throttled and the clicks fall off
  the beat.

## How it fits together

- `tour/lib.js` and `tour/{annotate,add,chorus,detail}.js` are the scripts that drive each act.
  They are passed to the app with `Kotone --tour`, which also exposes `window.kotone` (the app's
  state).
  - Steps are timed against the song's position, on its beats.
  - A drawn cursor moves to whatever is clicked, since a window recording has no pointer.
  - Each step prints a `MARK`.
- `record.swift` uses ScreenCaptureKit to record Kotone's window (`window.mov`, plus
  `window.png` for the corner mask) and Spotify's audio (`audio.wav`). It prints when each
  file starts so the marks line up.
- `card.swift` renders HTML to PNG: the title and end cards, the backdrop and the captions.
- `beats.mjs` measures a recorded song's tempo and beat; `bgm.swift` renders the BGM.
- `make.mjs` cuts the takes by their marks, each clip fitted to whole beats:
  - Codex's run is sped up and labelled with how much.
  - The window is masked and placed on the backdrop.
  - The music stays in sync wherever lyrics are on screen.
  - macOS shows a sharing badge in place of the traffic lights while a window is captured. The
    edit paints it out and draws the lights back.

The app's settings live in the page's storage, which the recording shares with your everyday
Kotone. `record.sh` quits the everyday app during a take, and the detail act puts your settings back
at the end.

`promo/out/` (recordings, the library copy, the video) is git-ignored. It holds the songs' audio
and lyrics, so it stays local. Think about the music's rights before publishing the video.
