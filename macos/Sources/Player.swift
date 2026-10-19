// AVPlayer playback with media keys / Now Playing. State is pushed to the page as
// { type: "state", time, duration, playing }; the page interpolates between updates.

import AVFoundation
import MediaPlayer

final class Player: NSObject {
  private let player = AVPlayer()
  private let emit: ([String: Any]) -> Void
  private var observers: [NSKeyValueObservation] = []
  private var title = ""
  private var artist = ""

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
    super.init()
    player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] _ in
      self?.publish()
    }
    observers.append(player.observe(\.timeControlStatus) { [weak self] _, _ in DispatchQueue.main.async { self?.publish() } })
    NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] _ in
      self?.emit(["type": "ended"])
      self?.publish()
    }
    setUpRemoteCommands()
  }

  func load(path: String, title: String, artist: String) {
    self.title = title
    self.artist = artist
    let item = AVPlayerItem(url: URL(fileURLWithPath: path))
    observers.append(item.observe(\.status) { [weak self] item, _ in
      DispatchQueue.main.async {
        if item.status == .failed { self?.emit(["type": "error", "message": item.error?.localizedDescription ?? "player.err.play"]) }
        self?.publish()
      }
    })
    player.replaceCurrentItem(with: item)
    publish()
  }

  func play() { player.play() }
  func pause() { player.pause() }

  func seek(to seconds: Double) {
    player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
      DispatchQueue.main.async { self?.publish() }
    }
  }

  private var time: Double { player.currentTime().seconds.isFinite ? player.currentTime().seconds : 0 }
  private var duration: Double {
    let d = player.currentItem?.duration.seconds ?? 0
    return d.isFinite ? d : 0
  }
  private var playing: Bool { player.timeControlStatus != .paused }

  private func publish() {
    emit(["type": "state", "time": time, "duration": duration, "playing": playing])
    guard player.currentItem != nil else { return }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [
      MPMediaItemPropertyTitle: title,
      MPMediaItemPropertyArtist: artist,
      MPMediaItemPropertyPlaybackDuration: duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: time,
      MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
    ]
    MPNowPlayingInfoCenter.default().playbackState = playing ? .playing : .paused
  }

  private func setUpRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      self?.play()
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.pause()
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.playing ? self.pause() : self.play()
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.seek(to: event.positionTime)
      return .success
    }
  }
}
