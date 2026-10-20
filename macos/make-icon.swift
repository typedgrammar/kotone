// Draws AppIcon.icns (night-sky gradient, a moon, a few stars and a white eighth note).
// Run: swift macos/make-icon.swift build/AppIcon.iconset && iconutil -c icns build/AppIcon.iconset -o macos/AppIcon.icns
import AppKit

func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> NSBezierPath {
  NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
}

/// eighth note; (x, y) = centre of the head, k = scale
func note(_ x: CGFloat, _ y: CGFloat, _ k: CGFloat) {
  NSColor.white.setFill()
  let head = NSBezierPath(ovalIn: NSRect(x: -110 * k, y: -78 * k, width: 220 * k, height: 156 * k))
  var t = AffineTransform(translationByX: x, byY: y)
  t.rotate(byDegrees: 22)
  head.transform(using: t)
  head.fill()
  let sx = x + 82 * k
  NSBezierPath(rect: NSRect(x: sx, y: y + 20 * k, width: 30 * k, height: 400 * k)).fill()
  let flag = NSBezierPath()
  flag.move(to: NSPoint(x: sx, y: y + 420 * k))
  flag.curve(to: NSPoint(x: sx + 150 * k, y: y + 150 * k), controlPoint1: NSPoint(x: sx + 50 * k, y: y + 320 * k), controlPoint2: NSPoint(x: sx + 210 * k, y: y + 280 * k))
  flag.curve(to: NSPoint(x: sx + 30 * k, y: y + 280 * k), controlPoint1: NSPoint(x: sx + 160 * k, y: y + 230 * k), controlPoint2: NSPoint(x: sx + 90 * k, y: y + 270 * k))
  flag.close()
  flag.fill()
}

func render(_ size: CGFloat) -> Data {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  // draw on a 1024 canvas
  let scale = NSAffineTransform()
  scale.scale(by: size / 1024)
  scale.concat()
  let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 186, yRadius: 186)
  NSGradient(starting: NSColor(srgbRed: 0.35, green: 0.34, blue: 0.84, alpha: 1), ending: NSColor(srgbRed: 0.11, green: 0.10, blue: 0.29, alpha: 1))!
    .draw(in: tile, angle: 90)
  NSColor(srgbRed: 1, green: 0.91, blue: 0.64, alpha: 1).setFill()
  circle(720, 742, 50).fill()
  for (x, y, r, a) in [(290.0, 780.0, 7.0, 0.7), (680.0, 560.0, 6.0, 0.55), (240.0, 560.0, 5.0, 0.5), (780.0, 420.0, 4.0, 0.45)] {
    NSColor(white: 1, alpha: a).setFill()
    circle(x, y, r).fill()
  }
  note(440, 340, 0.95)
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset")
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
  try! render(CGFloat(base)).write(to: dir.appendingPathComponent("icon_\(base)x\(base).png"))
  try! render(CGFloat(base * 2)).write(to: dir.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
