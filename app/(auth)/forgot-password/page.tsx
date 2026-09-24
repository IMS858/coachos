"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Request failed");
      setSent(true);
    } catch {
      setError("We couldn’t submit your request. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Reset password</CardTitle>
        <CardDescription className="text-center">
          Enter your email and we&apos;ll send you a secure link to set a new
          password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <MailCheck className="h-10 w-10 text-sky" />
            <p className="text-sm text-cream">
              If that email has an account, a reset link is on its way. Check
              your inbox (and spam folder).
            </p>
            <Link
              href="/login"
              className="text-sm text-sky hover:underline mt-2 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
            {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
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
                className="h-12 rounded-xl border-[#d6dfe8] bg-white px-4 text-base text-[#17191c]"
                className="h-12 rounded-xl border-[#d6dfe8] bg-white px-4 text-base text-[#17191c] placeholder:text-[#8492a3]"
              />
            </div>
            <Button type="submit" disabled={loading || !email.includes("@")} className="mt-2 min-h-12 rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
            </Button>
            <Link
              href="/login"
              className="text-xs text-cream-faint hover:text-cream text-center mt-1 inline-flex items-center justify-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
