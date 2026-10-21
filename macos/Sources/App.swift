// Window, web view and menus. The UI is the Solid app in Resources/web, served over the
// kotone:// scheme; everything native (audio, files, panels) goes through Bridge.swift.

import AppKit
import WebKit

/// UI language, pushed from the page (Settings → Language); starts from the system language.
var uiLanguage = Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "zh" : "en"
func L(_ zh: String, _ en: String) -> String { uiLanguage == "zh" ? zh : en }

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  private var window: NSWindow!
  private(set) var webView: WKWebView!
  let library = Library()
  private(set) lazy var player = Player { [weak self] event in self?.emit(event) }
  private(set) lazy var agent = Agent { [weak self] event in self?.emit(event) }
  private(set) lazy var spotify = Spotify { [weak self] event in self?.emit(event) }
  let spotifySearch = SpotifySearch()
  private var bridge: Bridge!
  private let launch = LaunchOptions.parse()
  private var snapshot: LaunchOptions? { launch.snapshot == nil ? nil : launch }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = buildMenu()

    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(AssetHandler(root: webRoot(), library: library), forURLScheme: "kotone")
    bridge = Bridge(app: self)
    config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "kotone")
    if let tour = launch.tour { Tour.install(script: tour, in: config.userContentController) }

    webView = WKWebView(frame: .zero, configuration: config)
    webView.setValue(false, forKey: "drawsBackground") // let the vibrancy show through the sidebar
    webView.navigationDelegate = self
    if #available(macOS 13.3, *) { webView.isInspectable = true }

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.title = "Kotone"
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.minSize = NSSize(width: 780, height: 520)

    let background = NSVisualEffectView()
    background.material = .sidebar
    background.blendingMode = .behindWindow
    background.state = .followsWindowActiveState
    window.contentView = background
    webView.frame = background.bounds
    webView.autoresizingMask = [.width, .height]
    background.addSubview(webView)

    // The web content keeps its top strip free of controls; this view makes it a titlebar.
    let strip = DragStrip(frame: NSRect(x: 0, y: background.bounds.height - 28, width: background.bounds.width, height: 28))
    strip.autoresizingMask = [.width, .minYMargin]
    background.addSubview(strip)

    if let size = launch.size { window.setContentSize(size) } else { window.setFrameAutosaveName("Main") }
    if let name = launch.appearance { NSApp.appearance = NSAppearance(named: name == "light" ? .aqua : .darkAqua) }
    if window.frame.origin == .zero { window.center() }

    if let dev = ProcessInfo.processInfo.environment["KOTONE_DEV_URL"], let url = URL(string: dev) {
      webView.load(URLRequest(url: url))
    } else {
      webView.load(URLRequest(url: URL(string: "kotone://app/index.html")!))
    }
    // a covered window gets its timers and animation frames throttled: a tour stays on top, on
    // every Space
    if launch.tour != nil {
      window.level = .floating
      window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func applicationWillTerminate(_ notification: Notification) { agent.stop() }

  private func webRoot() -> URL {
    if let override = ProcessInfo.processInfo.environment["KOTONE_WEB_ROOT"] { return URL(fileURLWithPath: override) }
    return Bundle.main.resourceURL!.appendingPathComponent("web")
  }

  /// Push an event to the page (`window.__kotone.emit`).
  func emit(_ event: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: event), let json = String(data: data, encoding: .utf8) else { return }
    webView?.evaluateJavaScript("window.__kotone && window.__kotone.emit(\(json))")
  }

  // MARK: panels

  func pickAudio(songId: String, done: @escaping (String?) -> Void) {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.audio]
    panel.message = L("选择这首歌的音频文件", "Choose this song's audio file")
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url else { return done(nil) }
      self?.library.linkAudio(songId: songId, path: url.path)
      done(url.path)
    }
  }

  func importSong(done: @escaping (String?) -> Void) {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.json]
    panel.message = L("选择用 kotone CLI 标注好的 song.json", "Choose a song.json annotated with the kotone CLI")
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return done(nil) }
      do { done(try self.library.importSong(from: url)) } catch {
        NSAlert(error: error).beginSheetModal(for: self.window)
        done(nil)
      }
    }
  }

  // MARK: snapshot (headless-ish verification: --snapshot out.png [--js code] [--size 1180x780])

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard let snapshot else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      let js = "document.body.style.background = getComputedStyle(document.documentElement).getPropertyValue('--sidebar');" + (snapshot.js ?? "")
      webView.evaluateJavaScript("try { \(js) } catch (e) { 'error: ' + e }") { result, _ in
        if let message = result as? String, message.hasPrefix("error") { FileHandle.standardError.write("\(message)\n".data(using: .utf8)!) }
        DispatchQueue.main.asyncAfter(deadline: .now() + snapshot.delay) {
          webView.takeSnapshot(with: nil) { image, error in
            if let image, let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
              try? png.write(to: URL(fileURLWithPath: snapshot.snapshot!))
            } else {
              FileHandle.standardError.write("snapshot failed: \(String(describing: error))\n".data(using: .utf8)!)
            }
            NSApp.terminate(nil)
          }
        }
      }
    }
  }

  // MARK: menu

  private func buildMenu() -> NSMenu {
    let main = NSMenu()
    func submenu(_ title: String, _ items: [NSMenuItem]) {
      let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      let menu = NSMenu(title: title)
      items.forEach(menu.addItem)
      item.submenu = menu
      main.addItem(item)
    }
    func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
      let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
      i.keyEquivalentModifierMask = mods
      return i
    }
    submenu("Kotone", [
      item(L("关于 Kotone", "About Kotone"), #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
      .separator(),
      item(L("设置…", "Settings…"), #selector(openSettings), ","),
      .separator(),
      item(L("隐藏 Kotone", "Hide Kotone"), #selector(NSApplication.hide(_:)), "h"),
      item(L("隐藏其他", "Hide Others"), #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
      .separator(),
      item(L("退出 Kotone", "Quit Kotone"), #selector(NSApplication.terminate(_:)), "q"),
    ])
    submenu(L("文件", "File"), [item(L("添加歌曲…", "Add Song…"), #selector(addSong), "n")])
    submenu(L("编辑", "Edit"), [
      item(L("撤销", "Undo"), Selector(("undo:")), "z"),
      item(L("重做", "Redo"), Selector(("redo:")), "z", [.command, .shift]),
      .separator(),
      item(L("剪切", "Cut"), #selector(NSText.cut(_:)), "x"),
      item(L("拷贝", "Copy"), #selector(NSText.copy(_:)), "c"),
      item(L("粘贴", "Paste"), #selector(NSText.paste(_:)), "v"),
      item(L("全选", "Select All"), #selector(NSText.selectAll(_:)), "a"),
    ])
    submenu(L("显示", "View"), [item(L("重新载入", "Reload"), #selector(reload), "r")])
    submenu(L("窗口", "Window"), [
      item(L("最小化", "Minimize"), #selector(NSWindow.performMiniaturize(_:)), "m"),
      item(L("缩放", "Zoom"), #selector(NSWindow.performZoom(_:))),
      item(L("关闭", "Close"), #selector(NSWindow.performClose(_:)), "w"),
    ])
    return main
  }

  @objc private func reload() { webView.reload() }
  @objc private func openSettings() { emit(["type": "openSettings"]) }
  @objc private func addSong() { emit(["type": "addSong"]) }

  func setLanguage(_ lang: String) {
    guard lang != uiLanguage, lang == "zh" || lang == "en" else { return }
    uiLanguage = lang
    NSApp.mainMenu = buildMenu()
  }
}

/// Transparent strip over the top of the web view that drags (and double-click zooms) the window.
final class DragStrip: NSView {
  override var mouseDownCanMoveWindow: Bool { true }
  override func mouseDown(with event: NSEvent) {
    if event.clickCount == 2 { window?.performZoom(nil) } else { window?.performDrag(with: event) }
  }
}

/// Serves the built web app from disk for kotone://app/… requests, and song covers from the
/// library for kotone://app/__cover/<id>.
final class AssetHandler: NSObject, WKURLSchemeHandler {
  private let root: URL
  private let library: Library
  private static let types = [
    "html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json",
    "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "woff2": "font/woff2",
  ]

  init(root: URL, library: Library) {
    self.root = root.standardizedFileURL
    self.library = library
  }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
    let file: URL
    if path.hasPrefix("__cover/") {
      file = library.coverFile(String(path.dropFirst("__cover/".count))) ?? root.appendingPathComponent("missing")
    } else {
      file = root.appendingPathComponent(path).standardizedFileURL
      guard file.path.hasPrefix(root.path) else { return notFound(task, url) }
    }
    guard let data = try? Data(contentsOf: file) else {
      return notFound(task, url)
    }
    let type = Self.types[file.pathExtension] ?? "application/octet-stream"
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type])!)
    task.didReceive(data)
    task.didFinish()
  }

  private func notFound(_ task: WKURLSchemeTask, _ url: URL) {
    task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Launch flags for verification and recording: `--snapshot out.png [--js code] [--delay s]` renders
/// once and quits; `--tour script.js` runs a scripted walkthrough in the live window (see promo/);
/// `--size 1180x780` and `--appearance light|dark` go with either.
struct LaunchOptions {
  var snapshot: String?
  var js: String?
  var tour: String?
  var size: NSSize?
  var delay: Double = 0.8
  var appearance: String?

  static func parse() -> LaunchOptions {
    let args = CommandLine.arguments
    func value(_ flag: String) -> String? {
      guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
      return args[i + 1]
    }
    var o = LaunchOptions(snapshot: value("--snapshot"), js: value("--js"), tour: value("--tour"), appearance: value("--appearance"))
    if let s = value("--size")?.split(separator: "x").compactMap({ Double($0) }), s.count == 2 { o.size = NSSize(width: s[0], height: s[1]) }
    if let d = value("--delay").flatMap(Double.init) { o.delay = d }
    return o
  }
}
