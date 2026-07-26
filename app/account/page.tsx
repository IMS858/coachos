import { AppShell } from "@/components/layout/app-shell";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function AccountPage() {
  return (
    <AppShell>
      <ComingSoon
        title="Account"
        description="Your profile, billing, and documents."
        next={[
          "Edit profile, emergency contact, physician info",
          "Billing: current membership, next charge date, update card",
          "Stripe Customer Portal embed (download invoices, manage subscription)",
          "Documents: signed waivers, intake form, program PDFs",
          "Refer a friend (shareable link with reward tracking)",
          "Privacy: download my data / delete my account",
        ]}
      />
    </AppShell>
  );
}
