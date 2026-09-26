import SwiftUI
import WebKit

struct WebDestination: View {
    let path: String
    var body: some View { NavigationStack { WebSurface(path: path).ignoresSafeArea(edges: .bottom) } }
}

struct WebSurface: UIViewRepresentable {
    @EnvironmentObject var session: SessionStore
    let path: String
    func makeCoordinator() -> Coordinator { Coordinator(session: session) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration();config.websiteDataStore = .default()
        let web = WKWebView(frame: .zero, configuration: config);web.navigationDelegate=context.coordinator;web.allowsBackForwardNavigationGestures=true
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {
        guard web.url == nil else { return }
        if let url = URL(string: path, relativeTo: SessionStore.apiBaseURL)?.absoluteURL { web.load(URLRequest(url: url)) }
    }
    final class Coordinator:NSObject,WKNavigationDelegate {
        let session:SessionStore;init(session:SessionStore){self.session=session}
        func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){Task{@MainActor in await session.adoptWebCookies(from:webView.configuration.websiteDataStore.httpCookieStore)}}
    }
}

struct SignInView: View {
    var body: some View {
        VStack(spacing:18){Spacer();Text("IMS Fitness").font(.largeTitle.bold());Text("Train. Track progress. Stay connected with your coach.").multilineTextAlignment(.center).foregroundStyle(.secondary);WebSurface(path:"/login").frame(minHeight:460);Spacer()}.padding()
    }
}
