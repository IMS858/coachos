"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Mail, MessageSquare, Phone, Search, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OUTREACH_TEMPLATES, fillTemplate } from "@/lib/outreach-templates";

interface Lead {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  interest: string | null;
  stage: string;
  appointments_booked: number;
  last_visited: string | null;
  prior_trainer: string | null;
}

const STAGE_TONE: Record<string, "neutral" | "moderate" | "optimal"> = {
  new: "neutral",
  contacted: "moderate",
  nurturing: "moderate",
  booked: "optimal",
  converted: "optimal",
  not_interested: "neutral",
};

function fmtPhone(p: string | null) {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

export function LeadsView({ leads: initialLeads }: { leads: Lead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState("");
  const [interestFilter, setInterestFilter] = useState<string>("all");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newLead, setNewLead] = useState({ full_name: "", email: "", phone: "", interest: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState<Record<string, string>>({});
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  async function saveEmail(leadId: string) {
    const email = editEmail[leadId]?.trim();
    if (!email || !email.includes("@")) return;
    setSavingEmail(leadId);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSavingEmail(null);
    if (res.ok) {
      // Update local state so the UI reflects the email immediately
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, email } : l));
      setEditEmail((prev) => { const copy = { ...prev }; delete copy[leadId]; return copy; });
      setActionMsg("Email saved — ready to convert.");
    } else {
      setActionMsg("Couldn't save email. Try again.");
    }
  }
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function createLead() {
    if (!newLead.full_name.trim()) {
      setActionMsg("Name is required.");
      return;
    }
    setSaving(true);
    setActionMsg(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLead),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setShowNew(false);
      setNewLead({ full_name: "", email: "", phone: "", interest: "", notes: "" });
      router.refresh();
    } else {
      setActionMsg(data.error || "Couldn't create lead.");
    }
  }

  async function convertLead(id: string, hasEmail: boolean) {
    if (!hasEmail) {
      setActionMsg("Add an email to this lead before converting (needed to create their account).");
      return;
    }
    setConverting(id);
    setActionMsg(null);
    const res = await fetch(`/api/leads/${id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setConverting(null);
    if (res.ok && data.client_id) {
      router.push(`/clients/${data.client_id}`);
    } else {
      setActionMsg(data.error || "Couldn't convert lead.");
    }
  }

  const interests = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.interest && set.add(l.interest));
    return ["all", ...Array.from(set).sort()];
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (interestFilter !== "all" && l.interest !== interestFilter) return false;
      if (!q) return true;
      return (
        l.full_name.toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q) ||
        (l.phone ?? "").includes(q)
      );
    });
  }, [leads, query, interestFilter]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function setStage(id: string, stage: string) {
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with New Lead */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-cream-faint">
          {filtered.length} of {leads.length} leads
        </p>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> New Lead
        </Button>
      </div>

      {actionMsg && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-400">
          {actionMsg}
        </div>
      )}

      {/* New Lead modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-navy-soft border border-divider rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-cream mb-3">New Lead</h3>
            <div className="flex flex-col gap-2">
              <Input placeholder="Full name *" value={newLead.full_name} onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })} />
              <Input placeholder="Email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
              <Input placeholder="Phone" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
              <Input placeholder="Interest (e.g. Membership, Massage)" value={newLead.interest} onChange={(e) => setNewLead({ ...newLead, interest: e.target.value })} />
              <textarea
                placeholder="Notes"
                className="bg-navy-deep border border-divider rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-sky resize-none"
                rows={2}
                value={newLead.notes}
                onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={createLead} disabled={saving}>{saving ? "Saving…" : "Create Lead"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-faint" />
          <Input
            placeholder="Search leads…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {interests.map((i) => (
            <button
              key={i}
              onClick={() => setInterestFilter(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                interestFilter === i
                  ? "bg-sky text-white"
                  : "bg-navy-soft text-cream-faint border border-divider hover:text-cream"
              }`}
            >
              {i === "all" ? "All" : i}
            </button>
          ))}
        </div>
      </div>

      {/* Leads */}
      <div className="flex flex-col gap-2">
        {filtered.map((l) => {
          const isOpen = openLead === l.id;
          return (
            <Card key={l.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-cream">{l.full_name}</span>
                      {l.interest && <Badge tone="moderate">{l.interest}</Badge>}
                      <Badge tone={STAGE_TONE[l.stage] ?? "neutral"}>{l.stage}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-cream-faint">
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="flex items-center gap-1 hover:text-cream">
                          <Phone className="h-3 w-3" /> {fmtPhone(l.phone)}
                        </a>
                      )}
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="flex items-center gap-1 hover:text-cream">
                          <Mail className="h-3 w-3" /> {l.email}
                        </a>
                      )}
                      {l.appointments_booked > 0 && (
                        <span>{l.appointments_booked} prior visits</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isOpen ? "secondary" : "ghost"}
                    onClick={() => setOpenLead(isOpen ? null : l.id)}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Outreach
                  </Button>
                </div>

                {/* Outreach panel */}
                {isOpen && (
                  <div className="mt-4 border-t border-divider pt-4 flex flex-col gap-3">
                    {/* Add/edit email + convert to client */}
                    <div className="rounded-lg bg-sky/5 border border-sky/20 px-3 py-3 flex flex-col gap-2">
                      {!l.email ? (
                        <>
                          <div className="text-xs text-cream-dim">Add an email to convert this lead to a client:</div>
                          <div className="flex gap-2">
                            <Input
                              type="email"
                              placeholder="client@email.com"
                              value={editEmail[l.id] ?? ""}
                              onChange={(e) => setEditEmail((prev) => ({ ...prev, [l.id]: e.target.value }))}
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              disabled={!editEmail[l.id]?.includes("@") || savingEmail === l.id}
                              onClick={() => saveEmail(l.id)}
                            >
                              {savingEmail === l.id ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-cream-dim flex items-center gap-1.5">
                            <Mail className="h-3 w-3" /> {l.email} — ready to convert
                          </div>
                          <Button
                            size="sm"
                            onClick={() => convertLead(l.id, true)}
                            disabled={converting === l.id}
                          >
                            {converting === l.id ? "Converting…" : "Convert to Client"}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* stage buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-cream-faint self-center mr-1">Mark:</span>
                      {["contacted", "nurturing", "booked", "not_interested"].map((s) => (
                        <button
                          key={s}
                          onClick={() => setStage(l.id, s)}
                          className="rounded-full px-2.5 py-1 text-[11px] bg-navy-deep text-cream-faint hover:text-cream border border-divider"
                        >
                          {s.replace("_", " ")}
                        </button>
                      ))}
                    </div>

                    {/* templates */}
                    {OUTREACH_TEMPLATES.map((t) => {
                      const filled = fillTemplate(t.body, l.full_name);
                      const key = `${l.id}-${t.id}`;
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-divider bg-navy-deep/30 p-3"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-cream flex items-center gap-1.5">
                              {t.channel === "email" ? (
                                <Mail className="h-3 w-3" />
                              ) : (
                                <MessageSquare className="h-3 w-3" />
                              )}
                              {t.label}
                            </span>
                            <button
                              onClick={() =>
                                copy(
                                  t.subject
                                    ? `Subject: ${fillTemplate(t.subject, l.full_name)}\n\n${filled}`
                                    : filled,
                                  key
                                )
                              }
                              className="text-cream-faint hover:text-sky flex items-center gap-1 text-xs"
                            >
                              {copied === key ? (
                                <><Check className="h-3 w-3" /> Copied</>
                              ) : (
                                <><Copy className="h-3 w-3" /> Copy</>
                              )}
                            </button>
                          </div>
                          {t.subject && (
                            <div className="text-[11px] text-cream-faint mb-1">
                              Subject: {fillTemplate(t.subject, l.full_name)}
                            </div>
                          )}
                          <p className="text-xs text-cream-dim whitespace-pre-wrap leading-relaxed">
                            {filled}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-cream-faint">
            No leads match. {leads.length === 0 && "Run migration 0016 to import your list."}
          </div>
        )}
      </div>
    </div>
  );
}
