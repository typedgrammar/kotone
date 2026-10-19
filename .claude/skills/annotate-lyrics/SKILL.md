---
name: annotate-lyrics
description: Annotate Japanese song lyrics for the Kotone player (furigana, Chinese translation, sentence structure ↔ translation mapping, conjugation derivations, grammar points) using the kotone CLI. Use when asked to annotate, prepare or fix a song for Kotone, or when given an LRC/lyrics file to turn into a song.json.
---

# Annotate lyrics for Kotone

The reader is a Chinese-speaking learner around JLPT N5–N4 who wants to *understand* the songs they love. Every annotation is re-derived by `kotone check`, so the checker — not your confidence — decides when a line is done.

## Steps

1. Read the full spec first: `node cli/kotone.ts spec` (format, tokenization rules, `steps`, grammar ids, writing style). Don't skip the appendices.
2. Create the skeleton if there isn't one, from the user's lyrics file or from a download:
   `node cli/kotone.ts init <lyrics.lrc> --id <slug> --title <曲名> --artist <歌手> --reuse songs/*/song.json`
   `node cli/kotone.ts lyrics <曲名> <歌手>` lists lyric refs; `init <ref> --id <slug> --reuse …` downloads the original lyrics with timing; `zh` starts empty.
   (`--reuse` copies already-annotated identical lines.) Songs downloaded in the app are already in the library: pass their id instead of a path to `status`/`check`/`prompt`.
3. `node cli/kotone.ts status <file>` to see pending lines. Annotate a few lines at a time by editing the JSON: `zh`, `tokens`, `chunks`, `grammar`, `note`. Never change `id`, `time` or `ja`.
4. After each batch run `node cli/kotone.ts check <file>` and fix every ✗. Treat ⚠ as real issues unless there's a reason not to.
   - Unsure about a form: `node cli/kotone.ts conj 奪う:うばう godan Passive Ta`
   - Looking for a grammar id: `node cli/kotone.ts grammar <关键词>`
   - Unsure how furigana splits: `node cli/kotone.ts ruby 初めて はじめて`
5. Never game the checker: don't relabel an inflected verb as a noun, drop a token's lemma, or change the class to make a derivation pass. If a form genuinely can't be expressed, keep the true class and explain in `note`, then tell the user.
6. When the file has 0 errors: `node cli/kotone.ts add <file> [--audio <file>]` imports it into the app's library.

## Content rules worth repeating

- Lyrics are copyrighted: work from the user's file or a download the user asked for, and keep them in the song file and the local library. Don't paste full lyrics into chat, commits or anything outside the library.
- Every `zh` is your own translation, in natural Chinese that keeps the Japanese imagery and order where possible. Never copy, adapt or look up a translation from a lyrics platform, website or any other existing source.
- Notes explain *this* line (cross-line subjects, omissions, inversions, ambiguity), in ≤ 60 Chinese characters each, and point at the matching part of the translation.
