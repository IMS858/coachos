import SwiftUI
import WebKit

struct WebDestination: View {
    let path: String
    var body: some View { NavigationStack { WebSurface(path: path).ignoresSafeArea(edges: .bottom) } }
}

struct WebSurface: UIViewRepresentable {
    let path: String
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let web = WKWebView(frame: .zero, configuration: config)
        web.allowsBackForwardNavigationGestures = true
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {
        guard web.url == nil else { return }
        let base = ProcessInfo.processInfo.environment["IMS_WEB_BASE_URL"] ?? "https://coachos-opal.vercel.app"
        if let url = URL(string: base + path) { web.load(URLRequest(url: url)) }
    }
}

struct SignInView: View {
    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("IMS Fitness").font(.largeTitle.bold())
            Text("Train. Track progress. Stay connected with your coach.").multilineTextAlignment(.center).foregroundStyle(.secondary)
            WebSurface(path: "/login").frame(minHeight: 460)
            Spacer()
        }.padding()
    }
}
