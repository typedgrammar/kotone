// On-disk library shared with the CLI (`kotone add`):
//   ~/Library/Application Support/Kotone/songs/<id>/song.json
//   ~/Library/Application Support/Kotone/songs/<id>/cover.jpg|png   (found with the lyrics)
//   ~/Library/Application Support/Kotone/favorites.json
//   ~/Library/Application Support/Kotone/state.json   { "audio": { "<song id>": "/path/to/file" },
//                                                       "spotify": { "<song id>": "spotify:track:…" } }

import Foundation

final class Library {
  let root: URL
  var songsDir: URL { root.appendingPathComponent("songs") }
  private var stateFile: URL { root.appendingPathComponent("state.json") }
  private var favoritesFile: URL { root.appendingPathComponent("favorites.json") }
  private let fm = FileManager.default

  init() {
    if let home = ProcessInfo.processInfo.environment["KOTONE_HOME"] {
      root = URL(fileURLWithPath: home)
    } else {
      let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      root = support.appendingPathComponent("Kotone")
      // the library of the app's former name (Utayomi) moves over once
      let legacy = support.appendingPathComponent("Utayomi")
      if !fm.fileExists(atPath: root.path), fm.fileExists(atPath: legacy.path) { try? fm.moveItem(at: legacy, to: root) }
    }
    try? fm.createDirectory(at: songsDir, withIntermediateDirectories: true)
  }

  /// `{ songs: [{ id, json, audio }], links: { id: path }, covers: { id: version }, spotify: { id: uri } }`
  /// — everything but `songs` includes bundled demo songs, whose folder may hold nothing but a cover.
  func list() -> [String: Any] {
    let links = audioLinks()
    let ids = (try? fm.contentsOfDirectory(atPath: songsDir.path))?.sorted() ?? []
    let songs: [[String: Any]] = ids.compactMap { id in
      let dir = songsDir.appendingPathComponent(id)
      guard let data = fm.contents(atPath: dir.appendingPathComponent("song.json").path),
        let json = String(data: data, encoding: .utf8)
      else { return nil }
      var audio: Any = NSNull()
      if let declared = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        let path = declared["audio"] as? String
      {
        let resolved = path.hasPrefix("/") ? path : dir.appendingPathComponent(path).path
        if fm.fileExists(atPath: resolved) { audio = resolved }
      }
      if audio is NSNull, let linked = links[id] { audio = linked }
      return ["id": id, "json": json, "audio": audio]
    }
    var covers: [String: Int] = [:]
    for id in ids {
      if let file = coverFile(id), let date = (try? fm.attributesOfItem(atPath: file.path))?[.modificationDate] as? Date {
        covers[id] = Int(date.timeIntervalSince1970)
      }
    }
    return ["songs": songs, "links": links, "covers": covers, "spotify": readState()["spotify"] as? [String: String] ?? [:]]
  }

  func coverFile(_ id: String) -> URL? {
    guard id.range(of: "^[a-z0-9][a-z0-9-]*$", options: .regularExpression) != nil else { return nil }
    return ["jpg", "png"].map { songsDir.appendingPathComponent(id).appendingPathComponent("cover.\($0)") }
      .first { fm.fileExists(atPath: $0.path) }
  }

  func saveCover(id: String, base64: String, type: String) throws {
    guard id.range(of: "^[a-z0-9][a-z0-9-]*$", options: .regularExpression) != nil, ["jpg", "png"].contains(type),
      let data = Data(base64Encoded: base64)
    else { throw failure(L("封面数据无效", "Invalid cover data")) }
    let dir = songsDir.appendingPathComponent(id)
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    for ext in ["jpg", "png"] { try? fm.removeItem(at: dir.appendingPathComponent("cover.\(ext)")) }
    try data.write(to: dir.appendingPathComponent("cover.\(type)"), options: .atomic)
  }

  func linkAudio(songId: String, path: String) { setLink("audio", songId, path) }

  /// The Spotify track a song plays as, remembered once it has been heard there.
  func linkSpotify(songId: String, uri: String) { setLink("spotify", songId, uri) }

  private func setLink(_ kind: String, _ songId: String, _ value: String) {
    var state = readState()
    var links = state[kind] as? [String: String] ?? [:]
    links[songId] = value
    state[kind] = links
    if let data = try? JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted, .sortedKeys]) {
      try? data.write(to: stateFile, options: .atomic)
    }
  }

  func importSong(from url: URL) throws -> String {
    let data = try Data(contentsOf: url)
    let id = try songId(data)
    let dir = songsDir.appendingPathComponent(id)
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    try data.write(to: dir.appendingPathComponent("song.json"), options: .atomic)
    return id
  }

  /// A song made in the app from downloaded lyrics. Replacing one keeps the old file as song.json.bak.
  func saveSong(json: String, overwrite: Bool) throws -> String {
    let data = Data(json.utf8)
    let id = try songId(data)
    let dir = songsDir.appendingPathComponent(id)
    let file = dir.appendingPathComponent("song.json")
    if fm.fileExists(atPath: file.path) {
      guard overwrite else { throw failure(L("资料库里已经有 id 为 \(id) 的歌", "The library already has a song with the id \(id)")) }
      let backup = dir.appendingPathComponent("song.json.bak")
      try? fm.removeItem(at: backup)
      try fm.copyItem(at: file, to: backup)
    }
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    try data.write(to: file, options: .atomic)
    return id
  }

  private func songId(_ data: Data) throws -> String {
    guard let song = try JSONSerialization.jsonObject(with: data) as? [String: Any], let id = song["id"] as? String,
      id.range(of: "^[a-z0-9][a-z0-9-]*$", options: .regularExpression) != nil
    else { throw failure(L("这不是有效的 Kotone song.json（缺少 id）", "This isn't a valid Kotone song.json (no id)")) }
    return id
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "Kotone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  func loadFavorites() -> String? {
    fm.contents(atPath: favoritesFile.path).flatMap { String(data: $0, encoding: .utf8) }
  }

  func saveFavorites(_ json: String) {
    try? json.data(using: .utf8)?.write(to: favoritesFile, options: .atomic)
  }

  private func readState() -> [String: Any] {
    guard let data = fm.contents(atPath: stateFile.path) else { return [:] }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
  }

  private func audioLinks() -> [String: String] {
    (readState()["audio"] as? [String: String] ?? [:]).filter { fm.fileExists(atPath: $0.value) }
  }
}
