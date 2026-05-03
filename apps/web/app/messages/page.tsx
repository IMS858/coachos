import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function MessagesPage() {
  return (
    <AppShell>
      <ComingSoon
        title="Messages"
        description="Real-time conversations with clients."
        next={[
          "Conversation list (sorted by last message)",
          "Thread view with realtime updates via Supabase Realtime",
          "Inline session/program references (pin a session to chat)",
          "Twilio fallback: SMS when client hasn't logged in for 24+ hrs",
        ]}
      />
    </AppShell>
  );
}
