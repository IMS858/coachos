import {NextResponse, type NextRequest} from "next/server";
import {createClient, createServiceClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {MigrationIdentityError, parseIdentityRequest, provisionMigrationClient} from "@/lib/migration/provision-client";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "private, no-store"}});

export async function POST(request: NextRequest) {
 if (request.headers.get("origin") !== request.nextUrl.origin) return reply({error: "Invalid request origin."}, 403);
 try {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) return reply({error: "Sign in as the owner."}, 401);
  const profile = await db.from("profiles").select("role,deleted_at").eq("id", auth.data.user.id).maybeSingle();
  if (profile.error) return reply({error: "Owner authorization could not be confirmed."}, 503);
  if (!profile.data || profile.data.role !== "owner" || profile.data.deleted_at) return reply({error: "Active owner access is required."}, 403);
  let input;
  try {input = parseIdentityRequest(await smallJson(request, 2048));}
  catch (error) {return reply({error: error instanceof Error ? error.message : "Invalid identity request."}, 400);}
  const service = createServiceClient();
  const result = await provisionMigrationClient(db, service.auth.admin, input);
  return reply(result);
 } catch (error) {
  if (error instanceof MigrationIdentityError) return reply({error: error.message}, error.status);
  return reply({error: "Identity provisioning was interrupted. Retry the same source record to confirm its outcome."}, 503);
 }
}
