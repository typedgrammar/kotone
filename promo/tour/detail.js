// Inside one line of 優しい彗星 (annotated by Codex in promo/tour/annotate.js) while it plays: the
// Japanese and Chinese matched phrase by phrase, a phrase's words and how its verbs conjugate,
// then its grammar point in the outline. On the beat: 90 BPM, a bar at 186.9 s (promo/beats.mjs).

const SUISEI = { bpm: 90, at: 186.897 };

act(async () => {
  const { app } = kotone;
  app.setSettings({ lang: "zh" });
  const song = app.songs().find((s) => s.title === "優しい彗星");
  app.openSong(song.id);
  app.setView("lyrics");
  await waitFor(() => $("#line-L37"), 10000, "lyrics");
  showCursor(innerWidth * 0.5, innerHeight * 0.62);
  const s = beats(SUISEI);

  await app.seek(178, true);
  await atSong(s(-3));
  mark("start");

  // L37 (sung from 187.8): four phrases, two conjugated verbs, one grammar point
  await clickOn(s(0), () => $("#line-L37 [data-line-row]"), { fx: 0.3, ms: 420 });
  mark("panel");
  const chunk = (i) => $(`[data-panel] section [data-chunk="${i}"]`);
  for (const i of [0, 1, 2, 3]) await hoverOn(s(2 + i), () => chunk(i), i ? 260 : 400);
  unhover();

  const verb = (i) => $(".cursor-pointer", chunk(i));
  await clickOn(s(6), () => verb(2), { ms: 300 });
  mark("word");
  await keyOn(s(9), "ArrowRight", "→");
  await clickOn(s(10), () => verb(3), { ms: 320 });

  // the grammar point (は) sits inside the first phrase: its tab, the role label under it
  await clickOn(s(12), () => $(":scope > span:last-child", chunk(0)), { ms: 360 });
  mark("grammar");
  // the grammar rows are the list items with an outline link
  const point = () => $$("[data-panel] li").find((li) => $("button", li));
  await hoverOn(s(13), point, 380);
  await clickOn(s(15), () => $("button", point()), { ms: 380 });
  mark("outline");
  await atSong(s(19));
  mark("end");
  await pauseMusic();
  restoreSettings();
});
