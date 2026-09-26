import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

/** Attendance release must use the audited database command, not service-role table writes. */
export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "Unauthorized" }, 401);
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return reply({ error: "Authorization unavailable." }, 503);
  if (!me.data || me.data.deleted_at || !["owner", "trainer"].includes(me.data.role)) {
    return reply({ error: "Active staff account required." }, 403);
  }
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return reply({ error: "Invalid request origin." }, 403);
  }
  // mark_class_attendance is implemented and regression-tested, but intentionally ungranted.
  // Remove this hold only in the reviewed launch that also activates the scoped atomic command.
  return reply({
    error: "Class attendance is in prelaunch. No attendance record was changed. Review the existing roster without editing it.",
    code: "CLASS_PRELAUNCH",
  }, 409);
}
