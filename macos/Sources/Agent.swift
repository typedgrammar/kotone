// Runs the user's own `codex app-server` for in-app annotation and relays its JSON-RPC lines to
// the page, where core/codex.ts speaks the protocol. A GUI app doesn't inherit the shell's PATH
// (nvm, Homebrew) or proxy variables, so those are read once from the user's login shell.

import Foundation

final class Agent {
  private var process: Process?
  private var input: FileHandle?
  private var pending = Data()
  private var stderrTail = ""
  private let emit: ([String: Any]) -> Void

  init(emit: @escaping ([String: Any]) -> Void) { self.emit = emit }

  var running: Bool { process?.isRunning == true }

  /// `path` is the user's override from settings; empty means look `codex` up on the shell PATH.
  func start(path: String) throws {
    if running { return }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    p.arguments = [Agent.command(path), "app-server"]
    p.environment = Agent.environment
    p.currentDirectoryURL = FileManager.default.temporaryDirectory
    let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
    p.standardInput = stdin
    p.standardOutput = stdout
    p.standardError = stderr
    stdout.fileHandleForReading.readabilityHandler = { [weak self] h in
      let data = h.availableData
      DispatchQueue.main.async { self?.receive(data) }
    }
    stderr.fileHandleForReading.readabilityHandler = { [weak self] h in
      let text = String(decoding: h.availableData, as: UTF8.self)
      DispatchQueue.main.async { if let self { self.stderrTail = String((self.stderrTail + text).suffix(2000)) } }
    }
    p.terminationHandler = { [weak self] p in
      DispatchQueue.main.async {
        guard let self else { return }
        self.emit(["type": "agentExit", "code": Int(p.terminationStatus), "stderr": self.stderrTail])
        self.process = nil
        self.input = nil
      }
    }
    pending = Data()
    stderrTail = ""
    try p.run()
    process = p
    input = stdin.fileHandleForWriting
  }

  func send(_ line: String) {
    input?.write(Data((line + "\n").utf8))
  }

  func stop() { process?.terminate() }

  private static func command(_ path: String) -> String {
    let p = path.trimmingCharacters(in: .whitespaces)
    return p.isEmpty ? ProcessInfo.processInfo.environment["KOTONE_CODEX"] ?? "codex" : (p as NSString).expandingTildeInPath
  }

  /// For the settings panel: where `codex` resolves to and what `codex --version` says.
  static func probe(path: String, done: @escaping ([String: Any]) -> Void) {
    DispatchQueue.global().async {
      let cmd = command(path)
      var resolved: String? = cmd.contains("/") ? cmd : nil
      if resolved == nil {
        for dir in (environment["PATH"] ?? "").split(separator: ":") {
          let candidate = "\(dir)/\(cmd)"
          if FileManager.default.isExecutableFile(atPath: candidate) {
            resolved = candidate
            break
          }
        }
      }
      var result: [String: Any] = ["path": resolved ?? NSNull()]
      guard let exe = resolved, FileManager.default.isExecutableFile(atPath: exe) else {
        result["error"] = cmd.contains("/") ? "agent.err.notExecutable" : "agent.err.notFoundPath" // message keys, worded by the page
        return DispatchQueue.main.async { done(result) }
      }
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      p.arguments = [exe, "--version"]
      p.environment = environment
      let out = Pipe()
      p.standardOutput = out
      p.standardError = out
      do {
        try p.run()
        let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        p.waitUntilExit()
        if p.terminationStatus == 0 { result["version"] = text.trimmingCharacters(in: .whitespacesAndNewlines) }
        else { result["error"] = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "\n").last.map(String.init) ?? "codex --version failed" }
      } catch { result["error"] = error.localizedDescription }
      DispatchQueue.main.async { done(result) }
    }
  }

  private func receive(_ data: Data) {
    pending.append(data)
    while let nl = pending.firstIndex(of: 0x0A) {
      let line = String(decoding: pending[pending.startIndex..<nl], as: UTF8.self)
      pending.removeSubrange(pending.startIndex...nl)
      if !line.isEmpty { emit(["type": "agent", "line": line]) }
    }
  }

  /// The app's environment plus PATH / proxy / Codex variables from the login shell. PATH entries
  /// of agent wrappers (Superset's `~/.superset/bin`) are dropped so the real binary runs.
  private static let environment: [String: String] = {
    var env = ProcessInfo.processInfo.environment
    let shell = env["SHELL"] ?? "/bin/zsh"
    let p = Process()
    p.executableURL = URL(fileURLWithPath: shell)
    p.arguments = ["-ilc", "printf '\\n__KOTONE_ENV__\\n'; env"]
    let out = Pipe()
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    p.standardInput = FileHandle.nullDevice
    guard (try? p.run()) != nil else { return env }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    let text = String(decoding: data, as: UTF8.self)
    guard let marker = text.range(of: "__KOTONE_ENV__\n") else { return env }
    let keep: Set<String> = [
      "PATH", "CODEX_HOME", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "http_proxy", "https_proxy", "all_proxy", "no_proxy",
      "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    ]
    for row in text[marker.upperBound...].split(separator: "\n") {
      guard let eq = row.firstIndex(of: "=") else { continue }
      let key = String(row[..<eq])
      if keep.contains(key) { env[key] = String(row[row.index(after: eq)...]) }
    }
    env["PATH"] = (env["PATH"] ?? "/usr/bin:/bin").split(separator: ":").filter { !$0.contains("/.superset") }.joined(separator: ":")
    return env
  }()
}
