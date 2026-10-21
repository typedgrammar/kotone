// Act 2: inside one line of 優しい彗星 (annotated by Codex in act 1) while it plays. The Japanese
// and Chinese matched phrase by phrase, a phrase's words, how its verbs conjugate, then its
// grammar point in the outline. Times are seconds into the song.

act(async () => {
  const { app } = kotone;
  app.setSettings({ lang: "zh" });
  const song = app.songs().find((s) => s.title === "優しい彗星");
  app.openSong(song.id);
  app.setView("lyrics");
  await waitFor(() => $("#line-L37"), 10000, "lyrics");
  showCursor(innerWidth - 120, innerHeight - 140);

  await app.seek(176, true);
  await atSong(184);
  mark("start");

  // L37 (sung from 187.8): four phrases, two conjugated verbs, one grammar point
  await atSong(186.2);
  await click($("#line-L37 [data-line-row]"), { fx: 0.3 });
  mark("panel");
  const chunk = (i) => $(`[data-panel] section [data-chunk="${i}"]`);
  await sleep(700);
  for (const i of [0, 1, 2, 3]) {
    await hover(chunk(i));
    await sleep(650);
  }
  unhover();

  const verb = (i) => $(".cursor-pointer", chunk(i));
  await click(verb(2));
  mark("word");
  await sleep(2600);
  showKeys("→");
  key("ArrowRight");
  await sleep(900);
  await click(verb(3));
  await sleep(2400);

  // the grammar point (は) sits inside the first phrase: its tab, the role label under it
  await click($(":scope > span:last-child", chunk(0)));
  mark("grammar");
  await sleep(600);
  // the grammar rows are the list items with an outline link
  const point = await waitFor(() => $$("[data-panel] li").find((li) => $("button", li)), 3000, "grammar point");
  await hover(point);
  await sleep(1300);
  await click($("button", point));
  mark("outline");
  await sleep(2600);
  mark("end");
  await pauseMusic();
  restoreSettings();
});
