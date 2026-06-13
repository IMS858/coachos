# Exercise Library + Program Integration

Phase A + B of the IMS Movement System. Establishes the canonical exercise
library and connects it to programs so trainers can assemble client workouts
from exercises with sets/reps/load/notes.

## What's in this bundle

```
library/
├── packages/db/migrations/
│   └── 0010_exercise_library.sql              ← exercises, favorites, program_exercises
├── apps/web/
│   ├── app/
│   │   ├── library/
│   │   │   ├── page.tsx                       ← /library list with filters
│   │   │   ├── [id]/page.tsx                  ← detail page (video, cues, mistakes…)
│   │   │   └── [id]/edit/page.tsx             ← edit form (staff only)
│   │   ├── programs/[id]/page.tsx             ← program detail with assigned exercises
│   │   └── api/
│   │       ├── exercises/[id]/route.ts        ← PATCH (edit)
│   │       ├── exercises/[id]/favorite/route.ts ← POST/DELETE (favorite)
│   │       ├── programs/route.ts              ← GET (list — for picker)
│   │       ├── programs/[id]/exercises/route.ts ← POST (assign to program)
│   │       └── programs/assignments/[id]/route.ts ← DELETE (remove)
│   ├── components/
│   │   ├── library/
│   │   │   ├── library-filters.tsx
│   │   │   ├── library-grid.tsx
│   │   │   ├── exercise-detail-actions.tsx
│   │   │   └── exercise-edit-form.tsx
│   │   └── programs/
│   │       ├── add-to-program-modal.tsx
│   │       └── program-exercises.tsx
│   └── scripts/
│       └── seed-exercises.ts                  ← 15 structurally-correct exemplars
├── .env.bunny.example                         ← Bunny Stream env vars
└── README.md
```

## What's been built

### Schema (migration 0010)
- `exercises` table with the full data model: name, IMS label, category,
  movement pattern, joints, muscles, equipment, cues, mistakes, programming
  notes, contraindications, load descriptors, system tags, video, status,
  client_visible flag
- `exercise_favorites` — per-trainer favorites (RLS gates by trainer_id)
- `program_exercises` — assignment table with prescription (sets, reps, load,
  rest, tempo) and per-client notes
- `exercises_with_favorite` view — uses `security_invoker` so each trainer
  sees their own is_favorite flag
- Full-text search index on name + IMS label + cues + tags
- GIN indexes on array columns for fast filter queries

### RLS layered correctly
- Trainers/owner: full access to all exercises (incl. drafts) and favorites
- Clients: only see exercises with `status='published' AND client_visible=true`
- Clients only see assignments for their own programs (where program.client_id = auth.uid())

### `/library` browse experience
- Search box (full-text on name + label)
- Category chips (mobility / strength / corrective / conditioning / recovery)
- Pattern chips (squat / hinge / push_horizontal / etc.)
- Advanced filters: joint, equipment, level, load descriptors
- Favorites toggle (filters to just trainer's favorites)
- Drafts toggle (staff only)
- Card grid with thumbnail, status pill, favorite button
- Click to open detail page

### Exercise detail page
- Video panel — Bunny Stream iframe embed when video_id is set, placeholder otherwise
- Coaching cues (with placeholder warnings to staff)
- Common mistakes
- Programming notes
- Contraindications (with disclaimer about deferring to clinical care)
- Anatomy panel: joints, muscles, equipment
- Load profile chips
- System tags
- Variations (regressions and progressions linked to other exercises)
- Staff actions: Favorite, Edit, Add to program

### Edit flow
- `/library/<slug>/edit` — full form
- Top-level visibility controls: status (draft/published/archived) + client_visible toggle
- Cue editing in textarea (one per line)
- Bunny Stream GUID input
- Save + back

### Program integration (Phase B)
- "Add to program" modal with searchable program picker
- Block selector (warmup / main / finisher / cooldown)
- Prescription fields: sets, reps, load, rest, tempo, notes
- Auto-computes sort_order within block
- `/programs/<id>` shows assignments grouped by block with prescription line
- Trainer can hover to remove an assignment

## Design decisions made

These were the things I refined from your original prompt:

### "Pain-friendly tags" → load descriptors
Tags like `low_lumbar_load`, `low_patellofemoral_load`, `shoulder_friendly_pressing`
are anatomical descriptions of loading characteristics. Not medical guidance.
The detail page surfaces them with the disclaimer: "Descriptive — about loading
characteristics, not safety claims." This is the difference between something
a trainer uses to make decisions and something a client interprets as "the app
told me it's safe."

### "Hover auto-play preview" deferred
The performance hit of initializing 50+ video streams on a list page is real,
and hover doesn't exist on mobile. Cards show a placeholder + play icon. Real
video lives on the detail page. We can revisit later if there's signal it
matters for trainer workflow.

### Favorites are trainer-scoped
Each trainer has their own go-to library. Separate `client_visible` flag gates
what shows up on a client's dashboard. Clients don't get favorites yet —
they shouldn't be browsing the full library anyway.

### "50+ exercises seed" → 15 exemplars
Quality of cues > quantity. Jason's coaching language is the differentiator.
Seeding 15 across all five categories gives him a structural template; he
fills in the rest as he records videos. Cue placeholders are clearly marked
`[JASON: rewrite]` and surface as warnings in both the list cards and detail
page until rewritten.

### Drag-and-drop deferred
"Add to program" → modal → save flow gets you 80% of the value in 5% of the
build effort. Real drag-drop is a week of accessibility + mobile + undo work.
Revisit after Jason's been using the simple version for a month.

## How to apply

```bash
unzip ims-coach-os-library.zip
cd ims-coach-os/

# 1. Migration
cp ../library/packages/db/migrations/0010*.sql packages/db/migrations/
# Run in Supabase SQL editor

# 2. App code
mkdir -p apps/web/app/library/[id]/edit
mkdir -p apps/web/app/programs/[id]
mkdir -p apps/web/app/api/exercises/[id]/favorite
mkdir -p apps/web/app/api/programs/[id]/exercises
mkdir -p apps/web/app/api/programs/assignments/[id]
mkdir -p apps/web/components/library
mkdir -p apps/web/components/programs

cp -r ../library/apps/web/app/library apps/web/app/
cp -r ../library/apps/web/app/programs apps/web/app/
cp -r ../library/apps/web/app/api/exercises apps/web/app/api/
cp -r ../library/apps/web/app/api/programs apps/web/app/api/
cp -r ../library/apps/web/components/library apps/web/components/
cp -r ../library/apps/web/components/programs apps/web/components/
cp ../library/apps/web/scripts/seed-exercises.ts apps/web/scripts/

# 3. Env vars (append to .env.local once you have a Bunny account)
cat ../library/.env.bunny.example >> .env.local.example
# Then fill in real values in .env.local

# 4. Seed the 15 exemplar exercises
cd apps/web
pnpm tsx scripts/seed-exercises.ts
```

## What Jason needs to do next

In rough order:

1. **Sign up for Bunny Stream** at bunny.net. Create a Stream Library. Copy
   the Library ID into `NEXT_PUBLIC_BUNNY_LIBRARY_ID`.
2. **Visit `/library`** with `?draft=1` — see all 15 exemplars
3. **For each exercise**: open it, click Edit
   - Rewrite the cues (currently placeholder)
   - Add common mistakes if any are missing
   - Set IMS label if you want a different name
   - Record a demo video, upload to Bunny, paste the GUID
   - Set status to "published" + check "Client visible" if it should appear on client dashboards
4. **Add more exercises** as you go. New exercise creation through UI is a
   future build — for now, copy an existing one in Supabase or insert via SQL.

## Phase C — what's still open

The mobility-aware programming part of your original prompt was scoped out of
this bundle deliberately. Building it requires:

- Assessment results that can encode joint restrictions per client
- A query layer that says "find exercises that train [restricted joints] with
  [low load on these structures]" — already possible with the schema, just
  needs a UI
- A "Recommended for [client name]" view inside the library when you're in
  their context

This is real differentiation. It needs Phase A and B running first. Once Jason
has 30+ published exercises and a few clients running real programs, we'll
have the data to make the recommendations work. ~1-2 week build then.

## Connection to the rest of the system

| Surface | How it uses the library |
|---|---|
| **Program Generator** (existing Python service) | Will eventually query `exercises` directly for selection. For now, generates programs offline; trainer copies into IMS via "Add to program" |
| **Client dashboard** | Reads `program_exercises` for the client's active program. Pulls `exercises` for cues + video to display. Only sees exercises with `client_visible=true` |
| **Mobility platform / future subscription** | Same `exercises` table powers it. Different UI; same data. RLS already gates by `client_visible` |

Everything's queryable from one source of truth. That's the value of getting
the schema right.
