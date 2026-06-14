"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Mode = "magic" | "password";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    // Custom magic link: our API generates the link and emails it via Resend
    // (bypasses Supabase's built-in SMTP). Always returns ok to avoid leaking
    // which addresses have accounts.
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      setLoading(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't send the sign-in link. Try again.");
      } else {
        setMessage("Check your email for the sign-in link.");
      }
    } catch {
      setLoading(false);
      setError("Couldn't send the sign-in link. Try again.");
    }
  }

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
          action="#"
          method="post"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "magic") void handleMagicLink(e);
            else void handlePassword(e);
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-cream-dim mb-1.5"
            >
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

          {mode === "password" && (
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-cream-dim mb-1.5"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-md border border-status-optimal/30 bg-status-optimal/10 px-3 py-2 text-sm text-status-optimal">
              {message}
            </div>
          )}

          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "magic" ? (
              <>
                <Mail className="h-4 w-4" />
                Send magic link
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          <button
            type="button"
            className="mt-2 text-xs text-cream-faint hover:text-cream-dim transition-colors"
            onClick={() => {
              setMode(mode === "magic" ? "password" : "magic");
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "magic"
              ? "Use password instead"
              : "Use magic link instead"}
          </button>
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
