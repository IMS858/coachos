"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Set a new password. Users arrive here with an active session from:
 *   1. A password-reset recovery link (forgot password)
 *   2. A first-time invite link (lead → client conversion)
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (err) {
      if (err.message.toLowerCase().includes("session")) {
        setError(
          "Your link has expired. Request a new one from the sign-in page."
        );
      } else {
        setError(err.message);
      }
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-center mb-2">
          <div className="h-12 w-12 rounded-full bg-sky/10 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-sky" />
          </div>
        </div>
        <CardTitle className="text-center text-xl">Set your password</CardTitle>
        <CardDescription className="text-center">
          Choose a password you&apos;ll use to sign in to IMS Coach OS.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-cream-dim mb-1.5"
            >
              New password
            </label>
            <PasswordInput
              id="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            />
            {tooShort && (
              <p className="text-xs text-status-limited mt-1">
                At least 8 characters.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-xs font-medium text-cream-dim mb-1.5"
            >
              Confirm password
            </label>
            <PasswordInput
              id="confirm"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
            />
            {mismatch && (
              <p className="text-xs text-status-limited mt-1">
                Passwords don&apos;t match.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading || !valid} className="mt-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password & sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
