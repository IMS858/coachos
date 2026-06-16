"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, ImageIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Service {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  highlights: string[] | null;
  active: boolean;
  category: string;
}

export function ServiceCard({ service }: { service: Service }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(service.name);
  const [tagline, setTagline] = useState(service.tagline ?? "");
  const [imageUrl, setImageUrl] = useState(service.image_url ?? "");
  const [highlights, setHighlights] = useState(
    (service.highlights ?? []).join("\n")
  );

  async function save() {
    setBusy(true);
    await fetch(`/api/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        tagline,
        image_url: imageUrl || null,
        highlights: highlights
          .split("\n")
          .map((h) => h.trim())
          .filter(Boolean),
      }),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  async function toggleActive() {
    await fetch(`/api/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !service.active }),
    });
    router.refresh();
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-sky/40 bg-navy-soft p-4 flex flex-col gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service name" />
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short tagline" />
        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (https://…)" />
        <textarea
          value={highlights}
          onChange={(e) => setHighlights(e.target.value)}
          placeholder="One highlight per line"
          rows={3}
          className="rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            <Check className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden bg-navy-soft transition-opacity ${
        service.active ? "border-divider" : "border-divider/50 opacity-60"
      }`}
    >
      {/* Image */}
      <div className="relative h-40 bg-navy-deep flex items-center justify-center">
        {service.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={service.image_url}
            alt={service.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center text-cream-faint">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs mt-1">No photo yet</span>
          </div>
        )}
        <button
          onClick={toggleActive}
          className="absolute top-2 right-2 rounded-full bg-navy-deep/80 p-1.5 text-cream hover:bg-navy-deep"
          title={service.active ? "Visible to clients" : "Hidden from clients"}
        >
          {service.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-cream">{service.name}</h3>
            {service.tagline && (
              <p className="text-xs text-sky mt-0.5">{service.tagline}</p>
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-cream-faint hover:text-cream shrink-0"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {service.description && (
          <p className="text-xs text-cream-faint mt-2">{service.description}</p>
        )}

        {service.highlights && service.highlights.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {service.highlights.map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-cream-dim">
                <span className="h-1.5 w-1.5 rounded-full bg-sky shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
