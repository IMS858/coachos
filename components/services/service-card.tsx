"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Check, Dumbbell } from "lucide-react";
interface Service { id: string; name: string; tagline: string | null; description: string | null; image_url: string | null; highlights: string[] | null; active: boolean; category: string; slug?: string }
const field = "mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-divider px-3 py-2 text-sm font-semibold text-cream disabled:opacity-50";
export function ServiceCard({ service }: { service: Service }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: service.name, tagline: service.tagline ?? "", description: service.description ?? "", image_url: service.image_url ?? "", highlights: (service.highlights ?? []).join("\n") });
  async function update(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/services/${service.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Could not save this service.");
      setEditing(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reach Coach OS. Your edits are still here."); }
    finally { setBusy(false); }
  }
  return <article className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm">
    {editing ? <form className="space-y-3 p-5" onSubmit={event => { event.preventDefault(); void update({ ...draft, image_url: draft.image_url || null, highlights: draft.highlights.split("\n").map(v => v.trim()).filter(Boolean) }); }}>
      <h3 className="text-lg font-semibold text-cream">Edit service presentation</h3>
      <label className="block text-xs font-semibold text-cream-dim">Name<input className={field} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={160} disabled={busy}/></label>
      <label className="block text-xs font-semibold text-cream-dim">Tagline<input className={field} value={draft.tagline} onChange={e => setDraft({ ...draft, tagline: e.target.value })} maxLength={200} disabled={busy}/></label>
      <label className="block text-xs font-semibold text-cream-dim">Description<textarea className={field} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={3} maxLength={3000} disabled={busy}/></label>
      <label className="block text-xs font-semibold text-cream-dim">Photo URL or /services image path<input className={field} value={draft.image_url} onChange={e => setDraft({ ...draft, image_url: e.target.value })} disabled={busy}/></label>
      <label className="block text-xs font-semibold text-cream-dim">Highlights (one per line)<textarea className={field} value={draft.highlights} onChange={e => setDraft({ ...draft, highlights: e.target.value })} rows={3} maxLength={2400} disabled={busy}/></label>
      {error && <p role="alert" className="text-sm text-status-limited">{error}</p>}
      <div className="flex gap-2"><button className={`${button} bg-sky text-white`} disabled={busy}><Check className="h-4 w-4"/>{busy ? "Saving…" : "Save changes"}</button><button type="button" className={button} disabled={busy} onClick={() => { setEditing(false); setError(null); }}>Cancel</button></div><p className="text-xs leading-5 text-cream-faint">Presentation only. This does not change Stripe prices, packages or booking eligibility.</p>
    </form> : <>
      <div className="relative flex h-40 items-center justify-center bg-surface">{service.image_url ? <Image src={service.image_url} alt="" fill unoptimized className="object-cover"/> : <Dumbbell aria-hidden="true" className="h-10 w-10 text-sky/50"/>}<span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-cream">{service.slug === "facility_training" ? "Personal Training" : "Supporting catalog"}</span></div>
      <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-cream">{service.name}</h3>{service.tagline && <p className="mt-1 text-sm text-sky">{service.tagline}</p>}</div><button type="button" className={`${button} shrink-0`} aria-label={`Edit ${service.name}`} onClick={() => { setEditing(true); setError(null); }}><Pencil className="h-4 w-4"/>Edit</button></div>{service.description && <p className="mt-3 text-sm leading-6 text-cream-dim">{service.description}</p>}{!!service.highlights?.length && <ul className="mt-3 space-y-2 text-sm text-cream-dim">{service.highlights.map((text,i) => <li key={i} className="flex items-start gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-sky"/>{text}</li>)}</ul>}
      <div className="mt-4 border-t border-divider pt-4"><button type="button" className={`${button} w-full`} disabled={busy} onClick={() => { if (window.confirm(`${service.active ? "Hide" : "Show"} ${service.name} in catalog displays? This does not change training-only booking.`)) void update({ active: !service.active }); }}>{service.active ? <Eye className="h-4 w-4"/> : <EyeOff className="h-4 w-4"/>}{busy ? "Saving…" : service.active ? "Catalog visible" : "Catalog hidden"}</button><p className="mt-2 text-xs leading-5 text-cream-faint">Visibility and bookability are different settings.</p></div>{error && <p role="alert" className="mt-3 text-sm text-status-limited">{error}</p>}</div>
    </>}
  </article>;
}
