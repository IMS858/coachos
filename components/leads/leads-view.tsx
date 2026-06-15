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

export function LeadsView({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [interestFilter, setInterestFilter] = useState<string>("all");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

      <p className="text-xs text-cream-faint">
        {filtered.length} of {leads.length} leads
      </p>

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
