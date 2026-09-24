"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { researchBrief } from "@/lib/leads/workspace";

export function LeadResearchDesk() {
  const router = useRouter();
  const [area, setArea] = useState("Scripps Ranch and nearby San Diego communities");
  const [lane, setLane] = useState("Local business and community referral partnerships");
  const [result, setResult] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef<{ content: string; id: string } | null>(null);
  const brief = researchBrief(area, lane);
  const field = "mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const candidates: unknown = JSON.parse(result);
      if (!Array.isArray(candidates)) throw new Error("Paste the agent's JSON array of source-backed candidates.");
      if (run.current?.content !== result) run.current = { content: result, id: crypto.randomUUID() };
      const response = await fetch("/api/leads/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: run.current.id, candidates }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Could not save the research results.");
      setMessage(`${data.count} candidates saved for review. No messages were sent and none were added to the active sales pipeline.`); setResult(""); run.current = null; router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save the results. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded-2xl border border-divider bg-white p-5 sm:p-6" aria-label="Lead research desk">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-sky">Research before outreach</p><h2 className="mt-2 text-2xl font-semibold text-cream">Build a better prospect list.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-cream-dim">Prepare a research brief for your agent, then bring source-backed results into a separate review queue. This workspace does not currently run an autonomous agent or send outreach.</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-cream-dim">Target area<input className={field} value={area} maxLength={160} onChange={e => setArea(e.target.value)}/></label><label className="text-xs font-semibold text-cream-dim">Opportunity type<select className={field} value={lane} onChange={e => setLane(e.target.value)}>{["Local business and community referral partnerships","Employer wellness and employee training partnerships","Local sports organizations and adult performance communities","Public community events with vendor or training opportunities"].map(value => <option key={value}>{value}</option>)}</select></label></div>
    <details><summary className="cursor-pointer py-3 text-sm font-semibold text-cream">Review agent brief</summary><pre className="whitespace-pre-wrap rounded-xl bg-surface p-4 text-xs leading-6 text-cream-dim">{brief}</pre></details>
    <button type="button" className="min-h-11 rounded-xl bg-sky px-5 text-sm font-semibold text-white" onClick={async () => { try { await navigator.clipboard.writeText(brief); setMessage("Research brief copied. Run it with your agent, then review the sources before saving results."); } catch { setMessage("Clipboard unavailable. Open the brief above and copy it manually."); } }}>Copy research brief</button>
    <form onSubmit={save} className="space-y-3 border-t border-divider pt-5"><label className="block text-sm font-semibold text-cream">Import reviewed research output<textarea className={field} rows={6} value={result} disabled={busy} maxLength={60000} onChange={e => setResult(e.target.value)} placeholder="Paste the JSON array from the research brief. Every candidate needs its official website, evidence URL, fit, next step and date checked."/></label><p className="text-xs leading-5 text-cream-faint">Saving validates the structure, not the agent's claims. These stay unqualified research candidates. Don't paste private client records or personal health information.</p><button className="min-h-11 rounded-xl border border-divider px-5 text-sm font-semibold text-cream disabled:opacity-50" disabled={busy || !result.trim()}>{busy ? "Saving candidates…" : "Save to research queue"}</button></form>
    {message && <p role="status" className="rounded-xl border border-divider bg-surface p-4 text-sm leading-6 text-cream">{message}</p>}
  </section>;
}
