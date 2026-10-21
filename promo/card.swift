// Renders an HTML page to a PNG at 2x, keeping transparency where the page draws nothing: the
// promo video's title and end cards, background and captions.
//
//   card <page.html> <out.png> [width height]   (default 1920 1080)

import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: card <page.html> <out.png> [width height]\n".data(using: .utf8)!)
  exit(2)
}
let size = NSSize(width: args.count > 4 ? Double(args[3])! : 1920, height: args.count > 4 ? Double(args[4])! : 1080)

final class Loader: NSObject, WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // fonts and images settle a moment after load
    webView.evaluateJavaScript("document.fonts.ready.then(() => true)") { _, _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        webView.takeSnapshot(with: nil) { image, error in
          guard let image, let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            FileHandle.standardError.write("card: \(String(describing: error))\n".data(using: .utf8)!)
            exit(1)
          }
          let rep = NSBitmapImageRep(cgImage: cg)
          try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
          exit(0)
        }
      }
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless], backing: .buffered, defer: false)
let web = WKWebView(frame: NSRect(origin: .zero, size: size))
web.setValue(false, forKey: "drawsBackground")
let loader = Loader()
web.navigationDelegate = loader
window.contentView = web
let page = URL(fileURLWithPath: args[1])
web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
app.run()
