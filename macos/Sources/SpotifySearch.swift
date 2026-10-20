// Finds Spotify tracks without a developer account and without showing anything: an offscreen web
// view loads open.spotify.com's own search page, whose scripts sign in anonymously and query
// Spotify's API; a script injected at document start reads the track list out of those responses.
// Nothing here is ever attached to a window, so Kotone keeps focus.

import WebKit

final class SpotifySearch: NSObject, WKScriptMessageHandler {
  typealias Done = ([[String: Any]]?, String?) -> Void
  private var web: WKWebView?
  private var waiting: [(query: String, done: Done)] = []
  private var current: (done: Done, timeout: DispatchWorkItem)?

  // wraps fetch: the first search response that lists tracks goes back as [{ uri, name, artists, duration, cover }]
  private static let hook = """
    (() => {
      const send = (list) => window.webkit.messageHandlers.spotifyTracks.postMessage(JSON.stringify(list));
      const find = (o) => {
        if (!o || typeof o !== "object") return null;
        if (o.tracksV2 && Array.isArray(o.tracksV2.items)) return o.tracksV2.items;
        for (const v of Object.values(o)) { const r = find(v); if (r) return r; }
        return null;
      };
      const fetch0 = window.fetch;
      window.fetch = async (...args) => {
        const res = await fetch0(...args);
        const url = String(args[0] && args[0].url ? args[0].url : args[0]);
        if (url.includes("pathfinder")) res.clone().json().then((j) => {
          const items = find(j);
          if (!items || !items.length) return;
          send(items.map((i) => (i.item && i.item.data) || i.data || i).filter((t) => t && t.uri).map((t) => ({
            uri: t.uri,
            name: t.name,
            artists: ((t.artists && t.artists.items) || []).map((a) => a.profile && a.profile.name).filter(Boolean),
            duration: t.duration ? t.duration.totalMilliseconds / 1000 : undefined,
            cover: (((t.albumOfTrack && t.albumOfTrack.coverArt && t.albumOfTrack.coverArt.sources) || []).slice().sort((a, b) => b.width - a.width)[0] || {}).url,
          })));
        }).catch(() => {});
        return res;
      };
    })();
    """

  func search(_ query: String, done: @escaping Done) {
    waiting.append((query, done))
    next()
  }

  private func next() {
    guard current == nil, !waiting.isEmpty else { return }
    let (query, done) = waiting.removeFirst()
    let q = query.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    guard let url = URL(string: "https://open.spotify.com/search/\(q)/tracks") else { return done(nil, "spotify.err.search") }
    let timeout = DispatchWorkItem { [weak self] in self?.finish(nil, "spotify.err.search") }
    current = (done, timeout)
    DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: timeout)
    webView().load(URLRequest(url: url))
  }

  private func webView() -> WKWebView {
    if let web { return web }
    let config = WKWebViewConfiguration()
    config.userContentController.addUserScript(WKUserScript(source: Self.hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    config.userContentController.add(self, name: "spotifyTracks")
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 900), configuration: config)
    web.customUserAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
    self.web = web
    return web
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard current != nil, let json = message.body as? String, let data = json.data(using: .utf8),
      let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
    else { return }
    finish(list, nil)
  }

  private func finish(_ list: [[String: Any]]?, _ error: String?) {
    guard let (done, timeout) = current else { return }
    timeout.cancel()
    current = nil
    // the page keeps polling and reporting in the background; park it
    web?.loadHTMLString("", baseURL: nil)
    done(list, error)
    next()
  }
}
