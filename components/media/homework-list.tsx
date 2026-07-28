"use client";

import { useState } from "react";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import { CoachingPlayer } from "@/components/media/coaching-player";
import { formatDuration } from "@/lib/video";

type Item = {
  id: string;
  kind: string;
  category: string;
  title: string;
  note: string | null;
  created_at: string;
  viewed_at: string | null;
  duration_seconds: number | null;
  poster_url?: string | null;
  exercise_id?: string | null;
  external_url?: string | null;
  cues?: string[] | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  mobility: "Mobility",
  strength: "Strength",
  conditioning: "Conditioning",
  general: "General",
};

/**
 * A client's coaching videos. The signed URL is fetched only when they press
 * play — so opening the page doesn't mint a batch of URLs, and nothing is
 * fetched over cellular until they actually want to watch.
 */
export function HomeworkList({ items }: { items: Item[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  async function play(item: Item) {
    if (openId === item.id) {
      setOpenId(null);
      setUrl(null);
      setPoster(null);
      return;
    }
    setLoading(item.id);
    setError(null);
    try {
      // Library exercises carry their own URL; only uploads need signing.
      if (item.external_url) {
        setUrl(item.external_url);
        setPoster(item.poster_url ?? null);
        setOpenId(item.id);
        setSeen((s) => new Set(s).add(item.id));
        void fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "watch",
            path: "/plan",
            meta: { media_id: item.id, title: item.title },
          }),
        }).catch(() => {});
        setLoading(null);
        return;
      }
      const res = await fetch(`/api/media/${item.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load.");
      setUrl(data.url);
      setPoster(data.poster ?? null);
      setOpenId(item.id);
      setSeen((s) => new Set(s).add(item.id));
      // Watching homework is the engagement signal worth tracking.
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "watch",
          path: "/plan",
          meta: { media_id: item.id, title: item.title },
        }),
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    } finally {
      setLoading(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-status-limited">{error}</p>}
      {items.map((item) => {
        const watched = item.viewed_at || seen.has(item.id);
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-lg border border-divider bg-navy-soft overflow-hidden"
          >
            <button
              onClick={() => play(item)}
              className="w-full flex items-start gap-3 p-4 text-left"
            >
              <div className="relative h-14 w-20 rounded-lg overflow-hidden bg-navy-elev shrink-0 flex items-center justify-center">
                {item.poster_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.poster_url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/25" />
                  </>
                ) : null}
                <div className="relative">
                  {loading === item.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : watched ? (
                    <CheckCircle2
                      className={`h-5 w-5 ${item.poster_url ? "text-white" : "text-status-optimal"}`}
                    />
                  ) : (
                    <Play
                      className={`h-5 w-5 ${item.poster_url ? "text-white" : "text-sky"}`}
                      fill="currentColor"
                    />
                  )}
                </div>
                {item.duration_seconds ? (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[10px] text-white tabular">
                    {formatDuration(item.duration_seconds)}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-cream font-medium">{item.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-sky">
                    {CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                </div>
                {item.note && (
                  <p className="prose-ims text-sm text-cream-dim mt-1">{item.note}</p>
                )}
                {item.cues && item.cues.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {item.cues.slice(0, 3).map((c, i) => (
                      <li key={i} className="prose-ims text-xs text-cream-faint">
                        · {c}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-cream-faint mt-1">
                  {new Date(item.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {watched ? " · watched" : ""}
                </p>
              </div>
            </button>

            {isOpen && url && (
              <div className="px-4 pb-4">
                {item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={item.title} className="w-full rounded-lg" />
                ) : (
                  <CoachingPlayer src={url} poster={poster} title={item.title} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
