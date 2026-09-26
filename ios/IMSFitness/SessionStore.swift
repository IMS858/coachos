import Foundation
import SwiftUI
import WebKit

@MainActor final class SessionStore: ObservableObject {
    @Published var isAuthenticated = false
    @Published var route = "/dashboard"
    static let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["IMS_API_BASE_URL"] ?? "https://coachos-opal.vercel.app")!
    private let baseURL = SessionStore.apiBaseURL

    func adoptWebCookies(from store: WKHTTPCookieStore) async {
        let cookies = await store.allCookies()
        for cookie in cookies { HTTPCookieStorage.shared.setCookie(cookie) }
        await bootstrap()
    }

    func bootstrap() async {
        var request = URLRequest(url: baseURL.appending(path: "/api/mobile/session"))
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            isAuthenticated = (response as? HTTPURLResponse)?.statusCode == 200
        } catch { isAuthenticated = false }
    }

    func handle(url: URL) {
        guard url.scheme == "imsfitness" else { return }
        let candidate = "/" + ([url.host, url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))].compactMap{$0}.filter{!$0.isEmpty}.joined(separator: "/"))
        route = Self.safePath(candidate)
    }

    static func safePath(_ value: String) -> String {
        let allowed = ["/dashboard","/programs","/workouts/log","/book","/progress","/messages","/account"]
        guard value.hasPrefix("/"), !value.hasPrefix("//"), allowed.contains(where:{value == $0 || value.hasPrefix($0 + "/")}) else { return "/dashboard" }
        return value
    }
}
