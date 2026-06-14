# IMS Coach OS — Ultimate Build Specification

**Innovative Movement Solutions · Scripps Ranch, San Diego**
**One integrated platform. Three role-based experiences. Built on Supabase + Vercel + GitHub.**

---

## 0. Executive Summary — What You're Building

A single, unified web application called **IMS Coach OS** that replaces and integrates everything currently scattered across:

- The Python Flask program generator (becomes a service)
- The Coach OS web prototype (becomes the trainer dashboard)
- The Coach Command Center React app (becomes mobile shell)
- The Master Calendar (becomes the scheduling layer)
- Vagaro (kept for billing, replaced for everything else)
- Manual intake forms and paper waivers (replaced with digital, e-signed flows)
- Email/text follow-up done by hand (replaced with automated workflows)

**Three role-scoped surfaces under one login:**

| Role | Who | Primary Need |
|---|---|---|
| **Owner** | Jason | Run the business — see revenue, retention, pipeline, team performance |
| **Trainer** | Jason, Gabriel, Kara | Run sessions — see today's schedule, log workouts, edit programs, message clients |
| **Client** | Members, leads | Show up and train — see their program, log effort, do mobility homework, message coach |

**One database. One auth system. One codebase. Three role-scoped views.**

This is the architectural decision that matters most. No more app sprawl.

---

## 1. The Core Insight (Read This First)

You don't need three apps. You need **one app** with **role-based dashboards** built on a **shared data model**.

When Jason marks a session complete in the trainer view, the client sees it in their progress feed. When a client signs the waiver in the intake flow, the owner dashboard shows the lead converted. When the program generator outputs a 4-week plan, all three roles see the same plan from their own perspective:
- Client sees: "This week's sessions"
- Trainer sees: "Sarah's program — editable, with coaching notes"
- Owner sees: "12 active programs across 8 clients, avg adherence 73%"

That's the whole game. One source of truth, three lenses.

---

## 2. The Tech Stack (Locked In)

### 2.1 Core Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend Framework | **Next.js 15** (App Router) | Server components, edge runtime, best-in-class DX, perfect Vercel integration |
| Language | **TypeScript** (strict mode) | Type safety end-to-end, catches 90% of bugs at compile time |
| UI Library | **React 19** + **Tailwind CSS v4** + **shadcn/ui** | Industry standard, fast iteration, accessible by default |
| Database | **Supabase Postgres** | Row-level security gives free role-based access; battle-tested |
| Auth | **Supabase Auth** | Built in. Email/password + magic link + Google OAuth |
| File Storage | **Supabase Storage** | Photos, signed waivers, body comp scans, exercise videos |
| Realtime | **Supabase Realtime** | Live messaging, session updates, schedule changes |
| Hosting | **Vercel** | Edge functions, automatic preview deploys, dead-simple from GitHub |
| Repo / CI | **GitHub** | Source of truth, GitHub Actions for tests |
| Payments | **Stripe** | Memberships (subscriptions) + packages (one-time) |
| SMS | **Twilio** | 2-way texting, automated reminders, review requests |
| Email | **Resend** | Transactional + marketing, modern API, beats GoHighLevel for clean code |
| Background Jobs | **Inngest** | Reliable workflows: post-assessment sequences, reactivation, billing reminders |
| Error Tracking | **Sentry** | Catches every exception in prod with stack traces |
| Analytics | **PostHog** | Product analytics, session replay, feature flags |

### 2.2 The Python Generator — How to Keep It

You have two options. **Pick option B.**

**Option A — Rewrite the generator in TypeScript.**
Pros: Single language, easier hiring later, simpler deploy.
Cons: Months of work. The Python generator has 3,500+ lines of finely-tuned logic across 10 JSON libraries. Rewriting it is technical debt for no business value.

**Option B — Keep the Python generator as a microservice. ✅ RECOMMENDED**
Deploy `app.py` (Flask) on **Railway** or **Fly.io** as a standalone service. The Next.js app calls it over HTTP when generating a program. The Python service has one job: take an assessment JSON, return a program JSON. It doesn't know about users, auth, or anything else. The Next.js app handles persistence, presentation, and editing.

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Next.js (web)  │ ───────▶│  Python Generator │────────▶│  Program JSON   │
│  on Vercel      │  POST   │  on Railway       │         │  returned       │
│                 │  /api/  │  Flask + libs     │         │  saved to       │
│                 │ generate│                   │         │  Supabase       │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

**Cost: ~$5/mo on Railway hobby tier.** Latency: <2 seconds for a full 4-week program. Tradeoff is well worth it.

If you want even simpler later, deploy as a Vercel Python serverless function in the same repo. But Railway is more reliable for a process that holds 2MB of JSON libraries in memory.

### 2.3 What Vagaro Stays For

- Membership recurring billing (don't migrate this — it works)
- Stripe is overkill for now if Vagaro already collects cards
- BUT: read Vagaro's API for booking events into Supabase via webhook so the Coach OS knows the schedule

**Decision tree on Vagaro:**

- **Phase 1 (months 1-3):** Vagaro stays as-is. Coach OS reads booking data via webhook.
- **Phase 2 (month 4+):** If Vagaro becomes a constraint, migrate to native Stripe + Supabase scheduling. Most fitness studios do this around the 50-member mark when Vagaro's UX starts hurting.

Don't migrate billing as part of the v1 build. It's a separate decision.

---

## 3. The Database — Complete Schema

Below is the full Supabase schema. Every table, every column, every relationship.

I'll deliver this as a runnable SQL file separately. This is the conceptual map.

### 3.1 Identity & Roles

```
profiles
├── id (uuid, PK, references auth.users)
├── email (text, unique)
├── full_name (text)
├── phone (text)
├── role (enum: owner, trainer, client)
├── avatar_url (text)
├── created_at, updated_at
└── deleted_at (soft delete)
```

### 3.2 Clients (extends profiles for client-only data)

```
clients
├── id (uuid, PK, references profiles.id)
├── date_of_birth (date)
├── emergency_contact_name (text)
├── emergency_contact_phone (text)
├── emergency_contact_relationship (text)
├── address_line1, address_line2, city, state, zip
├── medical_conditions (jsonb) — structured health history
├── medications (jsonb)
├── allergies (jsonb)
├── injury_history (jsonb)
├── physician_name, physician_phone (text)
├── lead_source (text) — google, referral, instagram, walk-in
├── referred_by_client_id (uuid, FK → clients.id, nullable)
├── status (enum: lead, assessment_booked, assessment_completed, active, paused, churned)
├── joined_at (timestamp)
├── last_session_at (timestamp)
├── notes_internal (text) — coach-only notes
└── created_at, updated_at
```

### 3.3 Intake & Waivers

```
intake_forms
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── form_version (text) — track schema changes over time
├── responses (jsonb) — full structured intake data
├── completed_at (timestamp)
├── pdf_url (text, nullable) — Supabase Storage URL
└── created_at

waivers
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── waiver_type (enum: liability, photo_release, telehealth, minor_consent)
├── waiver_version (text)
├── signed_at (timestamp)
├── ip_address (inet)
├── user_agent (text)
├── signature_data_url (text) — base64 PNG of drawn signature
├── pdf_url (text) — final signed PDF in storage
└── created_at
```

### 3.4 Assessments

```
assessments
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── trainer_id (uuid, FK → profiles.id)
├── assessment_date (date)
├── status (enum: draft, in_progress, complete)
├── data (jsonb) — full Assessment dataclass payload, matches Python generator input
├── _section_status (jsonb) — tracks bypassed/partial sections per Coach OS redesign
├── notes (text)
└── created_at, updated_at
```

The `data` column holds the entire assessment payload exactly as the Python generator expects it. This preserves your existing engine contract.

### 3.5 Programs (Generator Output)

```
programs
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── assessment_id (uuid, FK → assessments.id)
├── trainer_id (uuid, FK → profiles.id)
├── name (text) — e.g. "Sarah — Hip Mobility Block 1"
├── start_date (date)
├── end_date (date)
├── weeks (int) — typically 4
├── status (enum: draft, published, active, completed, archived)
├── data (jsonb) — full Program object from Python generator
├── coach_edits (jsonb) — overrides from Plan Review screen
├── pdf_client_url (text) — client-facing PDF
├── pdf_coach_url (text) — coach version with full detail
└── created_at, updated_at, published_at
```

The `data` column holds the generator output. The `coach_edits` column tracks any modifications made in the Plan Review surface so we can replay them if the program is regenerated.

### 3.6 Sessions (Calendar Events)

```
sessions
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── trainer_id (uuid, FK → profiles.id)
├── program_id (uuid, FK → programs.id, nullable)
├── program_session_index (int, nullable) — which day of the program
├── scheduled_at (timestamp)
├── duration_minutes (int) — typically 60
├── session_type (enum: assessment, training, mobility, pilates, recovery, body_comp)
├── status (enum: scheduled, confirmed, completed, no_show, cancelled, late_cancelled)
├── vagaro_event_id (text, nullable) — for sync
├── location (text) — default "IMS Studio"
├── notes_pre (text) — what to focus on
├── notes_post (text) — what happened
├── client_rpe (int, nullable) — client-reported effort 1-10
├── client_notes (text, nullable) — client journal entry
└── created_at, updated_at, completed_at
```

### 3.7 Workout Logs (What Actually Happened)

```
workout_logs
├── id (uuid, PK)
├── session_id (uuid, FK → sessions.id)
├── client_id (uuid, FK → clients.id)
├── exercise_name (text)
├── exercise_id (text, nullable) — links to library
├── block (text) — "Strength A", "Mobility Prep", etc.
├── set_number (int)
├── prescribed_reps (text) — e.g. "8-10"
├── prescribed_load (text) — e.g. "@RPE 7" or "70%"
├── actual_reps (int, nullable)
├── actual_load_lb (numeric, nullable)
├── actual_rpe (numeric, nullable)
├── notes (text)
└── created_at
```

### 3.8 Mobility Homework

```
mobility_assignments
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── trainer_id (uuid, FK → profiles.id)
├── name (text)
├── description (text)
├── exercises (jsonb) — list of exercise refs from library
├── frequency (text) — "daily", "5x/week"
├── duration_minutes (int)
├── video_url (text, nullable)
├── start_date, end_date (date)
├── active (boolean)
└── created_at

mobility_completions
├── id (uuid, PK)
├── assignment_id (uuid, FK → mobility_assignments.id)
├── client_id (uuid, FK → clients.id)
├── completed_on (date)
└── created_at
```

### 3.9 Body Composition

```
body_comp_records
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── recorded_at (date)
├── weight_lb (numeric)
├── body_fat_pct (numeric, nullable)
├── lean_mass_lb (numeric, nullable)
├── method (enum: bod_pod, dexa, inbody, scale, calipers)
├── circumferences (jsonb, nullable)
├── notes (text)
├── photo_urls (jsonb, nullable)
└── created_at
```

### 3.10 Messaging

```
conversations
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── trainer_id (uuid, FK → profiles.id, nullable) — null = group / front desk
├── last_message_at (timestamp)
└── created_at

messages
├── id (uuid, PK)
├── conversation_id (uuid, FK → conversations.id)
├── sender_id (uuid, FK → profiles.id)
├── body (text)
├── attachments (jsonb)
├── read_at (timestamp, nullable)
└── created_at
```

### 3.11 Memberships & Payments

```
memberships
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── tier (enum: essentials_2x, standard_3x, premium_4x, package_6, package_12, package_24)
├── status (enum: active, paused, cancelled, expired)
├── sessions_per_week (int, nullable) — for memberships
├── total_sessions (int, nullable) — for packages
├── sessions_used (int)
├── monthly_rate_cents (int, nullable)
├── package_total_cents (int, nullable)
├── start_date, end_date (date)
├── stripe_subscription_id (text, nullable)
├── vagaro_membership_id (text, nullable)
└── created_at, updated_at

payments
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id)
├── membership_id (uuid, FK → memberships.id, nullable)
├── amount_cents (int)
├── currency (text, default 'usd')
├── status (enum: pending, succeeded, failed, refunded)
├── source (enum: stripe, vagaro, manual)
├── source_id (text)
├── description (text)
├── paid_at (timestamp)
└── created_at
```

### 3.12 Documents

```
documents
├── id (uuid, PK)
├── client_id (uuid, FK → clients.id, nullable)
├── document_type (enum: waiver, intake, program, body_comp_report, invoice, other)
├── name (text)
├── storage_path (text)
├── mime_type (text)
├── size_bytes (int)
├── uploaded_by (uuid, FK → profiles.id)
└── created_at
```

### 3.13 Audit Log (Compliance + Debugging)

```
audit_logs
├── id (uuid, PK)
├── actor_id (uuid, FK → profiles.id)
├── action (text) — e.g. "program.published", "waiver.signed"
├── entity_type (text)
├── entity_id (uuid)
├── changes (jsonb)
├── ip_address (inet)
├── user_agent (text)
└── created_at
```

### 3.14 Automation State

```
workflow_runs
├── id (uuid, PK)
├── workflow_name (text) — e.g. "post_assessment_followup"
├── client_id (uuid, FK → clients.id)
├── status (enum: pending, running, completed, failed, cancelled)
├── current_step (text)
├── data (jsonb)
├── scheduled_for (timestamp)
└── created_at, updated_at
```

---

## 4. Row-Level Security (RLS) — The Killer Feature

Supabase RLS is what makes this whole architecture work. You write the rules in SQL once and Postgres enforces them at the database level — every query, every API call, every realtime subscription. No way to bypass.

### 4.1 The Three Cardinal Policies

```sql
-- Owners see everything
CREATE POLICY owners_full_access ON clients
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Trainers see clients they coach + clients with no assigned trainer (lead pool)
CREATE POLICY trainers_see_their_clients ON clients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'trainer'
    )
    AND (
      EXISTS (
        SELECT 1 FROM sessions
        WHERE sessions.client_id = clients.id
        AND sessions.trainer_id = auth.uid()
      )
      OR clients.status IN ('lead', 'assessment_booked')
    )
  );

-- Clients see only themselves
CREATE POLICY clients_see_self ON clients
  FOR SELECT TO authenticated
  USING (id = auth.uid());
```

Apply this pattern to every table. Programs, sessions, workouts, messages — same shape.

**This is your security model in 30 lines of SQL.** No Express middleware, no role-checking decorators, no "did we forget to check permissions on this endpoint." It's enforced at the data layer. This is the single biggest reason to choose Supabase over rolling your own.

---

## 5. The Three Dashboards — Detailed Specs

### 5.1 Owner Dashboard (Jason's "Run the Business" View)

**Hero KPI strip (always visible at top):**
- MRR (current vs last month, % change)
- Active members count
- New leads this month
- Conversion rate (assessments booked → members)
- 90-day retention rate

**Main grid:**

```
┌────────────────────┬────────────────────┐
│ Revenue Trend      │  Pipeline Funnel   │
│ (monthly chart)    │  Lead → Assessment │
│ MRR / Package      │  → Member          │
│ stacked area       │                    │
├────────────────────┼────────────────────┤
│ Roster             │ At-Risk Clients    │
│ Active members     │ Missed sessions,   │
│ list w/ adherence  │ lapsed payments    │
├────────────────────┼────────────────────┤
│ Trainer Stats      │ This Week's        │
│ Sessions/trainer,  │ Schedule Heatmap   │
│ utilization rate   │ (slot usage)       │
└────────────────────┴────────────────────┘
```

**Secondary sections (scroll):**
- Reviews dashboard (Google rating + recent reviews)
- Reactivation queue (clients dormant 30/60/90+ days)
- Referral leaderboard (who's sending us business)
- Recent activity feed (assessments completed, programs published, payments received)

**Owner-only actions:**
- Run reports (export CSV, monthly P&L)
- Send broadcast (email/SMS to all active members)
- Manage trainer accounts
- View audit log
- Edit pricing / membership tiers

### 5.2 Trainer Dashboard (Jason and Gabriel's "Run Sessions" View)

**Top bar:**
- Today's session count
- Next session (countdown)
- Unread messages

**Primary view: TODAY**

A timeline of today's sessions. Each card:
```
┌─────────────────────────────────────────────┐
│ 9:00 AM  ·  Sarah Patterson                 │
│ Hip mobility block, week 2 day 3            │
│ [View Plan]  [Quick Log]  [Message]         │
│ Last note: "Sleep was rough — going light"  │
└─────────────────────────────────────────────┘
```

**Side rail:**
- This week's roster (clickable to filter)
- Quick links: New Assessment, Plan Review queue
- Pending tasks (programs to publish, intakes to review)

**Sub-pages:**
- **Clients:** Searchable list. Click → full client profile (programs, history, body comp, notes, messages)
- **Assessments:** The 10-step Coach OS wizard, exactly as designed in DELIVERABLES_REDESIGN.md. Bypassable sections, live summary, status indicators.
- **Plan Review:** The 3-pane editable program view (week navigator / session detail / coach logic). Hits Python generator for builds, allows edits, exports PDFs.
- **Exercise Library:** Browseable, with FRC tags, demo videos, swap-in suggestions
- **Messages:** Unified inbox across all clients

**Trainer-specific actions:**
- Generate program (calls Python service)
- Edit program (saves to coach_edits)
- Log workout (during or after session)
- Mark session complete
- Add session note (visible to client + owner)
- Add internal note (coach-only)

### 5.3 Client Dashboard (Sarah's "Show Up and Train" View)

**Mobile-first. The client opens this on their phone in the parking lot before a session.**

**Home screen:**
```
┌─────────────────────────────────────┐
│ Hi Sarah —                          │
│ Tomorrow, 9:00 AM with Jason        │
│ [View Today's Session]              │
├─────────────────────────────────────┤
│ This Week's Plan                    │
│ Day 1 ✓  Day 2 ✓  Day 3 (today)     │
│ Day 4    Day 5                      │
├─────────────────────────────────────┤
│ Mobility Homework                   │
│ Hip CARs · 3 of 5 done this week    │
│ [Log Today's Session]               │
├─────────────────────────────────────┤
│ Recent Progress                     │
│ Body fat ↓ 1.2% (last 8 wks)        │
│ DL 1RM ↑ 35 lb (last 12 wks)        │
└─────────────────────────────────────┘
```

**Tabs (bottom nav):**
- **Today** — current session detail, exercise list, video links, RPE logger
- **Plan** — full program view, week-by-week
- **Progress** — body comp chart, strength markers, photos (their own)
- **Messages** — chat with their trainer
- **Account** — profile, billing, documents, waiver status, book session

**Client capabilities:**
- View today's session (with exercise videos)
- Log RPE per exercise after session
- Add a journal note ("felt great", "low energy")
- Mark mobility homework complete
- Message their trainer
- Book a session (Vagaro embed or native)
- View/download signed waivers, intake, programs (PDFs)
- Update profile, emergency contact
- View membership status, next billing date
- Refer a friend (with shareable link)

**What clients CANNOT do:**
- See other clients
- See pricing for tiers they don't have
- Edit their own program
- See coach internal notes

---

## 6. Intake & Waiver System (The Biggest Gap to Close)

This is where most fitness studios drop the ball. You're going to fix it.

### 6.1 The Intake Flow (Pre-Assessment)

When a lead books their free movement assessment, they get an automated email:

> "Hey Sarah — your assessment is booked for Tuesday at 9 AM. Take 10 minutes today to complete your intake so we can hit the ground running. [Start Intake]"

The link takes them to a clean, multi-step form on the Coach OS:

**Step 1 — Identity**
- Full name (pre-filled)
- DOB
- Address
- Phone (pre-filled)
- Emergency contact

**Step 2 — Health History (PAR-Q+)**
- Heart conditions, chest pain, dizziness, joint problems, blood pressure, medications affecting exercise
- All standard PAR-Q+ questions
- "Other concerns" free text

**Step 3 — Movement & Injury History**
- Past surgeries (with dates)
- Current pain or limitation (body diagram for tap-to-mark)
- Previous physical therapy
- Sports/training history

**Step 4 — Goals**
- Primary goal (dropdown: pain relief, strength, mobility, body comp, performance)
- Specific outcomes ("I want to deadlift my bodyweight", "I want to walk without back pain")
- Timeline expectations
- What's worked / hasn't worked before

**Step 5 — Logistics**
- Preferred training days/times
- Other physical activities
- Sleep, stress, hydration baseline

**Step 6 — Photo + ID**
- Optional headshot for trainer recognition
- Optional ID upload (for memberships only)

**Step 7 — Waivers**
This is where the e-sign flow lives. Three documents:
1. Liability waiver (covers training, mobility, recovery services)
2. Photo/video release (allows IMS to use session photos for marketing)
3. Telehealth consent (covers any video consultations)

For each:
- Display full waiver text in a scrollable container
- Require scroll-to-end before "Sign" button activates
- Capture signature via canvas (typed name OR drawn finger signature)
- Capture timestamp, IP, user agent
- Generate PDF with signature embedded
- Save PDF to Supabase Storage
- Email signed copy to client

Use **HelloSign or DocuSign Click API** if you want bank-grade compliance, OR build it yourself with a canvas signature pad — which is legally binding in California for fitness waivers under CA Civil Code § 1633.7. The DIY version costs $0 and is sufficient for your use case.

**Step 8 — Confirmation**
- "All set! Your trainer has everything they need. See you Tuesday."
- Calendar invite resent
- What to wear/bring reminder

### 6.2 Waiver Re-Signing

Trigger automatic waiver renewal:
- Annually (set `expires_at` on each waiver)
- When waiver text changes (bump `waiver_version`)
- When client transitions from lead → member (full member waiver may differ from assessment waiver)

The system tracks every signed version forever. If someone signed v1.2 in 2026, that exact PDF is preserved. New version doesn't invalidate the old — you just know they need to re-sign.

### 6.3 Minor Consent (Future-Proof)

If IMS ever trains under-18 athletes, the schema already supports parent/guardian consent via the `minor_consent` waiver type. Build it now, costs nothing, available when needed.

### 6.4 The Game-Changer Move

When the trainer opens the assessment in the Coach OS, **all the intake data is already there**. They don't ask "have you had any surgeries?" — they say "I see you had a left knee meniscus repair in 2023. How's it feeling now?"

This is what "premium movement coaching studio" means in practice. The client feels seen and prepared-for. The trainer looks competent and well-organized. Both happen because the data flows.

---

## 7. Booking Integration — Vagaro vs Native

### 7.1 Phase 1: Vagaro Stays

Don't rebuild scheduling in v1. Vagaro works. Add:

**Vagaro → Supabase webhook:**
- On every booking, cancellation, completion → POST to `/api/webhooks/vagaro`
- Webhook handler creates/updates a `sessions` row in Supabase
- Both sides stay in sync

**Vagaro embed in Client Dashboard:**
- "Book a Session" tab opens the Vagaro booking widget in a modal
- After booking, redirect back to the dashboard

**Build the abstraction layer:**
- All other code reads from Supabase `sessions` table
- Only the webhook handler talks to Vagaro
- This makes it trivial to swap Vagaro out later

### 7.2 Phase 2: Native Scheduling (Optional)

When you outgrow Vagaro (sometime around 50+ active members), build native:

- Trainer availability windows (recurring rules)
- Session slot generation from rules
- Client-facing booking UI in the dashboard
- Stripe holds for late cancellation policy enforcement
- Calendar sync (Google Calendar, Apple Calendar via .ics)
- Twilio reminder texts (12hr, 1hr before session)

This is 4-6 weeks of work and worth doing eventually but **not** in v1.

---

## 8. Payments — Stripe + Vagaro Coexistence

**Today (Vagaro):** All membership billing happens in Vagaro. Don't break it.

**v1 build:** Read-only sync. Vagaro webhook → Supabase `payments` table. Owner dashboard reads MRR from Supabase.

**v2 (when ready to migrate):**
- Stripe Customer + Subscription objects
- Memberships in Supabase mirror Stripe state
- Customer portal embedded in Client dashboard ("Update card", "Pause membership")
- Failed payment workflow: 3 retries, dunning emails, then auto-pause membership

**Pricing sync rule:** When you change pricing in IMS, change it in code, deploy, and let Stripe roll out new prices via product API. Don't have pricing in two places.

---

## 9. Messaging & Automation — Replacing GoHighLevel

The Master Doc lists GoHighLevel as the planned CRM/automation platform at $97/month. **Don't use it.**

You're building a real app. GHL is for businesses that don't have engineering resources. Once you have Supabase + Inngest, you have everything GHL gives you for $0/month additional cost.

### 9.1 Messaging Stack

| Need | Tool | Cost |
|---|---|---|
| Transactional email | Resend | $20/mo for 50K sends |
| Marketing email | Resend (same account, marked broadcast) | included |
| 2-way SMS | Twilio | $0.0079/SMS + $1/mo for number |
| In-app chat | Supabase Realtime (custom UI) | $0 |
| Push notifications | Web Push API + service worker | $0 |

### 9.2 Workflow Engine: Inngest

[Inngest](https://www.inngest.com) is the right tool for IMS. It's a TypeScript-native background job platform. You write workflows like this:

```ts
inngest.createFunction(
  { id: "post-assessment-followup" },
  { event: "assessment.completed.no.sale" },
  async ({ event, step }) => {
    const { client_id } = event.data;

    await step.run("day-1-email", async () => {
      await resend.emails.send({
        to: client.email,
        subject: `Great meeting you today, ${client.first_name}`,
        react: PostAssessmentDay1({ client })
      });
    });

    await step.sleep("wait-2-days", "2 days");

    await step.run("day-3-text", async () => {
      await twilio.messages.create({
        to: client.phone,
        body: `Hey ${client.first_name} — any questions on what we talked through?`
      });
    });

    // ... rest of the sequence
  }
);
```

Every automation in the Master Doc Phase 5 maps directly to an Inngest function. Reliable, observable, free for the first 50K runs/month (you'll never hit that).

### 9.3 The 12 Workflows to Build

From the Master Doc Phase 5, prioritized for v1:

1. **Assessment booked** → confirmation email + SMS + 48hr reminder + day-of reminder
2. **Assessment no-show** → 30min later: "want to reschedule?"
3. **Assessment completed (no sale)** → 7-day sequence (3 emails, 2 texts)
4. **New member signup** → welcome email + intake form + day 3 check-in + day 7 education
5. **Session 5 completed** → review request via NiceJob (or direct Google review link)
6. **Inactive 30 days** → personal re-engagement text
7. **Inactive 60 days** → educational email with restart offer
8. **Inactive 90 days** → free re-assessment offer
9. **Birthday** → personal text from Jason
10. **Monthly newsletter** → first of month, all active members
11. **Failed payment** → retry sequence with dunning emails
12. **Referral submitted** → thank-you + reward to referrer, welcome to referee

### 9.4 Bonus: Voice + Slack Integration

If Jason wants to dictate session notes:
- Add a "Voice Note" button in the trainer dashboard
- Records 30s, sends to OpenAI Whisper API
- Transcribes to text
- Auto-fills the session post-note field

If the team wants to coordinate:
- Slack workspace
- Slack webhook on key events: "New lead!", "Sarah signed up for premium", "Mike missed session"
- Cuts coordination overhead by 80%

---

## 10. The Repo — Monorepo Structure

```
ims-coach-os/
├── apps/
│   ├── web/                          # Next.js 15 app (the main thing)
│   │   ├── app/
│   │   │   ├── (auth)/               # signin, signup, magic link
│   │   │   ├── (owner)/              # owner dashboard routes
│   │   │   ├── (trainer)/            # trainer dashboard routes
│   │   │   ├── (client)/             # client dashboard routes
│   │   │   ├── intake/[token]/       # public intake flow
│   │   │   ├── api/
│   │   │   │   ├── webhooks/         # vagaro, stripe, twilio
│   │   │   │   ├── inngest/          # inngest webhook receiver
│   │   │   │   └── generate/         # proxies to Python service
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui primitives
│   │   │   ├── owner/                # owner-only components
│   │   │   ├── trainer/              # trainer-only components
│   │   │   ├── client/               # client-only components
│   │   │   └── shared/               # used by all roles
│   │   ├── lib/
│   │   │   ├── supabase/             # client, server, middleware
│   │   │   ├── inngest/              # workflow definitions
│   │   │   ├── stripe/
│   │   │   ├── twilio/
│   │   │   └── resend/
│   │   └── package.json
│   │
│   └── generator/                    # Python Flask service (existing code)
│       ├── app.py                    # (already exists)
│       ├── generator/                # (already exists)
│       ├── libraries/                # (already exists)
│       ├── tests/                    # (already exists)
│       ├── Dockerfile                # NEW — for Railway deploy
│       └── requirements.txt          # (already exists)
│
├── packages/
│   ├── db/
│   │   ├── migrations/               # SQL migrations, version-controlled
│   │   ├── seed.ts                   # demo data for dev
│   │   └── types.ts                  # generated TS types from Supabase schema
│   │
│   ├── ui/
│   │   └── (extracted shadcn components if web grows large)
│   │
│   ├── workflows/
│   │   └── (extracted Inngest functions if web grows large)
│   │
│   └── shared-types/                 # shared TS types: Assessment, Program, etc.
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── DEVELOPMENT.md
│   └── BRAND.md                      # design tokens, voice guidelines
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # tests + typecheck on PR
│       └── deploy.yml                # auto-deploy on main merge
│
├── package.json                      # root, with workspaces
├── pnpm-workspace.yaml               # pnpm monorepo config
├── turbo.json                        # Turborepo for fast builds
├── .env.example
└── README.md
```

**Why monorepo:** The Python generator and the web app share types (Assessment, Program). When the schema changes, both sides need to update. Monorepo + shared-types package keeps them in sync.

**Recommended tools:**
- **pnpm** for package management (faster, disk-efficient)
- **Turborepo** for build orchestration (caches builds, runs in parallel)
- **Husky + lint-staged** for pre-commit hooks
- **Biome** instead of ESLint+Prettier (10x faster, single config)

---

## 11. Authentication Flows — The Three Front Doors

### 11.1 Client (Public-Facing)

1. Lead books assessment via Vagaro (no account needed yet)
2. Vagaro webhook fires → Supabase creates `clients` row with status=lead, sends magic link email
3. Lead clicks link → enters email → receives 6-digit code → signed in
4. First login: complete profile, complete intake, sign waivers
5. Subsequent logins: magic link or password (their choice)

**No password required if they prefer not to set one.** Magic link is enough.

### 11.2 Trainer

1. Owner invites via Coach OS: "Add Trainer" → email entered
2. Trainer receives invite email
3. Sets password, completes profile
4. Role auto-assigned: trainer

### 11.3 Owner

1. Bootstrap: first user signed up via Supabase dashboard, role manually set to 'owner'
2. Subsequent owners (rare): owner can promote a trainer to owner

### 11.4 The Public Intake Flow (No Account Needed Initially)

A lead who hasn't signed up yet can complete the intake via a tokenized public link:

```
https://imsfitnesscenter.com/intake/abc123xyz
```

The token maps to a pre-created `clients` row (status=lead). They fill out the intake without authenticating. On final submit, they create their account (set password OR confirm via email) and the intake is attached to their new auth user. Smooth. No friction. High completion rate.

---

## 12. The Build Roadmap — 6 Phases

This is your "what to do, in what order" plan. Total time: ~14 weeks at part-time pace, ~6 weeks if a developer goes hard.

### Phase 1 — Foundation (Weeks 1-2)
Goal: Empty app deployed, can sign in, can see your role.

- [x] GitHub repo created with monorepo structure
- [x] Supabase project provisioned
- [x] Vercel project linked to GitHub
- [x] Run database migrations (schema + RLS)
- [x] Seed dev data (5 fake clients, 2 trainers, 1 owner)
- [x] Auth: sign in flow working, magic link working
- [x] Layout shells: owner / trainer / client
- [x] Empty dashboards for each role with role-based routing
- [x] Sentry + PostHog wired up

### Phase 2 — Client Side (Weeks 3-5)
Goal: A client can be onboarded end-to-end.

- [ ] Public intake flow (tokenized, 8 steps)
- [ ] E-signature waiver component (canvas-based)
- [ ] PDF generation for signed waivers
- [ ] Client dashboard home (today, plan, mobility, progress)
- [ ] Account settings (profile, emergency contact, documents)
- [ ] Membership status display
- [ ] Vagaro booking embed
- [ ] Resend integration for transactional emails

### Phase 3 — Trainer Side (Weeks 6-9)
Goal: A trainer can run a full client lifecycle.

- [ ] Trainer dashboard (today timeline, week schedule)
- [ ] Client list + profile view
- [ ] Assessment wizard (10 steps, bypassable, save-as-you-go)
- [ ] Python generator service deployed to Railway
- [ ] `/api/generate` endpoint in Next.js → calls Railway
- [ ] Plan Review UI (3-pane editor)
- [ ] PDF export (client / coach / full modes)
- [ ] Session log: quick-log during session
- [ ] Workout log: per-set logging
- [ ] Session notes (pre + post)
- [ ] Messaging UI

### Phase 4 — Owner Side (Weeks 10-11)
Goal: Jason can run the business from this dashboard.

- [ ] Owner dashboard (KPIs, charts, funnels)
- [ ] Roster + adherence
- [ ] At-risk client alerts
- [ ] Pipeline view
- [ ] Trainer performance stats
- [ ] Reactivation queue
- [ ] Reports (CSV exports)
- [ ] Audit log viewer

### Phase 5 — Automation (Weeks 12-13)
Goal: The system runs itself.

- [ ] Inngest setup
- [ ] Twilio setup
- [ ] All 12 workflows from section 9.3
- [ ] Vagaro webhook handlers (booking, payment)
- [ ] Birthday automation
- [ ] Monthly newsletter
- [ ] Review request flow
- [ ] Reactivation sequences

### Phase 6 — Polish & Launch (Week 14)
Goal: Ship it.

- [ ] Mobile testing (iOS Safari, Android Chrome)
- [ ] Accessibility audit (WCAG AA)
- [ ] Performance pass (Lighthouse > 90 across the board)
- [ ] Migrate existing Vagaro clients to Coach OS (one-time import)
- [ ] Soft launch with 5 clients (ask for feedback)
- [ ] Train Jason and Gabriel on the trainer dashboard
- [ ] Public launch
- [ ] Take down GoDaddy site, redirect to new Webflow marketing site (or use Next.js for marketing pages too)

---

## 13. Cost to Run

Monthly operating costs at full launch:

| Service | Tier | Cost |
|---|---|---|
| Vercel | Pro | $20/mo |
| Supabase | Pro | $25/mo |
| Railway (Python service) | Hobby | $5/mo |
| Resend | Pro | $20/mo |
| Twilio | Pay-as-you-go | $15-30/mo (depends on volume) |
| Stripe | 2.9% + 30¢ per transaction | variable |
| Inngest | Hobby | $0 |
| Sentry | Developer | $0 |
| PostHog | Free tier | $0 |
| GitHub | Free | $0 |
| Domain | already owned | $0 |
| **Total fixed monthly** | | **~$85-100/mo** |

**Compare to Master Doc Phase 7 estimate of ~$259/mo** with GoHighLevel + NiceJob + Webflow stack.

You save ~$160/month and get an infinitely better product. The savings pay for ~2 sessions/month — the system is free + profitable from day one.

---

## 14. The Top 5 Things to Build First (If You Have to Pick)

If everything else gets cut or delayed, these five capabilities give IMS the most leverage:

### 1. Public intake + e-signed waivers
**Why:** This is the #1 gap in the current operation. Closes the "pre-assessment data" loop and removes a friction point that's costing you conversions.

### 2. Trainer "Today" view + session log
**Why:** This is what Jason and Gabriel will use 50+ times a week. If this isn't great, nothing else matters.

### 3. Owner KPI dashboard
**Why:** The single piece of information that runs the business is "how are we doing this month?" Build this once, glance at it daily.

### 4. Post-assessment automation (Inngest workflow)
**Why:** The Master Doc identifies this as the #1 revenue leak. Slow follow-up = lost members. This recovers 10-30% of leads that would otherwise ghost.

### 5. Client dashboard mobile home screen
**Why:** Clients seeing their next session, their plan, and their progress on their phone makes them stickier. Stickiness = retention = MRR.

Everything else is a bonus.

---

## 15. What This Replaces (Burn the Old Stack)

| Old | New |
|---|---|
| GoDaddy website | Next.js on Vercel |
| Form submissions to email | Public intake flow → Supabase |
| Paper waivers | E-sign in app |
| GoHighLevel CRM | Supabase + Owner dashboard |
| GoHighLevel automations | Inngest workflows |
| GoHighLevel email | Resend |
| GoHighLevel SMS | Twilio |
| NiceJob review requests | Inngest workflow → Twilio |
| Vagaro booking | Vagaro (kept) + native UI in client app |
| Vagaro membership billing | Vagaro (kept, possibly migrated to Stripe later) |
| Manual session notes | Trainer dashboard session log |
| Manual program PDFs | Auto-generated from Coach OS |
| Coach memory of client history | Searchable client profile |
| "I think Sarah's been here 6 months" | "Sarah joined March 14, 2026, 47 sessions, 89% adherence" |

---

## 16. The Strategic Bet

You're not building a fitness app. You're building **the operating system for a premium movement studio**.

When this is done, IMS becomes:
- Faster to onboard new clients (15 minutes from booking to ready-for-assessment)
- Better at retaining existing clients (real adherence data, real check-ins, real automation)
- Easier to scale to a second location (everything is in the system, not in Jason's head)
- More valuable as a business (a movement studio with this kind of operational maturity is acquirable, sellable, franchisable)

The Python generator is your moat. The Coach OS is the delivery mechanism. The three role-scoped dashboards are how you serve owners, trainers, and clients without compromise.

This is a 14-week build. After 14 weeks, IMS runs differently than every other studio in San Diego.

---

## 17. Open Questions to Decide Before Build Starts

These shape the architecture. Decide them now or get blocked later.

1. **Domain strategy:** `app.imsfitnesscenter.com` for the Coach OS, `imsfitnesscenter.com` for marketing? Or single domain?
2. **Branding pass:** Are the colors/typography in the existing prototypes locked? If yes, port. If no, do a brand sprint first.
3. **Vagaro migration:** Are you committed to Vagaro for billing through end of Phase 1, or open to native Stripe in v1?
4. **HIPAA-adjacent decisions:** Health history data lives in Supabase. Are you OK with Supabase's standard SOC 2 posture, or do you want enterprise/BAA features? (For a non-healthcare fitness studio, standard is fine.)
5. **Pricing display:** Should the Memberships page show prices publicly, or require a free assessment first to get pricing? (Recommendation: show publicly. Removes friction.)
6. **Multi-tenant or single?** Is this only for IMS, or are you considering selling Coach OS to other studios eventually? If multi-tenant, the schema changes (add `organization_id` everywhere). Recommendation: build single-tenant for IMS now, refactor to multi-tenant only if and when you have a second customer.
7. **Hire vs DIY:** Will you build this with a developer (or yourself + Claude Code), or contract it out? Tooling choices change slightly based on this.

---

## 18. Final Recommendation

Do not build this all at once.

Build the **MVP cut** first:
- Auth working for 3 roles
- Public intake + waiver flow (no automations yet)
- Trainer dashboard with today view + session log
- Client dashboard with today + plan view
- Existing Python generator deployed and integrated

That's a 4-week sprint. Ship it. Use it for 2 weeks with current clients. Then build out automations, owner dashboard, and the rest.

**Don't try to build the perfect thing. Build the thing that runs your studio. Then make it better every week.**

---

*IMS Coach OS · Confidential Build Specification · 2026*
*Maintained alongside IMS_Master_Document.docx as the single source of truth for the digital ecosystem build.*
