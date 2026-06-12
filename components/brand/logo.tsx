import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The real IMS wordmark — the interlocked iMS letterforms from the brand
 * (blue fill, fine dark outline), extracted from brand collateral.
 *
 * Assets live in /public/brand/:
 *   ims-mark.png       — wordmark only (466×295)
 *   ims-logo-full.png  — wordmark + "Innovative Movement Solutions" tagline
 *
 * Replace those PNGs with the master SVG/PNG export whenever available —
 * nothing else needs to change.
 */

const RATIO_MARK = 295 / 466;
const RATIO_FULL = 341 / 466;

interface LogoProps {
  /** Rendered width in px. Height derives from the asset's aspect ratio. */
  width?: number;
  /** Include the "Innovative Movement Solutions" tagline under the mark. */
  withTagline?: boolean;
  className?: string;
  priority?: boolean;
}

export function Logo({
  width = 72,
  withTagline = false,
  className,
  priority = false,
}: LogoProps) {
  const src = withTagline ? "/brand/ims-logo-full.png" : "/brand/ims-mark.png";
  const ratio = withTagline ? RATIO_FULL : RATIO_MARK;
  return (
    <Image
      src={src}
      alt="IMS — Innovative Movement Solutions"
      width={width}
      height={Math.round(width * ratio)}
      priority={priority}
      className={cn("select-none", className)}
    />
  );
}
