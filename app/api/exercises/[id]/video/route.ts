import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CAPTURE_UUID, validateDemoPath } from "@/lib/exercises/capture";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CAPTURE_UUID.test(id)) return reply({ error: "Invalid exercise." }, 400);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "Sign in to view this demo." }, 401);
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return reply({ error: "Authorization unavailable." }, 503);
  if (!me.data || me.data.deleted_at || !["owner", "trainer", "client"].includes(me.data.role)) return reply({ error: "Account unavailable." }, 403);
  const staff = ["owner", "trainer"].includes(me.data.role);
  const result = await db.from("exercises").select("id,status,client_visible,video_guid,created_by").eq("id", id).maybeSingle();
  if (result.error) return reply({ error: "Demo lookup unavailable." }, 503);
  const exercise = result.data;
  if (!exercise || exercise.status === "archived" || (!staff && (!exercise.client_visible || exercise.status !== "published"))) return reply({ error: "Demo not available." }, 404);
  const svc = createServiceClient();
  if (!staff) {
    const review = await svc.from("exercise_reviews").select("safety_status").eq("exercise_id", exercise.id).maybeSingle();
    if (review.error) return reply({ error: "Demo eligibility unavailable." }, 503);
    if (review.data?.safety_status !== "approved") return reply({ error: "Demo not available." }, 404);
  }
  const reference = exercise.video_guid;
  if (!reference) return reply({ error: "No demo has been attached." }, 404);
  if (reference.startsWith("supabase:")) {
    const path = reference.slice("supabase:".length);
    if (!exercise.created_by || !validateDemoPath(path, exercise.created_by, exercise.id)) return reply({ error: "Demo reference needs review." }, 409);
    const signed = await svc.storage.from("client-media").createSignedUrl(path, 300);
    if (signed.error || !signed.data) return reply({ error: "Private video is unavailable. Retry shortly." }, 503);
    return reply({ kind: "file", url: signed.data.signedUrl });
  }
  // Existing Bunny media stays supported, but never treat an arbitrary URL as a GUID.
  const library = process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID;
  if (!CAPTURE_UUID.test(reference) || !library || !/^\d+$/.test(library)) return reply({ error: "This demo requires media configuration." }, 503);
  return reply({ kind: "embed", url: `https://iframe.mediadelivery.net/embed/${library}/${reference}?autoplay=false&preload=false` });
}
