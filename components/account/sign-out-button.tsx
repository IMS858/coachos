"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={signOut} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Sign out
    </Button>
  );
}
