# Promo video

A ~57 s video of the real app with the real music:

1. YOASOBI's 夜に駆ける playing with its lyrics.
2. 優しい彗星 added from one search and annotated by Codex.
3. One line of 優しい彗星 opened in the breakdown panel: phrases matched across the Japanese and
   the Chinese, words and how the verbs conjugate, and a grammar point in the outline.

Nothing is mocked: a script drives the live app while its window and Spotify's sound are
recorded, and ffmpeg cuts the takes together.

```sh
./macos/build.sh
promo/record.sh zh     # act 1: ~1 min plus however long Codex takes to annotate 42 lines
promo/record.sh detail # act 2: ~35 s
node promo/make.mjs    # → promo/out/kotone-promo.mp4
```

## What it needs

- Spotify, signed in. The music plays out loud while recording.
- Codex, signed in. Act 1 really annotates a song, which uses your quota.
- The Screen Recording permission for the terminal that runs `record.sh`.
- 夜に駆ける, annotated, in your library (`~/Library/Application Support/Kotone`). Act 1 copies
  it into a library of its own, `promo/out/home`. Your library isn't touched.
- An unlocked screen for the whole take. A locked screen stops the window from drawing.
  `record.sh` keeps the display awake while it runs.

## How it fits together

- `tour/lib.js` and `tour/{zh,detail}.js` are the scripts that drive each act. They are passed to
  the app with `Kotone --tour`, which also exposes `window.kotone` (the app's state).
  - Steps are timed against the song's position.
  - A drawn cursor moves to whatever is clicked, since a window recording has no pointer.
  - Each step prints a `MARK`.
- `record.swift` uses ScreenCaptureKit to record Kotone's window (`window.mov`, plus
  `window.png` for the corner mask) and Spotify's audio (`audio.wav`). It prints when each
  file starts so the marks line up.
- `card.swift` renders HTML to PNG: the title and end cards, the backdrop and the captions.
- `make.mjs` cuts the takes by their marks:
  - Codex's run is sped up and labelled with how much.
  - The window is masked and placed on the backdrop.
  - The music stays in sync wherever lyrics are on screen.
  - macOS shows a sharing badge in place of the traffic lights while a window is captured. The
    edit paints it out and draws the lights back.

The app's settings live in the page's storage, which the recording shares with your everyday
Kotone. `record.sh` quits the everyday app during a take, and act 2 puts your settings back
at the end.

`promo/out/` (recordings, the library copy, the video) is git-ignored. It holds the songs' audio
and lyrics, so it stays local. Think about the music's rights before publishing the video.
