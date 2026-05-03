import { redirect } from "next/navigation";

/**
 * Root page. Middleware should redirect authenticated users to their
 * role-appropriate landing. If somehow not redirected, fall through to login.
 */
export default function Page() {
  redirect("/login");
}
