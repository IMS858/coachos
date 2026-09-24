import SwiftUI

@main
struct IMSFitnessApp: App {
    @StateObject private var session = SessionStore()
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(session)
                .onOpenURL { url in session.handle(url: url) }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    var body: some View {
        Group {
            if session.isAuthenticated { ClientTabs() }
            else { SignInView() }
        }
        .task { await session.bootstrap() }
    }
}

struct ClientTabs: View {
    var body: some View {
        TabView {
            WebDestination(path: "/dashboard").tabItem { Label("Today", systemImage: "house") }
            WebDestination(path: "/programs").tabItem { Label("Train", systemImage: "figure.strengthtraining.traditional") }
            WebDestination(path: "/progress").tabItem { Label("Progress", systemImage: "chart.line.uptrend.xyaxis") }
            WebDestination(path: "/book").tabItem { Label("Book", systemImage: "calendar") }
            WebDestination(path: "/messages").tabItem { Label("Messages", systemImage: "message") }
        }
    }
}
