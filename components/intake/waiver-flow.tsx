"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

const WAIVERS = [
  {
    type: "liability" as const,
    title: "Liability Waiver & Assumption of Risk",
    body: `In consideration for being permitted to participate in services offered by Innovative Movement Solutions ("IMS") — including but not limited to Bod Pod body composition testing, massage therapy, and/or personal training or fitness programs — I, the undersigned, acknowledge and agree to the following.

━━━━━━━━━━━━━━━━━━━━
1. WAIVER OF LIABILITY
━━━━━━━━━━━━━━━━━━━━
I fully understand and acknowledge that these services involve physical exertion, manipulation of the body, and/or exposure to various types of equipment.

I knowingly and voluntarily waive, release, and discharge Innovative Movement Solutions, its owners, employees, agents, contractors, and representatives from any and all claims, demands, damages, rights of action, or causes of action — present or future, whether known or unknown — arising out of or connected with my participation.

This waiver is intended to be as broad and inclusive as permitted under California law, including but not limited to California Civil Code Section 1542, which states:

"A general release does not extend to claims that the creditor or releasing party does not know or suspect to exist in his or her favor at the time of executing the release and that, if known by him or her, would have materially affected his or her settlement with the debtor or released party."

I expressly waive the provisions of Section 1542 and any similar rights under federal or state law.

━━━━━━━━━━━━━━━━━━━━
2. ASSUMPTION OF RISK
━━━━━━━━━━━━━━━━━━━━
I understand and acknowledge that participation in Bod Pod testing, massage therapy, and/or physical training at IMS involves inherent risks, which may include, but are not limited to: physical exertion, allergic reactions, muscle strain, dehydration, stress, changes in body temperature or composition, cardiovascular events, falls, or other potential injuries or medical complications.

I affirm that I am in good physical condition, have disclosed all relevant health issues, and have either received medical clearance or accept full responsibility for any risks.

I understand that IMS does not diagnose, treat, or prevent medical conditions, and that participation is entirely voluntary. I knowingly and voluntarily assume all risks, known or unknown, associated with these services.

━━━━━━━━━━━━━━━━━━━━
3. INDEMNIFICATION & HOLD HARMLESS
━━━━━━━━━━━━━━━━━━━━
To the fullest extent permitted under California law, I agree to indemnify, defend, and hold harmless Innovative Movement Solutions — including its owners, employees, agents, affiliates, successors, and assigns — from and against any and all claims, demands, losses, liabilities, costs, or expenses (including attorneys' fees) arising from or related to my participation in Bod Pod testing, massage therapy, or fitness/training services.

This includes claims arising from the ordinary negligence of IMS, its staff, or contractors, but excludes claims that result from gross negligence or willful misconduct, which cannot be waived under California law.

━━━━━━━━━━━━━━━━━━━━
By signing below, I acknowledge that I have read and understood this entire agreement, that I am 18 years or older (or the parent/legal guardian of a minor participant), and that I agree to the use of electronic records and signatures.`,
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
