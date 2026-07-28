"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const linkError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ims-logo.png" alt="IMS — Innovative Movement Solutions" className="h-20 w-auto" />
        </div>
        <CardTitle className="text-center text-xl">
          Welcome to IMS Coach OS
        </CardTitle>
        <CardDescription className="text-center">
          Sign in to continue
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void handlePassword(e)}
          className="flex flex-col gap-3"
        >
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-cream-dim mb-1.5">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-cream-dim mb-1.5">
              Password
            </label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
            />
          </div>

          {linkError && !error && (
            <div className="rounded-md border border-status-moderate/40 bg-status-moderate/10 px-3 py-2.5 text-sm text-cream">
              {linkError === "link_invalid" ? (
                <>
                  That link has expired or was already used. Request a fresh one
                  below — links work once, and some email apps open them
                  automatically before you do.
                </>
              ) : (
                <>That sign-in link was incomplete. Request a new one below.</>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>

          <a
            href="/forgot-password"
            className="text-xs text-cream-faint hover:text-sky text-center mt-1"
          >
            Forgot your password?
          </a>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
