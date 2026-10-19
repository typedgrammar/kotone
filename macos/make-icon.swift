// Draws AppIcon.icns (night-sky gradient, 言音 with its furigana ことね). Run: swift macos/make-icon.swift
import AppKit

func render(_ size: CGFloat) -> Data {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let s = size / 1024
  let tile = NSBezierPath(roundedRect: NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s), xRadius: 186 * s, yRadius: 186 * s)
  NSGradient(starting: NSColor(srgbRed: 0.35, green: 0.34, blue: 0.84, alpha: 1), ending: NSColor(srgbRed: 0.11, green: 0.10, blue: 0.29, alpha: 1))!
    .draw(in: tile, angle: 90)
  NSColor(srgbRed: 1, green: 0.91, blue: 0.64, alpha: 1).setFill()
  NSBezierPath(ovalIn: NSRect(x: 698 * s, y: 718 * s, width: 88 * s, height: 88 * s)).fill()
  for (x, y, r, a) in [(300.0, 794.0, 6.0, 0.7), (660.0, 614.0, 5.0, 0.6), (230.0, 604.0, 4.0, 0.5)] {
    NSColor(white: 1, alpha: a).setFill()
    NSBezierPath(ovalIn: NSRect(x: (x - r) * s, y: (y - r) * s, width: 2 * r * s, height: 2 * r * s)).fill()
  }
  func text(_ str: String, font: String, size pt: CGFloat, color: NSColor, baseline: CGFloat, kern: CGFloat = 0) {
    let attrs: [NSAttributedString.Key: Any] = [.font: NSFont(name: font, size: pt * s)!, .foregroundColor: color, .kern: kern * s]
    let a = NSAttributedString(string: str, attributes: attrs)
    a.draw(at: NSPoint(x: (1024 * s - a.size().width) / 2, y: baseline * s))
  }
  text("ことね", font: "HiraginoSans-W6", size: 84, color: NSColor(srgbRed: 0.81, green: 0.80, blue: 0.98, alpha: 1), baseline: 600, kern: 14)
  text("言音", font: "HiraMinProN-W6", size: 320, color: .white, baseline: 220, kern: 8)
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset")
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
  try! render(CGFloat(base)).write(to: dir.appendingPathComponent("icon_\(base)x\(base).png"))
  try! render(CGFloat(base * 2)).write(to: dir.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
