"use client";

/**
 * Goniometer — the IMS signature readout.
 *
 * A goniometer is the instrument used to measure joint range of motion, so
 * showing progress as an opening angle isn't decoration: it's the studio's own
 * instrument reading the client's own data. Echoes the animated goniometer on
 * imsmethod.com so the app and the site read as one brand.
 *
 * The ghost needle marks the baseline, the solid needle the current value —
 * improvement is literally the angle opening up between them.
 */

const CX = 110;
const CY = 108;
const R = 88;

function pointAt(fraction: number, radius: number) {
  const theta = (Math.max(0, Math.min(1, fraction)) * Math.PI);
  return {
    x: CX - radius * Math.cos(theta),
    y: CY - radius * Math.sin(theta),
  };
}

function arcPath(fraction: number, radius: number) {
  const start = pointAt(0, radius);
  const end = pointAt(fraction, radius);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function Goniometer({
  fraction,
  baselineFraction,
  label,
  value,
  caption,
  tone = "dark",
}: {
  /** 0–1, where the needle points. */
  fraction: number;
  /** 0–1 baseline for the ghost needle. Omit to hide it. */
  baselineFraction?: number | null;
  label: string;
  value: string;
  caption?: string | null;
  tone?: "dark" | "light";
}) {
  const f = Math.max(0, Math.min(1, fraction));
  const track = tone === "dark" ? "var(--color-divider)" : "var(--color-line)";
  const ink = tone === "dark" ? "var(--color-cream)" : "var(--color-ink)";
  const dim = tone === "dark" ? "var(--color-cream-faint)" : "#6b7280";
  const accent = tone === "dark" ? "var(--color-sky)" : "var(--color-sky-deep)";

  const needle = pointAt(f, R - 14);
  const baseNeedle =
    baselineFraction != null ? pointAt(baselineFraction, R - 26) : null;

  // Circumference of a half circle, for the draw-on animation.
  const arcLen = Math.PI * R;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 220 132"
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`${label}: ${value}`}
      >
        {/* Degree ticks every 15° — the instrument's own scale */}
        {Array.from({ length: 13 }).map((_, i) => {
          const tf = i / 12;
          const outer = pointAt(tf, R + 6);
          const inner = pointAt(tf, i % 3 === 0 ? R - 8 : R - 2);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={track}
              strokeWidth={i % 3 === 0 ? 1.75 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Track */}
        <path
          d={arcPath(1, R)}
          fill="none"
          stroke={track}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Measured sweep */}
        <path
          d={arcPath(f, R)}
          fill="none"
          stroke={accent}
          strokeWidth="5"
          strokeLinecap="round"
          style={{
            strokeDasharray: arcLen,
            strokeDashoffset: 0,
            animation: "gonio-sweep 900ms cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        />

        {/* Baseline ghost needle */}
        {baseNeedle && (
          <line
            x1={CX}
            y1={CY}
            x2={baseNeedle.x}
            y2={baseNeedle.y}
            stroke={dim}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        )}

        {/* Current needle */}
        <line
          x1={CX}
          y1={CY}
          x2={needle.x}
          y2={needle.y}
          stroke={ink}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r="5" fill={accent} />
        <circle cx={CX} cy={CY} r="1.75" fill={tone === "dark" ? "var(--color-navy)" : "#fff"} />

        <style>{`
          @keyframes gonio-sweep {
            from { stroke-dashoffset: ${arcLen}; }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
      </svg>

      <div className="text-center -mt-1">
        <div
          className="tabular text-4xl leading-none"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: ink }}
        >
          {value}
        </div>
        <div
          className="text-[11px] uppercase mt-1.5"
          style={{ letterSpacing: "0.16em", color: dim }}
        >
          {label}
        </div>
        {caption && (
          <div className="text-xs mt-1" style={{ color: dim }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
