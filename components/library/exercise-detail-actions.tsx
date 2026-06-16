"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star, Plus, Edit3, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToProgramModal } from "@/components/programs/add-to-program-modal";

interface Props {
  exerciseId: string;
  initialFavorite: boolean;
  slug: string;
  isStaff: boolean;
}

export function ExerciseDetailActions({
  exerciseId,
  initialFavorite,
  slug,
  isStaff,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [favorited, setFavorited] = useState(initialFavorite);
  const [favoriting, setFavoriting] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);

  async function toggleFavorite() {
    if (favoriting) return;
    setFavoriting(true);
    const next = !favorited;
    setFavorited(next);
    const res = await fetch(`/api/exercises/${exerciseId}/favorite`, {
      method: next ? "POST" : "DELETE",
    });
    if (!res.ok) setFavorited(!next);
    setFavoriting(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {isStaff && (
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={toggleFavorite}
              disabled={favoriting}
            >
              <Star className={`h-4 w-4 ${favorited ? "fill-current text-status-moderate" : ""}`} />
              {favorited ? "Favorited" : "Favorite"}
            </Button>

            <Link href={`/library/${slug}/edit`}>
              <Button variant="secondary" size="md">
                <Edit3 className="h-4 w-4" />
                Edit
              </Button>
            </Link>

            <Button onClick={() => setShowProgramModal(true)}>
              <Plus className="h-4 w-4" />
              Add to program
            </Button>
          </>
        )}
      </div>

      {showProgramModal && (
        <AddToProgramModal
          exerciseId={exerciseId}
          onClose={() => setShowProgramModal(false)}
        />
      )}
    </>
  );
}
