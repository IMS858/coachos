import {NextResponse, type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {parseOwnerReview, validReviewReceipt, REVIEW_UUID} from "@/lib/migration/owner-review";
const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "private, no-store"}});

export async function POST(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!REVIEW_UUID.test(id)) return reply({error: "Invalid source record."}, 400);
  const db = await createClient();
  const {data: {user}} = await db.auth.getUser();
  if (!user) return reply({error: "Sign in as the owner to review migration evidence."}, 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({error: "Invalid request origin."}, 403);
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return reply({error: "Owner authorization could not be confirmed."}, 503);
  if (!me.data || me.data.role !== "owner" || me.data.deleted_at) return reply({error: "Active owner access is required."}, 403);
  let review;
  try {review = parseOwnerReview(await smallJson(request, 16000));}
  catch (error) {return reply({error: error instanceof Error ? error.message : "Invalid review."}, 400);}
  try {
    const result = await db.rpc("review_migration_record", {p_record_id: id, p_review: review});
    if (result.error) {
      const code = result.error.code;
      if (code === "42501") return reply({error: "Owner access was not confirmed by the database."}, 403);
      if (code === "P0002") return reply({error: "Source record was not found."}, 404);
      if (["40001", "23505", "23514"].includes(code)) return reply({error: "The source, review or batch state changed. Refresh before saving another decision."}, 409);
      if (["22023", "22P02", "22007", "22008"].includes(code)) return reply({error: "The review could not be validated. Check identities, date, quantities and confirmation."}, 400);
      if (["PGRST202", "42883", "42P01"].includes(code)) return reply({error: "Owner-review storage requires its database rollout. No review was confirmed."}, 503);
      return reply({error: "Review save was not confirmed. Retry the same request before changing it."}, 503);
    }
    if (!validReviewReceipt(result.data, review, id)) return reply({error: "The save receipt was incomplete. Retry the same review; do not assume it saved."}, 503);
    return reply(result.data);
  } catch {
    return reply({error: "Connection interrupted. Retry the same review to confirm its outcome."}, 503);
  }
}
