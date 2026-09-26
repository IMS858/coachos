import SwiftUI

struct TodayView: View {
    @StateObject private var model=TodayModel()
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:18) {
                    VStack(alignment:.leading,spacing:4) {
                        Text("TODAY").font(.caption.bold()).foregroundStyle(.secondary)
                        Text("Ready to train?").font(.largeTitle.bold())
                    }
                    if model.isLoading { ProgressView("Loading your day…").frame(maxWidth:.infinity,alignment:.leading) }
                    if let error=model.error { Text(error).foregroundStyle(.red) }
                    if let data=model.data {
                        if let package=data.packages.first {
                            HStack { VStack(alignment:.leading){Text("Training balance").font(.caption).foregroundStyle(.secondary);Text(package.sessions_remaining.map(String.init) ?? "—").font(.title.bold())};Spacer();Text(package.custom_label ?? package.tier?.replacingOccurrences(of:"_",with:" ").capitalized ?? "Training").font(.subheadline) }.padding().background(.thinMaterial,in:RoundedRectangle(cornerRadius:18))
                        }
                        VStack(alignment:.leading,spacing:10) {
                            Text("Next session").font(.headline)
                            if let next=data.upcoming_sessions.first { HStack{Image(systemName:"calendar");VStack(alignment:.leading){Text(Self.date(next.scheduled_at));Text(next.status.capitalized).font(.caption).foregroundStyle(.secondary)}}.padding().frame(maxWidth:.infinity,alignment:.leading).background(.thinMaterial,in:RoundedRectangle(cornerRadius:18)) } else { Text("Nothing scheduled yet.").foregroundStyle(.secondary) }
                        }
                        VStack(alignment:.leading,spacing:10) {
                            Text("Your training").font(.headline)
                            if data.programs.isEmpty { Text("Your coach hasn't published a program yet.").foregroundStyle(.secondary) }
                            ForEach(data.programs){p in NavigationLink(destination:WebSurface(path:"/programs/\(p.id)")){HStack{VStack(alignment:.leading){Text(p.name).font(.headline);Text(p.status.capitalized).font(.caption).foregroundStyle(.secondary)};Spacer();Image(systemName:"chevron.right")}.padding().background(.thinMaterial,in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain)}
                        }
                    }
                }.padding()
            }.navigationTitle("IMS Fitness").navigationBarTitleDisplayMode(.inline).refreshable{await model.load()}.task{await model.load()}
        }
    }
    static func date(_ value:String)->String { let f=ISO8601DateFormatter();guard let d=f.date(from:value) else{return value};return d.formatted(date:.abbreviated,time:.shortened) }
}
