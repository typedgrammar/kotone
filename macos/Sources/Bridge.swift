// JS → native calls: `await webkit.messageHandlers.kotone.postMessage({ method, params })`.
// Mirrors the Bridge interface in web/src/bridge.ts.

import AppKit
import WebKit

final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
  private unowned let app: AppDelegate

  init(app: AppDelegate) { self.app = app }

  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler reply: @escaping (Any?, String?) -> Void
  ) {
    guard let body = message.body as? [String: Any], let method = body["method"] as? String else {
      return reply(nil, "malformed bridge message")
    }
    let p = body["params"] as? [String: Any] ?? [:]
    let ok = { reply(true, nil) }
    switch method {
    case "library.list":
      reply(app.library.list(), nil)
    case "library.import":
      app.importSong { reply($0 ?? NSNull(), nil) }
    case "library.save":
      do {
        reply(try app.library.saveSong(json: p["json"] as? String ?? "", overwrite: p["overwrite"] as? Bool ?? false), nil)
      } catch { reply(nil, error.localizedDescription) }
    case "library.saveCover":
      do {
        try app.library.saveCover(id: p["id"] as? String ?? "", base64: p["base64"] as? String ?? "", type: p["type"] as? String ?? "")
        ok()
      } catch { reply(nil, error.localizedDescription) }
    case "net.fetch":
      Net.fetch(p, done: reply)
    case "agent.start":
      do {
        try app.agent.start(path: p["path"] as? String ?? "")
        ok()
      } catch { reply(nil, L("无法启动 codex：", "Couldn't start codex: ") + error.localizedDescription) }
    case "agent.probe":
      Agent.probe(path: p["path"] as? String ?? "") { reply($0, nil) }
    case "agent.send":
      app.agent.send(p["line"] as? String ?? "")
      ok()
    case "agent.stop":
      app.agent.stop()
      ok()
    case "app.setLanguage":
      app.setLanguage(p["lang"] as? String ?? "")
      ok()
    case "app.openURL":
      if let s = p["url"] as? String, let url = URL(string: s), url.scheme == "https" { NSWorkspace.shared.open(url) }
      ok()
    case "library.reveal":
      NSWorkspace.shared.activateFileViewerSelecting([app.library.songsDir])
      ok()
    case "favorites.load":
      reply(app.library.loadFavorites() ?? NSNull(), nil)
    case "favorites.save":
      app.library.saveFavorites(p["json"] as? String ?? "")
      ok()
    case "audio.pick":
      app.pickAudio(songId: p["songId"] as? String ?? "") { reply($0 ?? NSNull(), nil) }
    case "spotify.refresh":
      app.spotify.refresh()
      ok()
    case "spotify.toggle":
      app.spotify.toggle()
      ok()
    case "spotify.pause":
      app.spotify.pause()
      ok()
    case "spotify.seek":
      app.spotify.seek(to: (p["time"] as? NSNumber)?.doubleValue ?? 0)
      ok()
    case "spotify.play":
      app.spotify.play(uri: p["uri"] as? String, at: (p["at"] as? NSNumber)?.doubleValue)
      ok()
    case "spotify.search":
      app.spotifySearch.search(p["query"] as? String ?? "") { reply($0 ?? NSNull(), $1) }
    case "library.linkSpotify":
      app.library.linkSpotify(songId: p["songId"] as? String ?? "", uri: p["uri"] as? String ?? "")
      ok()
    case "player.load":
      app.player.load(path: p["path"] as? String ?? "", title: p["title"] as? String ?? "", artist: p["artist"] as? String ?? "")
      ok()
    case "player.play":
      app.player.play()
      ok()
    case "player.pause":
      app.player.pause()
      ok()
    case "player.seek":
      app.player.seek(to: (p["time"] as? NSNumber)?.doubleValue ?? 0)
      ok()
    default:
      reply(nil, "unknown method \(method)")
    }
  }
}
