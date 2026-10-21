// 夜に駆ける's chorus with the lyrics following along: furigana off and on, a line's breakdown
// (saved, stepped on), closed again. Every click lands on a beat: 130 BPM, the chorus's first
// downbeat at 75.11 s (measured with promo/beats.mjs).

const YORU = { bpm: 130, at: 75.113 };

act(async () => {
  const { app } = kotone;
  app.setSettings({ lang: "zh" });
  app.openSong("yoru-ni-kakeru");
  app.setView("lyrics");
  await waitFor(() => $("#line-L17"), 10000, "lyrics");
  const song = app.current().song;
  if (app.isFav(song.id, "L17")) app.toggleFav(song, song.lines.find((l) => l.id === "L17"));
  showCursor(innerWidth * 0.62, innerHeight * 0.58);
  const b = beats(YORU);

  await app.seek(66, true);
  await atSong(b(-8));
  mark("start");

  const furigana = byText("注音");
  await clickOn(b(4), furigana);
  await clickOn(b(6), furigana, { ms: 200 });
  await clickOn(b(8), () => $("#line-L17 [data-line-row]"), { fx: 0.3, ms: 260 });
  mark("panel");
  await clickOn(b(10), () => $('[data-panel] button[title="收藏这句"]'), { ms: 300 });
  await keyOn(b(12), "j", "J");
  const head = $("header").getBoundingClientRect();
  await clickAtOn(b(16), head.left + head.width * 0.42, head.top + head.height * 0.45, 380);
  mark("closed");

  // the music runs on under what the edit puts after this
  await atSong(b(40));
  mark("end");
  await pauseMusic();
});
