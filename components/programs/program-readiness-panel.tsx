"use client";

import {useState} from "react";

type Check = {key:string;label:string;ok:boolean};
type Readiness = {
  ready_for_coach_review:boolean;
  ready_for_client_release:boolean;
  checks:Check[];
  blockers:{key:string;label:string}[];
  release_checks?:Check[];
  note:string;
};

export function ProgramReadinessPanel({programId}:{programId:string}) {
  const [result,setResult]=useState<Readiness|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function check() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response=await fetch(`/api/programs/${encodeURIComponent(programId)}/readiness`,{
        method:"GET",credentials:"same-origin",cache:"no-store"
      });
      if (!response.ok) {
        setResult(null);
        setError(response.status===403?"Only IMS coaches can review program readiness.":"Unable to verify this program. Try again.");
        return;
      }
      const body:Readiness=await response.json();
      if (!Array.isArray(body.checks) || !Array.isArray(body.blockers)) {
        setResult(null);
        setError("Readiness response is incomplete. No release is authorized.");
        return;
      }
      setResult(body);
    } catch {
      setResult(null);
      setError("Connection unavailable. No release is authorized.");
    } finally {
      setBusy(false);
    }
  }
  return <section aria-label="Program readiness" className="rounded-xl border border-divider bg-navy-soft p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-cream">Coach program preflight</h2>
        <p className="mt-1 text-sm text-cream-dim">Check the draft, assessment, PDF and unsynchronized edits before coach review.</p>
      </div>
      <button type="button" disabled={busy} onClick={check}
        className="min-h-11 rounded-lg bg-sky px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">
        {busy?"Checking…":result?"Run checks again":"Check program"}
      </button>
    </div>
    {error&&<p role="alert" className="mt-4 rounded-lg border border-status-limited p-3 text-sm text-status-limited">{error}</p>}
    {result&&<div className="mt-4 space-y-3" aria-live="polite">
      <p className={result.ready_for_coach_review?"text-sm font-semibold text-sky":"text-sm font-semibold text-status-limited"}>
        {result.ready_for_coach_review?"Ready for coach review":"Resolve the blockers before coach review"}
      </p>
      <ul className="divide-y divide-divider">
        {result.checks.map(item=><li key={item.key} className="flex items-start gap-3 py-2 text-sm">
          <span aria-hidden="true" className={item.ok?"text-sky":"text-status-limited"}>{item.ok?"✓":"!"}</span>
          <span className="text-cream">{item.label}</span>
        </li>)}
      </ul>
      {!!result.release_checks?.length && <div className="rounded-lg border border-divider p-4">
        <h3 className="font-semibold text-cream">Client release gates</h3>
        <p className="mt-1 text-xs text-cream-dim">Coach review readiness is not permission to publish.</p>
        <ul className="mt-3 divide-y divide-divider">{result.release_checks.map(item=><li key={item.key} className="flex gap-3 py-2 text-sm">
          <span aria-hidden="true" className={item.ok?"text-sky":"text-status-limited"}>{item.ok?"✓":"!"}</span>
          <span className="text-cream">{item.label}</span>
        </li>)}</ul>
      </div>}
      <p className="text-xs text-cream-dim">{result.note}</p>
    </div>}
  </section>;
}
