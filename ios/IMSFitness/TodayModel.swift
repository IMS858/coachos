import Foundation

struct TodayPayload: Decodable {
    struct Session: Decodable, Identifiable { let id:String; let scheduled_at:String; let duration_minutes:Int?; let status:String }
    struct Package: Decodable, Identifiable { let id:String; let custom_label:String?; let tier:String?; let sessions_remaining:Int?; let expires_at:String? }
    struct Program: Decodable, Identifiable { let id:String; let name:String; let status:String; let updated_at:String }
    let upcoming_sessions:[Session]; let packages:[Package]; let programs:[Program]
}

@MainActor final class TodayModel: ObservableObject {
    @Published var data:TodayPayload?; @Published var isLoading=false; @Published var error:String?
    func load() async {
        isLoading=true; error=nil; defer{isLoading=false}
        let base=ProcessInfo.processInfo.environment["IMS_API_BASE_URL"] ?? "https://coachos-opal.vercel.app"
        guard let url=URL(string:base+"/api/mobile/today") else{return}
        do { let (raw,response)=try await URLSession.shared.data(from:url); guard (response as? HTTPURLResponse)?.statusCode==200 else{error="Could not load your training day.";return}; data=try JSONDecoder().decode(TodayPayload.self,from:raw) }
        catch { self.error="Could not load your training day." }
    }
}
