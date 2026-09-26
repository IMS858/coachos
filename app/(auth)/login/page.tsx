"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
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
  const requestedNext = searchParams.get("next") || "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  const linkError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);
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

  async function handleSocial(provider: "google" | "apple") {
    setSocialLoading(provider);
    setError(null);
    try {
      const supabase = createClient();
      const callback = new URL("/api/auth/callback", window.location.origin);
      callback.searchParams.set("next", next);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback.toString() },
      });
      if (oauthError) setError(oauthError.message);
    } catch {
      setError("Couldn't start sign-in. Please try again or use your password.");
    } finally {
      setSocialLoading(null);
    }
  }

  return (
    <Card className="overflow-hidden rounded-[28px] border border-[#dde3e9] bg-white shadow-[0_28px_80px_rgba(18,35,49,0.12)] sm:rounded-[32px]">
      <CardHeader className="px-6 pt-7 sm:px-8 sm:pt-8">
        <div className="mb-6 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ims-logo.png" alt="IMS — Innovative Movement Solutions" className="h-auto w-full max-w-[165px] object-contain sm:max-w-[185px]" />
        </div>
        <CardTitle className="text-center text-3xl font-bold">
          Welcome back
        </CardTitle>
        <CardDescription className="text-center">
          Sign in to your IMS training account.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
        <form
          noValidate
          onSubmit={(e) => void handlePassword(e)}
          className="flex flex-col gap-4"
        >
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-cream-dim mb-1.5">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              name="email"
              autoComplete="username"
              inputMode="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-13 rounded-xl border-[#d6dfe8] bg-white px-4 text-base text-[#17191c] placeholder:text-[#8492a3] focus-visible:ring-[#1876b4]"
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
              inputClassName="h-13 rounded-xl border-[#d6dfe8] bg-white px-4 text-base text-[#17191c] focus-visible:ring-[#1876b4]"
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

          <Button type="submit" disabled={loading} className="mt-2 min-h-13 rounded-xl bg-[#1876b4] text-base font-semibold text-white hover:bg-[#125f95]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LockKeyhole className="h-4 w-4"/>Sign in securely</>}
          </Button>

          <a
            href="/forgot-password"
            className="inline-flex min-h-11 items-center justify-center text-sm text-[#246d9c] hover:underline text-center mt-1"
          >
            Forgot your password?
          </a>
        </form>
        {(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" || process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "true") && (
          <div className="mt-6 space-y-3 border-t border-divider pt-5">
            <p className="text-center text-xs uppercase tracking-widest text-[#738094]">Or continue with</p>
            {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && (
              <Button type="button" variant="outline" className="min-h-13 w-full rounded-xl border-[#d6dfe8] bg-white text-base text-[#17191c] hover:bg-[#f5f8fa]" onClick={() => void handleSocial("google")} disabled={Boolean(socialLoading) || loading}>
                {socialLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue with Google
              </Button>
            )}
            {process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "true" && (
              <Button type="button" variant="outline" className="min-h-12 w-full rounded-xl border-[#d6dfe8] bg-white text-base text-[#17191c] hover:bg-[#f5f8fa]" onClick={() => void handleSocial("apple")} disabled={Boolean(socialLoading) || loading}>
                {socialLoading === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue with Apple
              </Button>
            )}
          </div>
        )}
        <p className="mt-6 border-t border-divider pt-5 text-center text-xs leading-5 text-cream-faint">Secure access for IMS clients and coaches.</p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
