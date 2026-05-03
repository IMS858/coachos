"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Play, FileText, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Exercise {
  id: string;
  name: string;
  ims_label: string | null;
  slug: string;
  category: string;
  movement_pattern: string;
  level: string;
  primary_joints: string[];
  equipment: string[];
  load_descriptors: string[];
  system_tags: string[];
  status: string;
  client_visible: boolean;
  video_provider: string;
  video_id: string | null;
  thumbnail_url: string | null;
  is_favorite: boolean;
  coaching_cues: string[];
}

interface Props {
  exercises: Exercise[];
  isStaff: boolean;
}

export function LibraryGrid({ exercises, isStaff }: Props) {
  if (exercises.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-sm text-cream-faint italic">
            No exercises match those filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {exercises.map((ex) => (
        <ExerciseCard key={ex.id} exercise={ex} isStaff={isStaff} />
      ))}
    </div>
  );
}

function ExerciseCard({ exercise, isStaff }: { exercise: Exercise; isStaff: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [favorited, setFavorited] = useState(exercise.is_favorite);
  const [favoriting, setFavoriting] = useState(false);

  // Detect if cues still have placeholder text
  const hasPlaceholderCues = exercise.coaching_cues.some((c) =>
    c.includes("[JASON: rewrite]")
  );

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favoriting) return;
    setFavoriting(true);
    const next = !favorited;
    setFavorited(next);
    const res = await fetch(`/api/exercises/${exercise.id}/favorite`, {
      method: next ? "POST" : "DELETE",
    });
    if (!res.ok) {
      setFavorited(!next); // roll back
    }
    setFavoriting(false);
    startTransition(() => router.refresh());
  }

  return (
    <Link
      href={`/library/${exercise.slug}`}
      className="group block rounded-md border border-divider bg-navy-deep hover:border-sky/60 hover:bg-navy-elev transition-colors overflow-hidden"
    >
      {/* Thumbnail / video preview area */}
      <div className="relative aspect-video bg-gradient-to-br from-navy-elev to-navy-deep border-b border-divider flex items-center justify-center">
        {exercise.thumbnail_url ? (
          <img
            src={exercise.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-cream-faint flex flex-col items-center gap-2">
            <Play className="h-8 w-8 opacity-40" />
            <span className="text-xs">
              {exercise.video_id ? "Tap to view" : "Video pending"}
            </span>
          </div>
        )}

        {/* Status pill (drafts only) */}
        {exercise.status === "draft" && (
          <div className="absolute top-2 left-2">
            <Badge tone="moderate">Draft</Badge>
          </div>
        )}

        {/* Favorite */}
        {isStaff && (
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favoriting}
            className={`absolute top-2 right-2 p-1.5 rounded-full bg-navy-deep/80 backdrop-blur-sm transition-colors ${
              favorited
                ? "text-status-moderate"
                : "text-cream-faint hover:text-cream"
            }`}
            title={favorited ? "Remove from favorites" : "Save to favorites"}
            aria-label="Toggle favorite"
          >
            <Star className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <div>
          <div className="font-medium text-cream truncate">
            {exercise.ims_label || exercise.name}
          </div>
          {exercise.ims_label && (
            <div className="text-xs text-cream-faint truncate">
              {exercise.name}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge tone={categoryTone(exercise.category)}>
            {capitalize(exercise.category)}
          </Badge>
          {exercise.movement_pattern !== "none" && (
            <span className="text-xs text-cream-faint">
              {prettyPattern(exercise.movement_pattern)}
            </span>
          )}
        </div>

        {/* Subtle staff-only signal that cues need writing */}
        {isStaff && hasPlaceholderCues && (
          <div className="flex items-center gap-1 text-xs text-status-limited">
            <AlertCircle className="h-3 w-3" />
            Cues need rewriting
          </div>
        )}
      </div>
    </Link>
  );
}

function categoryTone(category: string): "sky" | "optimal" | "moderate" | "limited" | "neutral" {
  switch (category) {
    case "mobility": return "sky";
    case "strength": return "optimal";
    case "corrective": return "moderate";
    case "conditioning": return "limited";
    case "recovery": return "neutral";
    default: return "neutral";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettyPattern(p: string): string {
  return p.split("_").map(capitalize).join(" ");
}
