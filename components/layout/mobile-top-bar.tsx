"use client";

import Link from "next/link";

/**
 * MobileTopBar — the near-black brand band, mobile only.
 *
 * Desktop has the sidebar for identity and framing; phones had nothing, which
 * left every screen as a single pale field. imsmethod.com sits its white
 * content between a dark header and a dark footer — this is that structure:
 * dark band above, dark tab bar below, white cards on tinted ground between.
 */
export function MobileTopBar({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="band no-print lg:hidden sticky top-0 z-30 border-b border-divider">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span
            className="text-xl leading-none"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--color-band-ink)" }}
          >
            iMS
          </span>
          <span
            className="text-[9px] uppercase"
            style={{ letterSpacing: "0.2em", color: "var(--color-band-dim)" }}
          >
            {subtitle ?? "Coach OS"}
          </span>
        </Link>
        {title && (
          <span
            className="text-[11px] uppercase"
            style={{ letterSpacing: "0.14em", color: "var(--color-band-dim)" }}
          >
            {title}
          </span>
        )}
      </div>
    </header>
  );
}
