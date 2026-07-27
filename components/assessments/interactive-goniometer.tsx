"use client";

import { useCallback, useRef, useState } from "react";

/**
 * InteractiveGoniometer — drag the arm to the range you measured.
 *
 * Replaces typing "120°" into a box with the instrument itself. The shaded band
 * is the typical range for that joint, so you can see at a glance whether the
 * client is inside or outside it without remembering the number.
 *
 * Pointer, touch and keyboard (arrow keys) all drive the same value.
 */

const VB_W = 260;
const VB_H = 152;
const CX = 130;
const CY = 128;
const R = 108;

function pointAt(deg: number, radius: number) {
  const t = (Math.max(0, Math.min(180, deg)) * Math.PI) / 180;
  return { x: CX - radius * Math.cos(t), y: CY - radius * Math.sin(t) };
}

function arcPath(fromDeg: number, toDeg: number, radius: number) {
  const a = pointAt(fromDeg, radius);
  const b = pointAt(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function InteractiveGoniometer({
  value,
  onChange,
  normalRange,
  label,
}: {
  /** Degrees as a string, e.g. "120". Empty means not yet measured. */
  value: string;
  onChange: (degrees: string) => void;
  /** [min, max] typical range for this joint, shaded on the arc. */
  normalRange?: [number, number];
  label?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const parsed = parseFloat(value.replace(/[^\d.]/g, ""));
  const deg = Number.isFinite(parsed) ? Math.max(0, Math.min(180, parsed)) : null;
  const shown = deg ?? 0;
  const measured = deg !== null;

  const inNormal =
    measured && normalRange
      ? shown >= normalRange[0] && shown <= normalRange[1]
      : null;

  const degFromPointer = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    // The viewBox scales uniformly, so screen-space angle equals SVG-space angle.
    const pivotX = rect.left + (CX / VB_W) * rect.width;
    const pivotY = rect.top + (CY / VB_H) * rect.height;
    const dx = clientX - pivotX;
    const dy = clientY - pivotY;
    const d = 180 - (Math.atan2(-dy, dx) * 180) / Math.PI;
    return Math.round(Math.max(0, Math.min(180, d)));
  }, []);

  function handlePointer(e: React.PointerEvent) {
    const d = degFromPointer(e.clientX, e.clientY);
    if (d !== null) onChange(String(d));
  }

  function handleKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = shown - step;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = shown + step;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = 180;
    if (next !== null) {
      e.preventDefault();
      onChange(String(Math.round(Math.max(0, Math.min(180, next)))));
    }
  }

  const handle = pointAt(shown, R);
  const arm = pointAt(shown, R - 8);
  const normalArc = normalRange ? arcPath(normalRange[0], normalRange[1], R) : null;

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full max-w-[300px] touch-none cursor-pointer"
        role="slider"
        tabIndex={0}
        aria-label={label ? `${label} range of motion in degrees` : "Range of motion in degrees"}
        aria-valuemin={0}
        aria-valuemax={180}
        aria-valuenow={shown}
        aria-valuetext={measured ? `${shown} degrees` : "not measured"}
        onKeyDown={handleKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          handlePointer(e);
        }}
        onPointerMove={(e) => dragging && handlePointer(e)}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {/* Typical range for this joint */}
        {normalArc && (
          <path
            d={normalArc}
            fill="none"
            stroke="var(--color-status-optimal)"
            strokeWidth="12"
            strokeLinecap="butt"
            opacity="0.16"
          />
        )}

        {/* Scale — every 15°, longer every 45° */}
        {Array.from({ length: 13 }).map((_, i) => {
          const d = i * 15;
          const outer = pointAt(d, R + 7);
          const inner = pointAt(d, d % 45 === 0 ? R - 9 : R - 2);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--color-divider)"
              strokeWidth={d % 45 === 0 ? 1.75 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Labels at 0 / 90 / 180 */}
        {[0, 90, 180].map((d) => {
          const p = pointAt(d, R + 20);
          return (
            <text
              key={d}
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-cream-faint)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {d}°
            </text>
          );
        })}

        <path
          d={arcPath(0, 180, R)}
          fill="none"
          stroke="var(--color-divider)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {measured && (
          <path
            d={arcPath(0, shown, R)}
            fill="none"
            stroke="var(--color-sky-light)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}

        {/* Arm */}
        <line
          x1={CX}
          y1={CY}
          x2={arm.x}
          y2={arm.y}
          stroke={measured ? "var(--color-ink)" : "var(--color-cream-faint)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={measured ? undefined : "4 4"}
        />
        {/* Fixed reference arm along 0° */}
        <line
          x1={CX}
          y1={CY}
          x2={CX - (R - 8)}
          y2={CY}
          stroke="var(--color-cream-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Drag handle */}
        <circle
          cx={handle.x}
          cy={handle.y}
          r={dragging ? 11 : 9}
          fill="var(--color-sky)"
          stroke="#fff"
          strokeWidth="2.5"
        />
        <circle cx={CX} cy={CY} r="5" fill="var(--color-ink)" />
      </svg>

      <div className="flex items-baseline gap-2 -mt-1">
        <span
          className="tabular text-2xl"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            color: measured ? "var(--color-ink)" : "var(--color-cream-faint)",
          }}
        >
          {measured ? `${shown}°` : "—"}
        </span>
        {normalRange && (
          <span
            className="text-[11px]"
            style={{
              color:
                inNormal === null
                  ? "var(--color-cream-faint)"
                  : inNormal
                    ? "var(--color-status-optimal)"
                    : "var(--color-status-moderate)",
            }}
          >
            {inNormal === null
              ? `typical ${normalRange[0]}–${normalRange[1]}°`
              : inNormal
                ? "within typical range"
                : `below typical (${normalRange[0]}–${normalRange[1]}°)`}
          </span>
        )}
      </div>

      {measured && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[11px] text-cream-faint hover:text-sky mt-0.5"
        >
          clear
        </button>
      )}
    </div>
  );
}
