"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Exercise {
  id: string;
  name: string;
  ims_label: string | null;
  slug: string;
  status: string;
  client_visible: boolean;
  coaching_cues: string[];
  common_mistakes: string[];
  programming_notes: string | null;
  contraindications: string | null;
  video_provider: string;
  video_id: string | null;
  thumbnail_url: string | null;
}

export function ExerciseEditForm({ exercise }: { exercise: Exercise }) {
  const router = useRouter();

  const [imsLabel, setImsLabel] = useState(exercise.ims_label ?? "");
  const [cues, setCues] = useState((exercise.coaching_cues ?? []).join("\n"));
  const [mistakes, setMistakes] = useState(
    (exercise.common_mistakes ?? []).join("\n")
  );
  const [programmingNotes, setProgrammingNotes] = useState(
    exercise.programming_notes ?? ""
  );
  const [contraindications, setContraindications] = useState(
    exercise.contraindications ?? ""
  );
  const [videoProvider, setVideoProvider] = useState(exercise.video_provider);
  const [videoId, setVideoId] = useState(exercise.video_id ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(exercise.thumbnail_url ?? "");
  const [status, setStatus] = useState(exercise.status);
  const [clientVisible, setClientVisible] = useState(exercise.client_visible);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const cuesArr = cues.split("\n").map((c) => c.trim()).filter(Boolean);
    const mistakesArr = mistakes.split("\n").map((m) => m.trim()).filter(Boolean);

    const res = await fetch(`/api/exercises/${exercise.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ims_label: imsLabel || null,
        coaching_cues: cuesArr,
        common_mistakes: mistakesArr,
        programming_notes: programmingNotes || null,
        contraindications: contraindications || null,
        video_provider: videoProvider,
        video_id: videoId || null,
        thumbnail_url: thumbnailUrl || null,
        status,
        client_visible: clientVisible,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setMessage("Saved.");
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Save failed");
    }
  }

  const cueLines = cues.split("\n").filter((l) => l.trim());
  const placeholderCount = cueLines.filter((l) =>
    l.includes("[JASON: rewrite]")
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Publish state — top, important */}
      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>
            Drafts are trainer-only. Set to "Published" + "Client visible" to
            release for clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Status</Label>
            <div className="grid grid-cols-3 gap-2">
              {["draft", "published", "archived"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-md border py-2 text-sm font-medium capitalize transition-colors ${
                    status === s
                      ? "border-sky bg-sky/10 text-cream"
                      : "border-divider text-cream-dim hover:border-cream-faint"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={clientVisible}
              onChange={(e) => setClientVisible(e.target.checked)}
              className="rounded border-divider bg-navy-deep"
            />
            <div className="flex items-center gap-2">
              {clientVisible ? (
                <Eye className="h-4 w-4 text-status-optimal" />
              ) : (
                <EyeOff className="h-4 w-4 text-cream-faint" />
              )}
              <span className="text-sm">
                {clientVisible
                  ? "Visible to clients on their dashboards"
                  : "Hidden from clients (trainer-only)"}
              </span>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Naming */}
      <Card>
        <CardHeader>
          <CardTitle>Naming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Generic name</Label>
            <Input value={exercise.name} disabled />
            <p className="text-xs text-cream-faint mt-1">
              The textbook name. Used in search. Edit via Supabase if needed.
            </p>
          </div>
          <div>
            <Label>IMS label</Label>
            <Input
              value={imsLabel}
              onChange={(e) => setImsLabel(e.target.value)}
              placeholder='e.g. "Hip Controlled Articular Rotations"'
            />
            <p className="text-xs text-cream-faint mt-1">
              Jason's coaching name. Shown to clients and in programs.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cues */}
      <Card>
        <CardHeader>
          <CardTitle>Coaching cues</CardTitle>
          <CardDescription>
            One cue per line. Keep them short and specific.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={cues}
            onChange={(e) => setCues(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-y font-mono"
            placeholder="Drive knees out over toes&#10;Spread the floor with your feet&#10;Keep ribs down"
          />
          {placeholderCount > 0 && (
            <p className="text-xs text-status-limited mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {placeholderCount} placeholder cue{placeholderCount === 1 ? "" : "s"} still need rewriting
            </p>
          )}
        </CardContent>
      </Card>

      {/* Mistakes */}
      <Card>
        <CardHeader>
          <CardTitle>Common mistakes</CardTitle>
          <CardDescription>
            One per line. What to look for and call out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={mistakes}
            onChange={(e) => setMistakes(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-y"
          />
        </CardContent>
      </Card>

      {/* Programming notes */}
      <Card>
        <CardHeader>
          <CardTitle>Programming notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={programmingNotes}
            onChange={(e) => setProgrammingNotes(e.target.value)}
            rows={3}
            placeholder="When to use this exercise, common rep schemes, regression cues."
            className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-y"
          />
        </CardContent>
      </Card>

      {/* Contraindications */}
      <Card>
        <CardHeader>
          <CardTitle>Contraindications</CardTitle>
          <CardDescription>
            Conditions where this exercise needs adjustment or substitution. Be
            specific. Always defer to the client's clinical care team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={contraindications}
            onChange={(e) => setContraindications(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-y"
          />
        </CardContent>
      </Card>

      {/* Video */}
      <Card>
        <CardHeader>
          <CardTitle>Video</CardTitle>
          <CardDescription>
            Bunny Stream is the production target. Paste the GUID, not the full URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Provider</Label>
            <div className="grid grid-cols-3 gap-2">
              {["bunny", "youtube", "placeholder"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setVideoProvider(p)}
                  className={`rounded-md border py-2 text-sm font-medium capitalize transition-colors ${
                    videoProvider === p
                      ? "border-sky bg-sky/10 text-cream"
                      : "border-divider text-cream-dim hover:border-cream-faint"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {videoProvider === "bunny" && (
            <div>
              <Label>Bunny Stream GUID</Label>
              <Input
                value={videoId}
                onChange={(e) => setVideoId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono"
              />
              <p className="text-xs text-cream-faint mt-1">
                Find this in the Bunny dashboard after upload.
              </p>
            </div>
          )}

          <div>
            <Label>Thumbnail URL (optional)</Label>
            <Input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      {error && (
        <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-4 py-3 text-sm text-status-limited flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-status-optimal/30 bg-status-optimal/10 px-4 py-3 text-sm text-status-optimal flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
      {children}
    </label>
  );
}
