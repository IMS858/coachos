import { CheckCircle2 } from "lucide-react";

export default function IntakeDonePage() {
  return (
    <div className="theme-light min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-status-optimal/15 mb-4">
          <CheckCircle2 className="h-8 w-8 text-status-optimal" />
        </div>
        <h1 className="text-2xl font-semibold text-navy mb-2">
          You're all set
        </h1>
        <p className="text-sm text-navy/70 leading-relaxed">
          Your intake is complete and your trainer has everything they need to
          make your assessment count. We'll see you at your scheduled time.
        </p>
        <div className="mt-6 rounded-xl bg-white border border-line p-4 text-left text-sm">
          <div className="font-medium text-navy mb-1">What to bring</div>
          <ul className="text-navy/70 text-xs space-y-1 list-disc list-inside">
            <li>Comfortable clothes you can move in</li>
            <li>Water bottle</li>
            <li>Yourself — no other prep needed</li>
          </ul>
        </div>
        <p className="text-xs text-navy/50 mt-6">
          Questions? Call us: (619) 937-1434
        </p>
      </div>
    </div>
  );
}
