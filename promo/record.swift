// Records one app's window (video) and another app's sound (audio) with ScreenCaptureKit, for the
// promo video: Kotone's window, and Spotify, which plays the music Kotone controls.
//
//   record <window-pid> <audio-bundle-id> <out-dir>
//
// Writes window.mov (H.264, the window at its pixel size), window.png (the first frame, with the
// rounded corners' alpha, for masking) and audio.wav, and prints "VIDEO <unix seconds>" /
// "AUDIO <unix seconds>" for each file's first sample, so marks from the tour line up. Stops on
// SIGINT/SIGTERM. Needs the Screen Recording permission.

import AppKit
import AVFoundation
import CoreImage
import ScreenCaptureKit

let args = CommandLine.arguments
guard args.count == 4, let pid = pid_t(args[1]) else {
  FileHandle.standardError.write("usage: record <window-pid> <audio-bundle-id> <out-dir>\n".data(using: .utf8)!)
  exit(2)
}
let audioBundle = args[2]
let out = URL(fileURLWithPath: args[3])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

/// Unix time of a sample's presentation time (both are on the host clock)
func epoch(_ pts: CMTime) -> Double { Date().timeIntervalSince1970 - (CACurrentMediaTime() - pts.seconds) }

final class Sink: NSObject, SCStreamOutput, SCStreamDelegate {
  let writer: AVAssetWriter
  let input: AVAssetWriterInput
  let label: String
  var started = false
  var firstFrame: ((CVPixelBuffer) -> Void)?
  let lock = NSLock()

  init(url: URL, type: AVFileType, input: AVAssetWriterInput, label: String) throws {
    try? FileManager.default.removeItem(at: url)
    writer = try AVAssetWriter(outputURL: url, fileType: type)
    self.input = input
    self.label = label
    input.expectsMediaDataInRealTime = true
    writer.add(input)
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard buffer.isValid else { return }
    if type == .screen {
      // only complete frames carry an image; idle ones repeat the last
      guard let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
        let raw = attachments.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete
      else { return }
    }
    lock.lock()
    defer { lock.unlock() }
    let pts = buffer.presentationTimeStamp
    if !started {
      started = true
      writer.startWriting()
      writer.startSession(atSourceTime: pts)
      print(String(format: "%@ %.3f", label, epoch(pts)))
      fflush(stdout)
      if let image = buffer.imageBuffer { firstFrame?(image) }
    }
    if input.isReadyForMoreMediaData { input.append(buffer) }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write("\(label) stream stopped: \(error)\n".data(using: .utf8)!)
  }

  func finish() async {
    let wasStarted = lock.withLock {
      defer { started = true }  // drop late samples
      return started
    }
    guard wasStarted else { return }
    input.markAsFinished()
    await writer.finishWriting()
  }
}

func savePNG(_ image: CVPixelBuffer, to url: URL) {
  let ci = CIImage(cvPixelBuffer: image)
  let ctx = CIContext()
  try? ctx.writePNGRepresentation(of: ci, to: url, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
}

var streams: [SCStream] = []
var sinks: [Sink] = []

func start() async throws {
  // the window: wait for it to open
  var window: SCWindow?
  for _ in 0..<200 {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    // its main window (a tour floats it above the others, so not necessarily layer 0)
    window = content.windows.filter { $0.owningApplication?.processID == pid && $0.frame.width > 400 }
      .max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
    if window != nil { break }
    try await Task.sleep(nanoseconds: 100_000_000)
  }
  guard let window else { throw NSError(domain: "record", code: 1, userInfo: [NSLocalizedDescriptionKey: "no window for pid \(pid)"]) }
  let scale = NSScreen.main?.backingScaleFactor ?? 2
  let w = Int(window.frame.width * scale), h = Int(window.frame.height * scale)

  let video = SCStreamConfiguration()
  video.width = w
  video.height = h
  video.minimumFrameInterval = CMTime(value: 1, timescale: 60)
  video.pixelFormat = kCVPixelFormatType_32BGRA
  video.showsCursor = false
  video.queueDepth = 8
  if #available(macOS 14.0, *) { video.ignoreShadowsSingleWindow = true }
  let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: w,
    AVVideoHeightKey: h,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 60_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
  ])
  let videoSink = try Sink(url: out.appendingPathComponent("window.mov"), type: .mov, input: videoInput, label: "VIDEO")
  videoSink.firstFrame = { savePNG($0, to: out.appendingPathComponent("window.png")) }
  let videoStream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: video, delegate: videoSink)
  try videoStream.addStreamOutput(videoSink, type: .screen, sampleHandlerQueue: DispatchQueue(label: "video"))

  // the sound: every process of the audio app (Spotify plays from a helper)
  let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
  let apps = content.applications.filter { $0.bundleIdentifier.hasPrefix(audioBundle) }
  guard !apps.isEmpty, let display = content.displays.first else {
    throw NSError(domain: "record", code: 2, userInfo: [NSLocalizedDescriptionKey: "\(audioBundle) isn't running"])
  }
  let audio = SCStreamConfiguration()
  audio.capturesAudio = true
  audio.sampleRate = 48000
  audio.channelCount = 2
  audio.width = 2
  audio.height = 2
  audio.minimumFrameInterval = CMTime(value: 1, timescale: 1)
  let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVSampleRateKey: 48000,
    AVNumberOfChannelsKey: 2,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
    AVLinearPCMIsNonInterleaved: false,
  ])
  let audioSink = try Sink(url: out.appendingPathComponent("audio.wav"), type: .wav, input: audioInput, label: "AUDIO")
  let audioStream = SCStream(filter: SCContentFilter(display: display, including: apps, exceptingWindows: []), configuration: audio, delegate: audioSink)
  try audioStream.addStreamOutput(audioSink, type: .audio, sampleHandlerQueue: DispatchQueue(label: "audio"))

  streams = [videoStream, audioStream]
  sinks = [videoSink, audioSink]
  try await audioStream.startCapture()
  try await videoStream.startCapture()
  print("RECORDING \(w)x\(h)")
  fflush(stdout)
}

func stop() {
  Task {
    for s in streams { try? await s.stopCapture() }
    for s in sinks { await s.finish() }
    print("STOPPED")
    fflush(stdout)
    exit(0)
  }
}

signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
let sources = [SIGINT, SIGTERM].map { sig -> DispatchSourceSignal in
  let s = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  s.setEventHandler(handler: stop)
  s.resume()
  return s
}

Task {
  do { try await start() } catch {
    FileHandle.standardError.write("record: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
  }
}
dispatchMain()
