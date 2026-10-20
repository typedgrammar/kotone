// The Spotify desktop app as the player, the way LyricsX / SpotMenu drive it: state changes come in
// as Spotify's distributed notification (com.spotify.client.PlaybackStateChanged), the position is
// re-read over AppleScript every couple of seconds so lyric timing can't drift, and commands go back
// over AppleScript — none of which brings Spotify forward. State is only read while Spotify runs
// (scripting it would launch it); an explicit play starts it hidden. Tracks are found with
// SpotifySearch. Pushed to the page as { type: "spotify", … }.

import AppKit

final class Spotify {
  static let bundleId = "com.spotify.client"
  private let emit: ([String: Any]) -> Void
  // AppleScript calls block until Spotify answers; keep them off the main thread and in order
  private let queue = DispatchQueue(label: "kotone.spotify")
  private var timer: Timer?
  // after Kotone starts Spotify, it puts its own window forward once its UI loads; for a while
  // that gets hidden again and the app that was in front gets focus back
  private var guardUntil = Date.distantPast
  private var restoreTo: NSRunningApplication?
  // a track Kotone plays stops at its end, back at 0:00, instead of running on into whatever
  // Spotify has queued next (tracks the user plays in Spotify itself are left alone)
  private var owned: String?
  private var current: String?
  private var stopAtEnd: DispatchWorkItem?

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
    DistributedNotificationCenter.default().addObserver(
      forName: Notification.Name("com.spotify.client.PlaybackStateChanged"), object: nil, queue: .main
    ) { [weak self] _ in self?.refresh() }
    let ws = NSWorkspace.shared.notificationCenter
    for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
      ws.addObserver(forName: name, object: nil, queue: .main) { [weak self] n in
        let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        if app?.bundleIdentifier == Self.bundleId { self?.refresh() }
      }
    }
    ws.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] n in
      guard let self, Date() < self.guardUntil,
        let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, app.bundleIdentifier == Self.bundleId
      else { return }
      app.hide()
      self.restoreTo?.activate(options: [])
    }
    timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
      if self?.running == true { self?.refresh() }
    }
  }

  var installed: Bool { NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.bundleId) != nil }
  var running: Bool { !NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleId).isEmpty }

  /// Re-read the player and push it to the page.
  func refresh() {
    guard running else { return emit(["type": "spotify", "installed": installed, "running": false]) }
    queue.async { [weak self] in
      guard let self else { return }
      var out: [String: Any] = ["type": "spotify", "installed": true, "running": true]
      do {
        let r = try self.run(
          """
          tell application id "\(Self.bundleId)"
            set playerState to player state as text
            set playerPosition to player position
            if playerState is "stopped" then return {playerState, playerPosition, "", "", "", "", 0, ""}
            set t to current track
            return {playerState, playerPosition, id of t, name of t, artist of t, album of t, duration of t, artwork url of t}
          end tell
          """)
        func str(_ i: Int) -> String { r.atIndex(i)?.stringValue ?? "" }
        out["state"] = str(1)
        out["position"] = r.atIndex(2)?.doubleValue ?? 0
        out["trackId"] = str(3)
        out["name"] = str(4)
        out["artist"] = str(5)
        out["album"] = str(6)
        out["duration"] = Double(r.atIndex(7)?.int32Value ?? 0) / 1000
        out["artwork"] = str(8)
      } catch {
        out["error"] = (error as NSError).code == -1743 ? "spotify.err.permission" : error.localizedDescription
      }
      DispatchQueue.main.async {
        self.watchEnd(out)
        self.emit(out)
      }
    }
  }

  /// Re-armed on every read (at least every 1.5s), so the timer always runs from a fresh position.
  private func watchEnd(_ s: [String: Any]) {
    current = s["trackId"] as? String
    stopAtEnd?.cancel()
    stopAtEnd = nil
    guard let id = current, id == owned, s["state"] as? String == "playing",
      let position = s["position"] as? Double, let duration = s["duration"] as? Double, duration > 0
    else { return }
    let left = duration - position
    guard left < 5 else { return }
    let stop = DispatchWorkItem { [weak self] in self?.command("pause\n  set player position to 0") }
    stopAtEnd = stop
    // a moment early: at the very end Spotify has already moved on
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, left - 0.35), execute: stop)
  }

  func toggle() {
    owned = current
    command("playpause")
  }
  func pause() { command("pause") }
  func seek(to seconds: Double) { command("set player position to \(seconds)") }

  /// Play a track (`spotify:track:…`), optionally from a position. Starts Spotify (hidden) if needed.
  func play(uri: String?, at seconds: Double?) {
    guard let uri, uri.range(of: "^spotify:track:[A-Za-z0-9]+$", options: .regularExpression) != nil else {
      owned = current
      return command("play")
    }
    owned = uri
    // a freshly started track needs a moment before it takes a position
    let from = seconds.map { "\n  delay 0.4\n  set player position to \($0)" } ?? ""
    whenRunning { self.command("play track \"\(uri)\"\(from)") }
  }

  /// Launch Spotify without activating or showing it, then wait until it answers scripts.
  private func whenRunning(_ then: @escaping () -> Void) {
    if running { return then() }
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.bundleId) else { return }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = false
    config.hides = true
    restoreTo = NSWorkspace.shared.frontmostApplication
    guardUntil = Date().addingTimeInterval(15)
    NSWorkspace.shared.openApplication(at: url, configuration: config) { [weak self] app, _ in
      DispatchQueue.main.async { app?.hide() }
      self?.queue.async {
        for _ in 0..<40 {
          if (try? self?.run("tell application id \"\(Self.bundleId)\" to player state")) != nil { break }
          Thread.sleep(forTimeInterval: 0.5)
        }
        DispatchQueue.main.async(execute: then)
      }
    }
  }

  private func command(_ body: String) {
    queue.async { [weak self] in
      guard let self else { return }
      let error = (try? self.run("tell application id \"\(Self.bundleId)\"\n  \(body)\nend tell")) == nil
      DispatchQueue.main.async {
        if error { self.emit(["type": "spotify", "installed": self.installed, "running": self.running, "error": "spotify.err.command"]) }
        self.refresh()
      }
    }
  }

  private func run(_ source: String) throws -> NSAppleEventDescriptor {
    var info: NSDictionary?
    guard let result = NSAppleScript(source: source)?.executeAndReturnError(&info) else {
      let code = info?[NSAppleScript.errorNumber] as? Int ?? 0
      throw NSError(domain: "Kotone.Spotify", code: code, userInfo: [NSLocalizedDescriptionKey: info?[NSAppleScript.errorMessage] as? String ?? "AppleScript"])
    }
    return result
  }
}
