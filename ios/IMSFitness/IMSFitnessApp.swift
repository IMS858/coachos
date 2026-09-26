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
    @EnvironmentObject var session: SessionStore
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Today", systemImage: "house") }
            WebDestination(path: "/programs").tabItem { Label("Train", systemImage: "figure.strengthtraining.traditional") }
            ProgressHealthView().tabItem { Label("Progress", systemImage: "chart.line.uptrend.xyaxis") }
            WebDestination(path: "/book").tabItem { Label("Book", systemImage: "calendar") }
            WebDestination(path: "/messages").tabItem { Label("Messages", systemImage: "message") }
        }
    }
}

#if canImport(HealthKit)
struct ProgressHealthView: View {
    @StateObject private var health=HealthStore()
    @State private var confirmClear=false
    var body: some View {
        NavigationStack {
            VStack(spacing:0) {
                VStack(alignment:.leading,spacing:8) {
                    Text("APPLE HEALTH").font(.caption.bold()).foregroundStyle(.secondary)
                    Text("Optional activity & recovery context").font(.headline)
                    Text("Share only the Health data you choose. Missing access is never treated as zero or failure. Bod Pod remains the IMS body-composition anchor.").font(.caption).foregroundStyle(.secondary)
                    HStack { Button("Connect / refresh Apple Health"){Task{await health.connectAndSync()}}.buttonStyle(.borderedProminent);Button("Clear IMS Health data",role:.destructive){confirmClear=true}.buttonStyle(.bordered) }
                    Text(health.syncState).font(.caption).foregroundStyle(.secondary)
                }.padding()
                Divider()
                WebSurface(path:"/progress")
            }.navigationTitle("Progress").navigationBarTitleDisplayMode(.inline).confirmationDialog("Clear Apple Health data stored in Coach OS?",isPresented:$confirmClear,titleVisibility:.visible){Button("Clear Coach OS copy",role:.destructive){Task{await health.clearCoachOSData()}};Button("Cancel",role:.cancel){}} message:{Text("This deletes synced Apple Health daily summaries from Coach OS. It does not change Apple Health permissions or data on your iPhone.")}
        }
    }
}
#else
struct ProgressHealthView: View { var body: some View { WebDestination(path:"/progress") } }
#endif
