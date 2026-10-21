// `--tour script.js`: a scripted walkthrough of the live app, for recording the promo video
// (promo/). The page gets `window.__kotoneTour` before it loads, so it hands the tour its state;
// the script runs once the page is up and reports through `webkit.messageHandlers.tour`:
// { mark } prints "MARK <unix seconds> <label>" (to line the recording up with the script),
// { log } prints a line, { window } prints "WINDOW <number>" (for screencapture -l), { done } quits.

import AppKit
import WebKit

final class Tour: NSObject, WKScriptMessageHandler {
  static func install(script path: String, in controller: WKUserContentController) {
    guard let source = try? String(contentsOfFile: path, encoding: .utf8) else {
      FileHandle.standardError.write("tour: can't read \(path)\n".data(using: .utf8)!)
      return
    }
    controller.addUserScript(WKUserScript(source: "window.__kotoneTour = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
    controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    controller.add(Tour(), name: "tour")
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    if let mark = body["mark"] as? String {
      print(String(format: "MARK %.3f %@", Date().timeIntervalSince1970, mark))
    } else if let log = body["log"] as? String {
      print("LOG \(log)")
    } else if body["window"] != nil {
      print("WINDOW \(message.webView?.window?.windowNumber ?? 0)")
    }
    fflush(stdout)
    if body["done"] != nil { NSApp.terminate(nil) }
  }
}
