// HTTP for core/lyrics: the page can't send Referer / Cookie / User-Agent or read cross-origin
// responses, so lyric requests go through URLSession (which also follows the system proxy).

import Foundation

enum Net {
  /// Keep in sync with LYRIC_HOSTS in core/lyrics/index.ts.
  static let hosts: Set<String> = ["music.163.com", "u.y.qq.com", "c.y.qq.com", "mobiles.kugou.com", "lyrics.kugou.com", "lrclib.net"]

  private static let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 15
    config.httpShouldSetCookies = false
    return URLSession(configuration: config)
  }()

  /// `{ url, method, headers, body }` → `{ status, body: base64 }`
  static func fetch(_ p: [String: Any], done: @escaping (Any?, String?) -> Void) {
    guard let s = p["url"] as? String, let url = URL(string: s), url.scheme == "https",
      let host = url.host, hosts.contains(host)
    else { return done(nil, L("不允许访问这个地址", "This address isn't allowed")) }
    var req = URLRequest(url: url)
    req.httpMethod = p["method"] as? String ?? "GET"
    req.httpShouldHandleCookies = false
    for (k, v) in p["headers"] as? [String: String] ?? [:] { req.setValue(v, forHTTPHeaderField: k) }
    if let body = p["body"] as? String { req.httpBody = Data(body.utf8) }
    session.dataTask(with: req) { data, response, error in
      DispatchQueue.main.async {
        if let error { return done(nil, error.localizedDescription) }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        done(["status": status, "body": (data ?? Data()).base64EncodedString()], nil)
      }
    }.resume()
  }
}
