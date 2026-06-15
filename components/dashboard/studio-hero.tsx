"use client";

import { useState } from "react";

/**
 * Studio hero band for the dashboard.
 *
 * Drop a wide photo of the studio at:  public/studio-hero.jpg
 * (any landscape JPG ~1600px wide looks great)
 *
 * If the photo isn't there yet, falls back to a branded gradient,
 * so the dashboard never looks broken.
 */
export function StudioHero({
  greeting,
  subline,
}: {
  greeting: string;
  subline: string;
}) {
  const [hasPhoto, setHasPhoto] = useState(true);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-divider">
      {/* Photo layer (hides itself if studio-hero.jpg missing) */}
      {hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/studio-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setHasPhoto(false)}
        />
      )}

      {/* Gradient — overlay when photo present, full background when not */}
      <div
        className={
          hasPhoto
            ? "absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/30"
            : "absolute inset-0 bg-gradient-to-br from-sky-900/60 via-navy to-navy"
        }
      />

      {/* Subtle accent glow */}
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative px-6 py-8 sm:px-8 sm:py-10">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-cream">
          {greeting}
        </h1>
        <p className="text-sm text-cream-dim mt-1.5">{subline}</p>
      </div>
    </div>
  );
}
