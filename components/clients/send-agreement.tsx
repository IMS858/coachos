"use client";

import { useState } from "react";
import { FileSignature, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SENDABLE = [
  { type: "membership_agreement", label: "Monthly Membership Agreement" },
  { type: "package_terms", label: "Session Package Terms" },
  { type: "liability", label: "Liability Waiver" },
  { type: "massage_consent", label: "Massage & Bodywork Consent" },
  { type: "minor_consent", label: "Parent / Guardian Consent" },
  { type: "photo_release", label: "Photo & Video Release" },
  { type: "facility_use", label: "Facility Use Waiver" },
];

/**
 * Send documents to anyone for signature — client or not.
 *
 * The link is returned as well as emailed, because the case this exists for is
 * often in-person ("sign this before we start") and waiting on an inbox is the
 * wrong shape for that. Copy it and hand them the phone.
 */
export function SendAgreement({
  clientId,
  defaultEmail,
  defaultName,
  partnerId,
}: {
  clientId?: string;
  defaultEmail?: string;
  defaultName?: string;
  partnerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [name, setName] = useState(defaultName ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(t: string) {
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  }

  async function send() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/agreements/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_types: picked,
          email,
          full_name: name,
          note,
          client_id: clientId ?? null,
          partner_id: partnerId ?? null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't send.");
      setLink(d.url);
      setMsg(d.sent ? `Emailed to ${email}.` : "Created, but the email didn't send — use the link below.");
      setPicked([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
          <FileSignature className="h-4 w-4 text-sky" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-cream">Send an agreement</h3>
          <p className="prose-ims text-sm text-cream-dim mt-0.5">
            Membership terms, package terms, or a waiver. They don&apos;t need an
            account — the link opens straight to the documents.
          </p>
        </div>
      </div>

      {!open ? (
        <div>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Choose documents
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {SENDABLE.map((d) => (
              <label
                key={d.type}
                className="flex items-center gap-2 text-sm text-cream cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(d.type)}
                  onChange={() => toggle(d.type)}
                />
                {d.label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-cream-dim mb-1.5">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-cream-dim mb-1.5">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">
              Note (optional)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Please sign before Thursday's session."
            />
          </div>

          <Button
            size="sm"
            onClick={send}
            disabled={busy || picked.length === 0 || !email.includes("@")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send {picked.length > 0 ? `${picked.length} document${picked.length === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      )}

      {msg && <p className="text-sm text-status-optimal">{msg}</p>}
      {error && <p className="text-sm text-status-limited">{error}</p>}

      {link && (
        <div className="rounded-md border border-divider bg-navy-elev p-3 flex flex-col gap-2">
          <p className="text-xs text-cream-faint">
            Signing link — hand them your phone, or text it
          </p>
          <code className="text-[11px] text-cream-dim break-all">{link}</code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </div>
  );
}
