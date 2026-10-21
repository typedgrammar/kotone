// Act 1, in Chinese: 夜に駆ける's chorus with the lyrics following along, furigana off and on,
// one line's breakdown (saved, stepped, closed), then adding 優しい彗星 from one search and
// having Codex annotate it. Times are seconds into the song.

act(async () => {
  const { app, agent } = kotone;
  app.setSettings({ lang: "zh" });
  app.openSong("yoru-ni-kakeru");
  app.setView("lyrics");
  await waitFor(() => $("#line-L16"), 10000, "lyrics");
  showCursor(innerWidth - 120, innerHeight - 140);

  await app.seek(62, true);
  await atSong(70);
  mark("start");

  await atSong(76.4);
  await click(byText("注音"));
  await atSong(78.6);
  await click(byText("注音"));

  await atSong(80.4);
  await click($("#line-L17 [data-line-row]"), { fx: 0.3 });
  mark("panel");
  await atSong(83.6);
  await click($('[data-panel] button[title="收藏这句"]'));
  await atSong(85.6);
  await click($('[data-panel] button[title="下一行（j）"]'));
  await atSong(88.0);
  // empty space in the header, left of the panel
  const head = $("header").getBoundingClientRect();
  await clickAt(head.left + head.width * 0.42, head.top + head.height * 0.45);
  mark("closed");

  await atSong(89.4);
  await moveTo({ x: innerWidth * 0.5, y: innerHeight * 0.42 }, 500);
  showKeys("⌘", "N");
  app.addSong();
  mark("add");
  const input = await waitFor(() => $('input[placeholder="歌名、歌手"]'), 5000, "search box");
  await sleep(500);
  await type(input, "優しい彗星 YOASOBI");
  await sleep(250);
  showKeys("↩");
  input.form.requestSubmit();
  const hit = await waitFor(
    // the original, not one of the many covers: exactly that title, by YOASOBI alone
    () => $$("nav button").find((b) => {
      const [title, by] = $$("span span", b).map((s) => s.textContent.trim());
      return title === "優しい彗星" && /^YOASOBI ·/.test(by);
    }),
    20000,
    "search results",
  );
  mark("results");
  await sleep(700);
  await click(hit, { fx: 0.35 });
  const add = await waitFor(() => (byText("加入资料库")?.disabled === false ? byText("加入资料库") : null), 20000, "lyrics match");
  mark("matched");
  await sleep(1400);
  await click(add);
  const song = await waitFor(() => app.view() === "lyrics" && app.current()?.song?.title === "優しい彗星" && app.current().song, 20000, "new song");
  mark("added");
  await sleep(1300);

  await click(byText("标注整首歌"));
  mark("annotate");
  await waitFor(() => agent.state.status === "working", 30000, "codex start");
  await waitFor(() => agent.state.status !== "working", 15 * 60000, "codex finish");
  const done = app.current().song.lines.filter((l) => l.tokens?.length).length;
  log(`annotated ${done}/${song.lines.length} ${agent.state.error ? JSON.stringify(agent.state.error) : ""}`);
  mark("annotated");
  await sleep(2500);
  mark("end");
  await pauseMusic();
});
