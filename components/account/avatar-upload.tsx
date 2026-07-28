"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * A client's own profile photo. Uploaded straight to the public `avatars`
 * bucket under their own user id, which is the only folder storage policy
 * lets them write to.
 *
 * capture="user" opens the front camera on a phone, so this is a two-tap
 * selfie rather than a file-picker expedition.
 */
export function AvatarUpload({
  userId,
  initialUrl,
  name,
}: {
  userId: string;
  initialUrl: string | null;
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5MB.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // Timestamp in the name busts any cached copy of the previous photo.
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);

      const res = await fetch("/api/account/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: data.publicUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Couldn't save the photo.");
      }

      setUrl(data.publicUrl);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div className="h-20 w-20 rounded-full overflow-hidden bg-navy-elev border border-divider flex items-center justify-center">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : initials ? (
            <span
              className="text-2xl text-cream-faint"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
            >
              {initials}
            </span>
          ) : (
            <User className="h-7 w-7 text-cream-faint" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Change photo"
          className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-sky text-white flex items-center justify-center border-2 border-navy-soft"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-cream">Your photo</p>
        <p className="prose-ims text-xs text-cream-dim mt-0.5">
          Helps Jason and the team recognise you. Optional.
        </p>
        {error && <p className="text-xs text-status-limited mt-1">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
    </div>
  );
}
