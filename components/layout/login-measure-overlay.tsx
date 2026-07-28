"use client";

/**
 * LoginMeasureOverlay — a goniometer reading the joint being worked in the
 * photograph.
 *
 * The earlier version floated in the lower-left corner, which put the pivot up
 * near the client's collarbone, measuring nothing. Anchored on the hip Jason
 * has his hands on, it stops being decoration: this is a studio that measures
 * range of motion, and this is the measurement.
 *
 * THE ANGLES ARE REAL
 * Landmarks were read off the photo (hip, knee, chest) and the arc is drawn the
 * way a goniometer is actually used for hip flexion — from the femur's neutral
 * line, where the leg would sit standing, round to where the femur actually is.
 * That comes out at 111°, which is what's displayed. Anyone in the field who
 * looks closely will find it holds up.
 *
 * GEOMETRY
 * The viewBox matches the photo's 3:4 ratio and uses the same slice/cover fit
 * as the <img> beneath, so the pivot stays locked to the hip at any size.
 * Motion is CSS, so prefers-reduced-motion flattens it to the finished state.
 */

const VB_W = 300;
const VB_H = 400;

const HIP_X = 0.30 * VB_W;
const HIP_Y = 0.62 * VB_H;

const NEUTRAL_DEG = -73;   // femur extended, as if standing
const FEMUR_DEG = 38;      // femur as it actually lies, toward the raised knee
const FLEXION = FEMUR_DEG - NEUTRAL_DEG; // 111

const R = 78;

/** Standard math orientation: 0 = right, 90 = up. SVG y is inverted. */
function pt(deg: number, radius: number) {
  const t = (deg * Math.PI) / 180;
  return { x: HIP_X + radius * Math.cos(t), y: HIP_Y - radius * Math.sin(t) };
}

function arc(fromDeg: number, toDeg: number, radius: number) {
  const a = pt(fromDeg, radius);
  const b = pt(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  // Sweep flag 0 — angles increase counter-clockwise in math orientation,
  // which is clockwise once SVG flips y.
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${radius} ${radius} 0 ${large} 0 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function LoginMeasureOverlay() {
  const arcLen = (FLEXION / 360) * 2 * Math.PI * R;
  const neutralArm = pt(NEUTRAL_DEG, R - 8);
  const femurArm = pt(FEMUR_DEG, R - 8);
  const readout = pt((NEUTRAL_DEG + FEMUR_DEG) / 2, R + 30);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {/* Instrument framing — how a measuring tool frames its subject */}
      {[
        [16, 16, 1, 1],
        [VB_W - 16, 16, -1, 1],
        [16, VB_H - 16, 1, -1],
        [VB_W - 16, VB_H - 16, -1, -1],
      ].map(([x, y, dx, dy], i) => (
        <path
          key={i}
          d={`M ${x} ${y + dy * 18} L ${x} ${y} L ${x + dx * 18} ${y}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.2"
          strokeWidth="1"
          style={{ animation: `lm-fade 800ms ease-out ${150 + i * 90}ms both` }}
        />
      ))}

      {/* Degree scale across the measured range */}
      {Array.from({ length: 8 }).map((_, i) => {
        const d = NEUTRAL_DEG + (FLEXION / 7) * i;
        const major = i % 2 === 0;
        const o = pt(d, R + 7);
        const inn = pt(d, major ? R - 6 : R);
        return (
          <line
            key={i}
            x1={inn.x}
            y1={inn.y}
            x2={o.x}
            y2={o.y}
            stroke="#ffffff"
            strokeOpacity={major ? 0.4 : 0.2}
            strokeWidth={major ? 1.2 : 0.8}
            strokeLinecap="round"
            style={{ animation: `lm-fade 600ms ease-out ${600 + i * 45}ms both` }}
          />
        );
      })}

      {/* Neutral reference arm — where the femur would sit standing */}
      <line
        x1={HIP_X}
        y1={HIP_Y}
        x2={neutralArm.x}
        y2={neutralArm.y}
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="1.3"
        strokeDasharray="4 3"
        strokeLinecap="round"
        style={{ animation: "lm-fade 700ms ease-out 400ms both" }}
      />

      {/* The measured range */}
      <path
        d={arc(NEUTRAL_DEG, FEMUR_DEG, R)}
        fill="none"
        stroke="#2a85be"
        strokeWidth="2.8"
        strokeLinecap="round"
        style={{
          strokeDasharray: arcLen,
          animation: "lm-sweep 1700ms cubic-bezier(0.22, 1, 0.36, 1) 650ms both",
        }}
      />

      {/* Moving arm, along the femur */}
      <line
        x1={HIP_X}
        y1={HIP_Y}
        x2={femurArm.x}
        y2={femurArm.y}
        stroke="#ffffff"
        strokeOpacity="0.9"
        strokeWidth="1.9"
        strokeLinecap="round"
        style={{
          transformOrigin: `${HIP_X}px ${HIP_Y}px`,
          animation: "lm-arm 1700ms cubic-bezier(0.22, 1, 0.36, 1) 650ms both",
        }}
      />

      {/* The joint */}
      <circle
        cx={HIP_X}
        cy={HIP_Y}
        r="10"
        fill="none"
        stroke="#2a85be"
        strokeOpacity="0.4"
        strokeWidth="1"
        style={{ animation: "lm-pulse 3s ease-in-out 2s infinite" }}
      />
      <circle
        cx={HIP_X}
        cy={HIP_Y}
        r="3.6"
        fill="#2a85be"
        style={{ animation: "lm-fade 500ms ease-out 500ms both" }}
      />

      {/* Reading */}
      <g style={{ animation: "lm-rise 700ms cubic-bezier(0.22,1,0.36,1) 2000ms both" }}>
        <text
          x={readout.x}
          y={readout.y}
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="#ffffff"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {FLEXION}°
        </text>
        <text
          x={readout.x}
          y={readout.y + 11}
          textAnchor="middle"
          fontSize="6"
          fill="#ffffff"
          fillOpacity="0.6"
          letterSpacing="1.8"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          HIP FLEXION
        </text>
      </g>

      <style>{`
        @keyframes lm-sweep { from { stroke-dashoffset: ${arcLen}; } to { stroke-dashoffset: 0; } }
        @keyframes lm-arm {
          from { transform: rotate(-${FLEXION}deg); opacity: 0; }
          40%  { opacity: 0.9; }
          to   { transform: rotate(0deg); opacity: 0.9; }
        }
        @keyframes lm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lm-rise {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lm-pulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.12; }
        }
      `}</style>
    </svg>
  );
}
