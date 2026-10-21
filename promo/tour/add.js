// Adding 優しい彗星, briskly: ⌘N, the search, the original (not one of its covers), Add. The
// edit cuts out the waits for the network. No annotating here: that's promo/tour/annotate.js.

act(async () => {
  const { app } = kotone;
  app.setSettings({ lang: "zh" });
  app.openSong("yoru-ni-kakeru");
  app.setView("lyrics");
  await waitFor(() => $("#line-L17"), 10000, "lyrics");
  showCursor(innerWidth * 0.55, innerHeight * 0.45);
  await sleep(1500);

  mark("add");
  showKeys("⌘", "N");
  app.addSong();
  const input = await waitFor(() => $('input[placeholder="歌名、歌手"]'), 5000, "search box");
  await sleep(200);
  await type(input, "優しい彗星 YOASOBI", 60);
  mark("typed");
  showKeys("↩");
  input.form.requestSubmit();
  // the original, not one of the many covers: exactly that title, by YOASOBI alone
  const hit = await waitFor(
    () =>
      $$("nav button").find((b) => {
        const [title, by] = $$("span span", b).map((s) => s.textContent.trim());
        return title === "優しい彗星" && /^YOASOBI ·/.test(by);
      }),
    20000,
    "search results",
  );
  mark("results");
  await click(hit, { fx: 0.35, ms: 380 });
  mark("picked");
  const add = await waitFor(() => (byText("加入资料库")?.disabled === false ? byText("加入资料库") : null), 20000, "lyrics match");
  mark("matched");
  await sleep(300);
  await click(add, { ms: 420 });
  await waitFor(() => app.view() === "lyrics" && app.current()?.song?.title === "優しい彗星", 20000, "new song");
  mark("added");
  await sleep(300);
  await moveTo(byText("标注整首歌"), 450);
  await sleep(900);
  mark("end");
});
