"use client";

import { useEffect, useState } from "react";
import { Smartphone, Share, MoreVertical, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Add-to-home-screen, matched to the device.
 *
 * The three platforms genuinely differ, and generic instructions send half the
 * roster hunting for a button that isn't there:
 *
 *   Android/Chrome — fires beforeinstallprompt, so we can capture it and show a
 *                    real Install button that opens the native installer. No
 *                    instructions needed at all.
 *   iOS/Safari     — Apple exposes no install API. Manual Share → Add to Home
 *                    Screen is the only route, so we spell it out.
 *   Desktop        — mostly irrelevant; kept brief.
 *
 * Hidden entirely once installed — nobody needs to be told to install an app
 * they're already inside.
 */

type Platform = "ios" | "android" | "desktop";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports as Macintosh, so touch support is the reliable tell.
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /Android/.test(ua) ? "android" : "desktop");

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setInstalled(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setJustInstalled(true);
    setDeferred(null);
  }

  if (installed) return null;

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex gap-2.5 items-start">
      <span className="shrink-0 h-5 w-5 rounded-full bg-sky/15 text-sky text-[11px] font-semibold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <span className="prose-ims text-sm text-cream-dim">{children}</span>
    </li>
  );

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5">
      <div className="flex items-center gap-2 mb-2">
        <Smartphone className="h-4 w-4 text-sky" />
        <h2 className="text-base font-semibold text-cream">Add to your phone</h2>
      </div>

      {justInstalled ? (
        <p className="text-sm text-status-optimal flex items-center gap-1.5">
          <Check className="h-4 w-4" /> Installed — look for the iMS icon on your
          home screen.
        </p>
      ) : deferred ? (
        <>
          <p className="prose-ims text-sm text-cream-dim mb-3">
            One tap and IMS sits on your home screen like any other app.
          </p>
          <Button size="sm" onClick={install}>
            <Download className="h-4 w-4" /> Install
          </Button>
        </>
      ) : platform === "ios" ? (
        <>
          <p className="prose-ims text-sm text-cream-dim mb-3">
            In <strong>Safari</strong> (it won&apos;t work from Chrome on iPhone):
          </p>
          <ol className="flex flex-col gap-2">
            <Step n={1}>
              Tap the Share button{" "}
              <Share className="inline h-3.5 w-3.5 -mt-0.5" /> at the bottom of
              the screen
            </Step>
            <Step n={2}>
              Scroll down and tap <strong>Add to Home Screen</strong>
            </Step>
            <Step n={3}>
              Tap <strong>Add</strong> — the iMS icon appears on your home screen
            </Step>
          </ol>
        </>
      ) : platform === "android" ? (
        <>
          <p className="prose-ims text-sm text-cream-dim mb-3">
            In <strong>Chrome</strong>:
          </p>
          <ol className="flex flex-col gap-2">
            <Step n={1}>
              Tap the menu <MoreVertical className="inline h-3.5 w-3.5 -mt-0.5" />{" "}
              at the top right
            </Step>
            <Step n={2}>
              Tap <strong>Install app</strong> — or{" "}
              <strong>Add to Home screen</strong> on older versions
            </Step>
            <Step n={3}>
              Confirm, and the iMS icon appears in your app drawer
            </Step>
          </ol>
        </>
      ) : (
        <p className="prose-ims text-sm text-cream-dim">
          Open this page on your phone to add IMS to your home screen. In Chrome
          on a computer, there&apos;s an install icon at the right of the address
          bar.
        </p>
      )}
    </div>
  );
}
