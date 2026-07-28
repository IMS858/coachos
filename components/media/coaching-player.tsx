"use client";

import { useEffect, useRef, useState } from "react";
import { Repeat, Gauge } from "lucide-react";

/**
 * Player built for movement review rather than watching content.
 *
 * Two controls that matter and aren't in a stock <video>:
 *
 *   Speed — a CAR or a hinge cue happens too fast at 1x to check joint
 *   position. Quarter and half speed are how you actually see it.
 *
 *   Loop — mobility drills are repetitive by nature, and a client copying a
 *   movement wants it to run again without reaching for the phone mid-rep.
 *
 * Native controls stay on for scrubbing, volume and fullscreen; these sit
 * alongside rather than replacing them.
 */

const SPEEDS = [0.25, 0.5, 1] as const;

export function CoachingPlayer({
  src,
  poster,
  title,
}: {
  src: string;
  poster?: string | null;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [loop, setLoop] = useState(true);

  // playbackRate resets whenever the source changes, so reassert it.
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed, src]);

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        autoPlay
        // metadata + poster means the frame appears instantly and playback
        // starts on the first buffered chunk rather than a finished download.
        preload="metadata"
        loop={loop}
        aria-label={title}
        className="w-full rounded-lg bg-black"
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
        }}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-divider bg-navy-elev p-1">
          <Gauge className="h-3.5 w-3.5 text-cream-faint ml-1.5" aria-hidden="true" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`tabular rounded px-2 py-1 text-xs transition-colors ${
                speed === s
                  ? "bg-sky text-white font-semibold"
                  : "text-cream-dim hover:text-cream"
              }`}
            >
              {s === 1 ? "1x" : `${s}x`}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLoop((v) => !v)}
          aria-pressed={loop}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
            loop
              ? "border-sky bg-sky/10 text-sky"
              : "border-divider text-cream-dim hover:text-cream"
          }`}
        >
          <Repeat className="h-3.5 w-3.5" />
          Loop
        </button>

        {speed < 1 && (
          <span className="text-xs text-cream-faint">
            Slowed down — watch the joint, not the rep.
          </span>
        )}
      </div>
    </div>
  );
}
