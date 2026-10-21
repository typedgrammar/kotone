// The README's screenshots (promo/shots.sh), of the bundled demo excerpt only. Light: a word's
// conjugation in the breakdown, and the grammar outline; dark: a line's phrases matched across the
// Japanese and the Chinese. No drawn cursor; "shot-<name>" marks when to take each.

act(async () => {
  const { app } = kotone;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  app.setSettings({ lang: "zh", scope: "all", furigana: true, translation: true });
  app.openSong("yoru-ni-kakeru");
  app.setView("lyrics");
  await waitFor(() => $("#line-L06"), 10000, "lyrics");
  const song = app.current().song;
  for (const id of ["L03", "L06"]) if (!app.isFav(song.id, id)) app.toggleFav(song, song.lines.find((l) => l.id === id));
  post({ window: true });
  const shot = async (name) => {
    await sleep(1200);
    mark(`shot-${name}`);
    await sleep(2500);
  };
  const chunk = (i) => $(`[data-panel] section [data-chunk="${i}"]`);

  if (dark) {
    // 初めて会った日から, its second phrase lit up in both languages
    await click($("#line-L03 [data-line-row]"), { fx: 0.3, ms: 1 });
    await waitFor(() => chunk(1), 3000, "panel");
    await hover(chunk(1), 1);
    await shot("breakdown-dark");
    return;
  }
  // 沈むように溶けてゆくように: 溶けて, picked, with how it's made from 溶ける
  await click($("#line-L01 [data-line-row]"), { fx: 0.3, ms: 1 });
  await waitFor(() => chunk(2), 3000, "panel");
  await click($(".cursor-pointer", chunk(2)), { ms: 1 });
  await shot("breakdown");
  app.setExpanded(null);
  app.openGrammar("relative-clause");
  await shot("grammar-outline");
});
