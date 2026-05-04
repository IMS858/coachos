"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, Star, Filter, X } from "lucide-react";
import { useState, useTransition } from "react";

interface Props {
  initial: Record<string, string | undefined>;
  isStaff: boolean;
}

const CATEGORIES = [
  { value: "mobility", label: "Mobility" },
  { value: "strength", label: "Strength" },
  { value: "corrective", label: "Corrective" },
  { value: "conditioning", label: "Conditioning" },
  { value: "recovery", label: "Recovery" },
];

const PATTERNS = [
  { value: "squat", label: "Squat" },
  { value: "hinge", label: "Hinge" },
  { value: "lunge", label: "Lunge" },
  { value: "push_horizontal", label: "Push (horizontal)" },
  { value: "push_vertical", label: "Push (vertical)" },
  { value: "pull_horizontal", label: "Pull (horizontal)" },
  { value: "pull_vertical", label: "Pull (vertical)" },
  { value: "carry", label: "Carry" },
  { value: "rotation", label: "Rotation" },
  { value: "anti_rotation", label: "Anti-rotation" },
  { value: "anti_extension", label: "Anti-extension" },
  { value: "isolated_joint", label: "Isolated joint" },
  { value: "breathing", label: "Breathing" },
];

const JOINTS = [
  "hip", "shoulder", "knee", "ankle", "thoracic_spine",
  "lumbar_spine", "scapula", "elbow", "wrist", "foot",
];

const EQUIPMENT = [
  "bodyweight", "dumbbell", "kettlebell", "barbell", "cable_machine",
  "band", "bench", "wall", "wedge", "sled",
];

const LOADS = [
  { value: "low_lumbar_load", label: "Low lumbar load" },
  { value: "low_patellofemoral_load", label: "Low knee load" },
  { value: "shoulder_friendly_pressing", label: "Shoulder-friendly pressing" },
];

export function LibraryFilters({ initial, isStaff }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(initial.q ?? "");
  const [showAdvanced, setShowAdvanced] = useState(
    !!(initial.joint || initial.equipment || initial.load || initial.level)
  );

  function update(key: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") sp.set(key, value);
    else sp.delete(key);
    startTransition(() => router.replace(`/library?${sp.toString()}`));
  }

  function clearAll() {
    setSearchValue("");
    startTransition(() => router.replace("/library"));
  }

  const hasFilters = Object.values(initial).some((v) => v !== undefined);

  return (
    <div className="flex flex-col gap-3">
      {/* Top row — search + favorites toggle + advanced */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update("q", searchValue);
          }}
          className="relative flex-1"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-faint pointer-events-none" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onBlur={() => update("q", searchValue)}
            placeholder="Search exercises…"
            className="w-full h-10 rounded-md border border-divider bg-navy-deep pl-9 pr-3 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky"
          />
        </form>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              update("favorites_only", initial.favorites_only === "1" ? null : "1")
            }
            className={`h-10 px-3 rounded-md border text-sm flex items-center gap-1.5 transition-colors ${
              initial.favorites_only === "1"
                ? "border-status-moderate bg-status-moderate/10 text-status-moderate"
                : "border-divider text-cream-dim hover:border-cream-faint"
            }`}
          >
            <Star
              className={`h-4 w-4 ${
                initial.favorites_only === "1" ? "fill-current" : ""
              }`}
            />
            Favorites
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`h-10 px-3 rounded-md border text-sm flex items-center gap-1.5 transition-colors ${
              showAdvanced
                ? "border-sky bg-sky/10 text-cream"
                : "border-divider text-cream-dim hover:border-cream-faint"
            }`}
          >
            <Filter className="h-4 w-4" />
            Advanced
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="h-10 px-3 rounded-md text-sm text-cream-faint hover:text-cream flex items-center gap-1.5"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <Chip
          active={!initial.category}
          onClick={() => update("category", null)}
          label="All categories"
        />
        {CATEGORIES.map((c) => (
          <Chip
            key={c.value}
            active={initial.category === c.value}
            onClick={() => update("category", c.value)}
            label={c.label}
          />
        ))}
      </div>

      {/* Pattern chips */}
      <div className="flex flex-wrap gap-2">
        <Chip
          active={!initial.pattern}
          onClick={() => update("pattern", null)}
          label="All patterns"
          variant="quiet"
        />
        {PATTERNS.map((p) => (
          <Chip
            key={p.value}
            active={initial.pattern === p.value}
            onClick={() => update("pattern", p.value)}
            label={p.label}
            variant="quiet"
          />
        ))}
      </div>

      {/* Advanced — joint / equipment / level / load */}
      {showAdvanced && (
        <div className="rounded-md border border-divider bg-navy-deep p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SelectFilter
            label="Joint"
            value={initial.joint}
            onChange={(v) => update("joint", v)}
            options={JOINTS.map((j) => ({ value: j, label: j.replace(/_/g, " ") }))}
          />
          <SelectFilter
            label="Equipment"
            value={initial.equipment}
            onChange={(v) => update("equipment", v)}
            options={EQUIPMENT.map((e) => ({ value: e, label: e.replace(/_/g, " ") }))}
          />
          <SelectFilter
            label="Level"
            value={initial.level}
            onChange={(v) => update("level", v)}
            options={[
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced" },
            ]}
          />
          <SelectFilter
            label="Load consideration"
            value={initial.load}
            onChange={(v) => update("load", v)}
            options={LOADS}
          />
        </div>
      )}

      {isStaff && (
        <div className="flex items-center gap-2 text-xs text-cream-faint">
          <input
            type="checkbox"
            checked={initial.draft === "1"}
            onChange={(e) => update("draft", e.target.checked ? "1" : null)}
            className="rounded border-divider bg-navy-deep"
          />
          <label>Include drafts</label>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  variant?: "quiet";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-3 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-sky text-white"
          : variant === "quiet"
          ? "bg-navy-deep border border-divider text-cream-faint hover:text-cream-dim hover:border-cream-faint"
          : "bg-navy-deep border border-divider text-cream-dim hover:text-cream hover:border-cream-faint"
      }`}
    >
      {label}
    </button>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
        {label}
      </label>
      <select
        value={value ?? "all"}
        onChange={(e) => onChange(e.target.value === "all" ? null : e.target.value)}
        className="w-full h-9 rounded-md border border-divider bg-navy-deep px-2 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-sky"
      >
        <option value="all">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
