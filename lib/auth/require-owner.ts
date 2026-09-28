import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";

/** Authorize before reading sensitive data; keep the caller's RLS client. */
export async function requireOwnerData() {
  const db = await createClient();
  const {data: {user}, error} = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const profile = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profile.error) throw new Error("Owner authorization unavailable.");
  if (!profile.data || profile.data.deleted_at || profile.data.role !== "owner") redirect("/dashboard");
  return db;
}
