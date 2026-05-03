"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

const WAIVERS = [
  {
    type: "liability" as const,
    title: "Liability Waiver & Release",
    body: `I, the undersigned, acknowledge that participation in physical training, mobility coaching, Pilates, recovery services, and related activities at Innovative Movement Solutions ("IMS") involves inherent risk of injury, including muscle strain, joint injury, and other physical harm.

I voluntarily assume full responsibility for any risks of loss, property damage, or personal injury, including death, that may be sustained as a result of participating in any IMS activity.

I certify that I am physically able to participate in the IMS programs and have disclosed to IMS any medical conditions, medications, or limitations that may affect my participation. I agree to inform IMS immediately of any changes to my health status.

I release, waive, and discharge IMS, its owners, employees, contractors, and agents from any and all liability, claims, demands, or causes of action that I may have arising out of my participation, except in cases of gross negligence or willful misconduct.

This waiver shall be governed by the laws of the State of California. If any provision is found unenforceable, the remaining provisions shall remain in full effect.

I am 18 years or older, or I am the parent/legal guardian of a minor participant.`,
    required: true,
  },
  {
    type: "photo_release" as const,
    title: "Photo & Video Release",
    body: `I grant IMS permission to photograph and video record me during sessions and to use those images and recordings in:
- IMS social media posts (Instagram, Facebook, YouTube, etc.)
- IMS marketing materials (website, brochures, advertisements)
- IMS internal training and case study materials

I understand:
- I will not be identified by full name without my additional written consent.
- I may revoke this release at any time by emailing jason@imsmethod.com. Revocation applies to future use only — content already published may remain in circulation.
- I will not receive compensation for the use of my image.

This release is optional. Declining will not affect my training experience.`,
    required: false,
  },
  {
    type: "telehealth" as const,
    title: "Telehealth & Remote Coaching Consent",
    body: `From time to time, IMS may offer remote coaching sessions or follow-up consultations conducted via video call, phone, or asynchronous messaging.

I acknowledge:
- Remote coaching is not a substitute for in-person assessment when physical evaluation is needed.
- Communication via video/phone has inherent privacy limitations. IMS uses standard secure platforms but cannot guarantee absolute confidentiality.
- IMS coaches are not licensed medical providers. Any coaching guidance is educational and motivational, not medical advice.

I consent to receive remote coaching services from IMS as part of my membership or program engagement.`,
    required: false,
  },
];

interface WaiverFlowProps {
  token: string;
  clientId: string;
}

export function WaiverFlow({ token, clientId }: WaiverFlowProps) {
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const allRequiredDone = WAIVERS.every(
    (w) => !w.required || signed[w.type]
  );

  async function finalize() {
    setSubmitting(true);

    const res = await fetch("/api/intake/waivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        clientId,
        waivers: signed,
      }),
    });

    if (res.ok) {
      router.push(`/intake/${token}/done`);
    } else {
      setSubmitting(false);
      alert("Failed to submit waivers. Please try again.");
    }
  }

  if (currentIdx >= WAIVERS.length) {
    return (
      <div className="rounded-xl bg-white border border-line p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-status-optimal mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-navy mb-2">
          All set
        </h2>
        <p className="text-sm text-navy/60 mb-6">
          {Object.keys(signed).length} waiver
          {Object.keys(signed).length === 1 ? "" : "s"} signed.
        </p>
        <button
          type="button"
          onClick={finalize}
          disabled={submitting || !allRequiredDone}
          className="rounded-md bg-sky text-white text-sm font-medium px-6 py-3 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Finish & complete intake"
          )}
        </button>
      </div>
    );
  }

  const waiver = WAIVERS[currentIdx]!;
  const isSigned = !!signed[waiver.type];

  return (
    <div>
      <div className="mb-6">
        <span className="text-xs font-medium uppercase tracking-wider text-navy/60">
          Waiver {currentIdx + 1} of {WAIVERS.length}
        </span>
      </div>

      <div className="rounded-xl bg-white border border-line p-6">
        <h2 className="text-xl font-semibold text-navy mb-1">{waiver.title}</h2>
        <p className="text-xs text-navy/60 mb-4">
          {waiver.required ? "Required" : "Optional"}
        </p>

        <ScrollableWaiverText body={waiver.body} />

        {!isSigned ? (
          <SignaturePad
            onComplete={(dataUrl) =>
              setSigned((prev) => ({ ...prev, [waiver.type]: dataUrl }))
            }
          />
        ) : (
          <div className="mt-4 rounded-md border border-status-optimal/30 bg-status-optimal/10 p-3 flex items-center gap-2 text-sm text-status-optimal">
            <CheckCircle2 className="h-4 w-4" />
            Signed
          </div>
        )}

        <div className="mt-6 flex justify-between gap-3">
          {!waiver.required && !isSigned && (
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => i + 1)}
              className="text-sm text-navy/60 hover:text-navy"
            >
              Skip (optional)
            </button>
          )}
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => i + 1)}
            disabled={waiver.required && !isSigned}
            className="ml-auto rounded-md bg-navy text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
          >
            {currentIdx === WAIVERS.length - 1 ? "Review" : "Next waiver"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScrollableWaiverText({ body }: { body: string }) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  return (
    <div>
      <div
        className="h-64 overflow-y-auto rounded-md border border-line bg-paper p-4 text-xs leading-relaxed text-navy/80 whitespace-pre-wrap"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
            setScrolledToEnd(true);
          }
        }}
      >
        {body}
      </div>
      {!scrolledToEnd && (
        <p className="text-xs text-navy/50 italic mt-2">
          Scroll to the bottom to enable signature.
        </p>
      )}
      {scrolledToEnd && (
        <p className="text-xs text-status-optimal mt-2">✓ You've reached the end</p>
      )}
    </div>
  );
}

/* ------------------------------ SIGNATURE PAD ------------------------------- */

function SignaturePad({ onComplete }: { onComplete: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0]!.clientX - rect.left,
        y: e.touches[0]!.clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b1e31";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function commit() {
    if (!hasInk) return;
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onComplete(dataUrl);
  }

  return (
    <div className="mt-4">
      <p className="text-xs text-navy/70 mb-2">
        Sign below with your finger or mouse:
      </p>
      <canvas
        ref={canvasRef}
        width={520}
        height={140}
        className="w-full h-32 rounded-md border border-line bg-paper touch-none cursor-crosshair"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="mt-2 flex gap-2 justify-end">
        <button
          type="button"
          onClick={clear}
          className="text-xs text-navy/60 hover:text-navy"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!hasInk}
          className="rounded-md bg-navy text-white text-xs font-medium px-4 py-1.5 disabled:opacity-50"
        >
          Confirm signature
        </button>
      </div>
    </div>
  );
}
