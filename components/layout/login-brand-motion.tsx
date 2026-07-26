"use client";

/**
 * LoginBrandMotion — the IMS goniometer, drawn once on load.
 *
 * imsmethod.com opens with a goniometer sweeping 0–132°; this is the same
 * gesture, so the app's front door and the site's front door read as one
 * brand. Rendered in SVG rather than as a video: it's a few kilobytes, sharp
 * at any size, and can't look uncanny.
 *
 * Motion is pure CSS, so the global prefers-reduced-motion rule flattens it to
 * the finished state for anyone who has asked for less movement.
 */

const CX = 120;
const CY = 300;
const R = 210;
const SWEEP = 132; // degrees — matches the site's hero

function pointAt(deg: number, radius: number) {
  const t = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(t - Math.PI / 2), y: CY + radius * Math.sin(t - Math.PI / 2) };
}

function arcTo(deg: number, radius: number) {
  const start = pointAt(0, radius);
  const end = pointAt(deg, radius);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 ${deg > 180 ? 1 : 0} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

export function LoginBrandMotion() {
  const arcLen = (SWEEP / 360) * 2 * Math.PI * R;
  const arm = pointAt(SWEEP, R - 16);
  const ref = pointAt(0, R - 16);

  return (
    <svg
      viewBox="0 0 420 520"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMinYMax slice"
    >
      {/* Degree scale */}
      {Array.from({ length: 10 }).map((_, i) => {
        const d = i * 15;
        const outer = pointAt(d, R + 9);
        const inner = pointAt(d, d % 45 === 0 ? R - 11 : R - 3);
        return (
          <line
            key={i}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="#ffffff"
            strokeOpacity={d % 45 === 0 ? 0.3 : 0.16}
            strokeWidth={d % 45 === 0 ? 1.6 : 1}
            strokeLinecap="round"
            style={{ animation: `ims-fade 700ms ease-out ${300 + i * 45}ms both` }}
          />
        );
      })}

      {/* Fixed reference arm */}
      <line
        x1={CX}
        y1={CY}
        x2={ref.x}
        y2={ref.y}
        stroke="#ffffff"
        strokeOpacity="0.28"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{ animation: "ims-fade 600ms ease-out 200ms both" }}
      />

      {/* The sweep */}
      <path
        d={arcTo(SWEEP, R)}
        fill="none"
        stroke="#2a85be"
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          strokeDasharray: arcLen,
          animation: "ims-sweep 1500ms cubic-bezier(0.22, 1, 0.36, 1) 350ms both",
        }}
      />

      {/* Moving arm, arriving with the sweep */}
      <line
        x1={CX}
        y1={CY}
        x2={arm.x}
        y2={arm.y}
        stroke="#ffffff"
        strokeOpacity="0.75"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          animation: "ims-arm 1500ms cubic-bezier(0.22, 1, 0.36, 1) 350ms both",
        }}
      />

      <circle
        cx={CX}
        cy={CY}
        r="5"
        fill="#2a85be"
        style={{ animation: "ims-fade 500ms ease-out 250ms both" }}
      />

      <style>{`
        @keyframes ims-sweep {
          from { stroke-dashoffset: ${arcLen}; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes ims-arm {
          from { transform: rotate(-${SWEEP}deg); opacity: 0; }
          60%  { opacity: 0.75; }
          to   { transform: rotate(0deg); opacity: 0.75; }
        }
        @keyframes ims-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
