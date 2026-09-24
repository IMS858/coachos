import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const image = z.string().max(2048).refine(value => {
  if (/^\/services\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..")) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Use an HTTPS photo URL or an existing /services image.").nullable();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  tagline: z.string().trim().max(200).nullable().optional(),
  image_url: image.optional(),
  highlights: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
  active: z.boolean().optional(),
  duration_minutes: z.number().int().min(5).max(240).nullable().optional(),
  member_included: z.boolean().optional(),
  drop_in_eligible: z.boolean().optional(),
  drop_in_price_cents: z.number().int().min(0).max(10000000).nullable().optional(),
  display_order: z.number().int().min(0).max(10000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Nothing to update.");

/** Catalog editing cannot enable a new booking type or change payment-provider prices. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid service." }, { status: 400 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const profile = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profile.error) return NextResponse.json({ error: "Owner authorization unavailable." }, { status: 503 });
  if (profile.data?.role !== "owner" || profile.data.deleted_at) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid service changes." }, { status: 400 });
  const existing = await db.from("service_catalog").select("id,updated_at").eq("id", id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Service lookup unavailable." }, { status: 503 });
  if (!existing.data) return NextResponse.json({ error: "Service not found." }, { status: 404 });
  const saved = await db.from("service_catalog").update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id).eq("updated_at", existing.data.updated_at).select("id").maybeSingle();
  if (saved.error) return NextResponse.json({ error: "Could not save the service. Your changes have not been confirmed." }, { status: 503 });
  if (!saved.data) return NextResponse.json({ error: "This service changed while saving. Refresh and retry." }, { status: 409 });
  return NextResponse.json({ ok: true, service: saved.data }, { headers: { "Cache-Control": "private, no-store" } });
}
