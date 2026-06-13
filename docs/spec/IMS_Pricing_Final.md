# IMS Coach OS — Pricing Lock-In (Final)

**Supersedes pricing sections of `IMS_Stripe_Pricing_Policies.md`.**
**This is the final pricing structure. Build to this.**

---

## 0. Final Decisions

| Decision | Locked Value |
|---|---|
| Cancellation window | **12 hours** (matches live site, no migration friction) |
| Late cancel fee for non-members | **$50** (existing default) |
| Late cancel fee for drop-ins | **session forfeited** (no refund on $25 drop-in) |
| Team roster | Jason, Gabriel, Kara — **3 trainers** (Alex Cost not on team) |
| Recovery for training members | **All recovery included free** |
| Recovery-only membership | **$100/month** (same recovery access as training members, no training) |
| Drop-in recovery | **$25 per visit** (one modality per visit) |
| Recovery service slots | **6 known + 3 editable placeholders** (configurable in system) |

---

## 1. The Three-Tier Pricing Structure

```
┌─────────────────────────────────────────────────────────┐
│  TRAINING MEMBERSHIP                                    │
│  $780 / $1,169 / $1,559  per month                      │
│  Sessions: 2x / 3x / 4x per week                        │
│  Recovery: ALL services included free                   │
│  Programming: personalized, FRC-based                   │
│  Best for: clients who want full coaching + recovery    │
└─────────────────────────────────────────────────────────┘
                            │
                            │ same recovery access
                            ▼
┌─────────────────────────────────────────────────────────┐
│  RECOVERY MEMBERSHIP                                    │
│  $100 / month                                           │
│  All recovery services unlimited                        │
│  No training sessions included                          │
│  Best for: training member's spouse, ex-clients         │
│  staying connected, neighborhood drop-ins               │
└─────────────────────────────────────────────────────────┘
                            │
                            │ open door
                            ▼
┌─────────────────────────────────────────────────────────┐
│  DROP-IN RECOVERY                                       │
│  $25 per visit                                          │
│  ONE recovery modality per visit                        │
│  Sauna OR compression OR 30-min massage (promo rate)    │
│  No commitment, no membership                           │
│  Best for: friends/family, walk-ins, trial visits       │
└─────────────────────────────────────────────────────────┘
```

This is a smart structure. Three points worth naming:

**The $100 recovery membership is a sneaky retention/reactivation tool.** When a training client takes a break (injury, life event, budget squeeze), instead of going to $0/month and disappearing, they can step down to $100/month recovery-only. They stay in the building. They stay connected to the team. When they're ready to train again, the conversion back is seamless. Without this tier, you lose them entirely.

**The $25 drop-in is a top-of-funnel weapon.** Spouse of a member wants to try the sauna? $25, no friction, in the door. They experience the space. Many of those drop-ins become recovery members or training members within 60 days. This is the "let them in the door" play that adds material annual revenue at near-zero acquisition cost.

**Recovery as a real revenue line, not just an add-on.** Most fitness studios treat recovery as a perk. You're treating it as a standalone service tier with its own membership and drop-in pricing. That's the right move — it's how you turn the recovery room from a cost center into a profit center.

---

## 2. Final Stripe Product Catalog

```
TRAINING MEMBERSHIPS (recurring monthly)
├── Essentials Membership          $780.00/mo    lookup_key: essentials_2x_monthly
├── Standard Membership          $1,169.00/mo    lookup_key: standard_3x_monthly
└── Premium Membership           $1,559.00/mo    lookup_key: premium_4x_monthly

RECOVERY MEMBERSHIP (recurring monthly)
└── Recovery Membership            $100.00/mo    lookup_key: recovery_monthly

SESSION PACKAGES (one-time, 12-month expiry)
├── 6-Session Package              $600.00       lookup_key: package_6
├── 12-Session Package           $1,140.00       lookup_key: package_12
└── 24-Session Package           $2,160.00       lookup_key: package_24

DROP-IN RECOVERY (one-time)
└── Recovery Drop-In                $25.00       lookup_key: recovery_dropin

FEES (system-charged)
└── Late Cancellation Fee           $50.00       lookup_key: late_cancel_fee
```

---

## 3. Recovery Services — Catalog with 3 Editable Placeholders

Recovery services are stored as a **configurable catalog** in the database, not hardcoded. This means Jason can add, rename, or reprice services without a code deploy.

### 3.1 Initial Catalog (Seed Data)

| Slot | Name | Description | Duration | Member Price | Drop-In Price |
|---|---|---|---|---|---|
| 1 | Sauna | Heat-based recovery | 30 min | Free | $25 |
| 2 | Compression Therapy | Pneumatic boots/sleeves | 30 min | Free | $25 |
| 3 | 30-min Massage | Promo-rate therapeutic | 30 min | Free | $25 |
| 4 | 60-min Massage | Standard therapeutic (Kara) | 60 min | Free | $TBD |
| 5 | 90-min Massage | Extended therapeutic (Kara) | 90 min | Free | $TBD |
| 6 | Body Composition | InBody/scan + review | 15 min | Free | $TBD |
| 7 | **PLACEHOLDER 1** | (editable in admin) | — | — | — |
| 8 | **PLACEHOLDER 2** | (editable in admin) | — | — | — |
| 9 | **PLACEHOLDER 3** | (editable in admin) | — | — | — |

The 3 placeholders are inserted as inactive rows so they show up in the admin UI as editable slots. When you decide what they are (red light therapy? cold plunge? PEMF? hyperbaric? cupping? IASTM? whatever the recovery room becomes), Jason fills in the name/duration/price and toggles them active. No engineer involvement needed.

### 3.2 Schema for Configurable Services

Add to `supabase_schema.sql`:

```sql
-- Service catalog (recovery + future a la carte)
CREATE TABLE IF NOT EXISTS service_catalog (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                    text UNIQUE NOT NULL,
  name                    text NOT NULL,
  description             text,
  category                text NOT NULL DEFAULT 'recovery',
  duration_minutes        int,
  member_included         boolean NOT NULL DEFAULT false,
  recovery_member_included boolean NOT NULL DEFAULT false,
  drop_in_eligible        boolean NOT NULL DEFAULT false,
  drop_in_price_cents     int,
  standalone_price_cents  int,
  stripe_price_lookup_key text,
  active                  boolean NOT NULL DEFAULT true,
  display_order           int NOT NULL DEFAULT 0,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_active ON service_catalog(active, display_order);
CREATE INDEX IF NOT EXISTS idx_services_category ON service_catalog(category);

ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_public_read ON service_catalog FOR SELECT TO authenticated
  USING (active = true);
CREATE POLICY services_owner_all ON service_catalog FOR ALL TO authenticated
  USING (is_owner());

-- Seed the initial catalog
INSERT INTO service_catalog (slug, name, description, category, duration_minutes,
  member_included, recovery_member_included, drop_in_eligible, drop_in_price_cents,
  display_order, active) VALUES
  ('sauna',           'Sauna',                'Heat-based recovery',                   'recovery', 30, true, true, true,  2500,  10, true),
  ('compression',     'Compression Therapy',  'Pneumatic compression boots/sleeves',   'recovery', 30, true, true, true,  2500,  20, true),
  ('massage_30',      '30-min Massage',       'Promo-rate therapeutic massage',        'recovery', 30, true, true, true,  2500,  30, true),
  ('massage_60',      '60-min Massage',       'Standard therapeutic massage (Kara)',   'recovery', 60, true, true, false, NULL,  40, true),
  ('massage_90',      '90-min Massage',       'Extended therapeutic massage (Kara)',   'recovery', 90, true, true, false, NULL,  50, true),
  ('body_comp',       'Body Composition',     'Body composition scan with review',     'recovery', 15, true, true, false, NULL,  60, true),
  ('placeholder_1',   '[Recovery Slot 1]',    'Configure in Owner → Services',         'recovery', 30, true, true, true,  2500, 100, false),
  ('placeholder_2',   '[Recovery Slot 2]',    'Configure in Owner → Services',         'recovery', 30, true, true, true,  2500, 110, false),
  ('placeholder_3',   '[Recovery Slot 3]',    'Configure in Owner → Services',         'recovery', 30, true, true, true,  2500, 120, false)
ON CONFLICT (slug) DO NOTHING;
```

### 3.3 Owner UI — Edit a Service

In the owner dashboard there's a **Settings → Services** screen. Each row is editable:

```
┌─────────────────────────────────────────────────────────────┐
│  RECOVERY SERVICES                                          │
├─────────────────────────────────────────────────────────────┤
│  Sauna · 30 min · $25 drop-in · ACTIVE       [Edit] [↑][↓]  │
│  Compression Therapy · 30 min · $25 · ACTIVE [Edit] [↑][↓]  │
│  30-min Massage · 30 min · $25 · ACTIVE      [Edit] [↑][↓]  │
│  60-min Massage · 60 min · — · ACTIVE        [Edit] [↑][↓]  │
│  90-min Massage · 90 min · — · ACTIVE        [Edit] [↑][↓]  │
│  Body Comp · 15 min · — · ACTIVE             [Edit] [↑][↓]  │
│  [Recovery Slot 1] · INACTIVE                [Edit] [↑][↓]  │
│  [Recovery Slot 2] · INACTIVE                [Edit] [↑][↓]  │
│  [Recovery Slot 3] · INACTIVE                [Edit] [↑][↓]  │
│                                                             │
│  [+ Add New Service]                                        │
└─────────────────────────────────────────────────────────────┘
```

When Jason fills in a placeholder (e.g. names it "Cold Plunge — 5 min — $25 drop-in"), saves, and toggles active, three things happen automatically:
1. Database row updates
2. If standalone or drop-in price set, Stripe Product/Price gets created via API
3. Service immediately appears in the booking UI for clients with the right access tier

---

## 4. Access Logic — Who Can Book What

Updated booking authorization rules:

```typescript
function canBookService(
  client: Client,
  service: ServiceCatalogEntry
): { allowed: boolean; charge?: number; reason?: string } {

  const activeMembership = getActiveMembership(client.id);

  // Active training member — recovery is included if service.member_included
  if (activeMembership?.tier.startsWith('essentials_') ||
      activeMembership?.tier.startsWith('standard_') ||
      activeMembership?.tier.startsWith('premium_')) {
    if (service.member_included) {
      return { allowed: true, charge: 0 };
    }
    // Service is not in member benefits — quote standalone price
    return service.standalone_price_cents
      ? { allowed: true, charge: service.standalone_price_cents }
      : { allowed: false, reason: 'Not available to members' };
  }

  // Active recovery membership — recovery is included if service.recovery_member_included
  if (activeMembership?.tier === 'recovery_monthly') {
    if (service.recovery_member_included) {
      return { allowed: true, charge: 0 };
    }
    return { allowed: false, reason: 'Not included in recovery membership' };
  }

  // Active package client — recovery is NOT included; quote drop-in price
  if (activeMembership?.tier.startsWith('package_')) {
    if (service.drop_in_eligible && service.drop_in_price_cents) {
      return { allowed: true, charge: service.drop_in_price_cents };
    }
    return service.standalone_price_cents
      ? { allowed: true, charge: service.standalone_price_cents }
      : { allowed: false, reason: 'Not available' };
  }

  // No membership — drop-in eligible only, $25
  if (!activeMembership) {
    if (service.drop_in_eligible && service.drop_in_price_cents) {
      return { allowed: true, charge: service.drop_in_price_cents };
    }
    return service.standalone_price_cents
      ? { allowed: true, charge: service.standalone_price_cents }
      : { allowed: false, reason: 'Membership required' };
  }

  return { allowed: false };
}
```

The booking UI calls this before showing prices. A training member sees "$0 — included" next to sauna. A drop-in visitor sees "$25." A package client sees "$25" because their package only covers training.

---

## 5. Updated Membership Enum

The schema's `membership_tier` enum needs the new tier added. Run this migration:

```sql
ALTER TYPE membership_tier ADD VALUE IF NOT EXISTS 'recovery_monthly';
```

The enum becomes:
```
membership_tier:
  - essentials_2x          (training, 2x/wk, $780/mo, recovery included)
  - standard_3x            (training, 3x/wk, $1,169/mo, recovery included)
  - premium_4x             (training, 4x/wk, $1,559/mo, recovery included)
  - recovery_monthly       (recovery only, $100/mo, no training)  ← NEW
  - package_6              (6 sessions, $600 one-time)
  - package_12             (12 sessions, $1,140 one-time)
  - package_24             (24 sessions, $2,160 one-time)
```

---

## 6. Cancellation Policy — Final Language (12-Hour)

This is the language that goes on the website, in the intake/waiver, and in booking confirmation emails:

> **IMS Cancellation & Rescheduling Policy**
>
> Your training time is reserved exclusively for you. To respect your coach's schedule and keep slots available for all clients, the following applies to every appointment:
>
> **12-Hour Cancellation Window.** All cancellations and reschedules must be made at least 12 hours before your scheduled session.
>
> **Late Cancellations (less than 12 hours notice).** The session is forfeited. For training members, the session counts against your weekly allotment. For package clients, one session is deducted from your remaining balance. For recovery members and drop-ins, the session/drop-in is forfeited. For non-members without a card on file, a $50 late cancellation fee may apply.
>
> **No-Shows.** Treated identically to late cancellations.
>
> **Rescheduling Within the Window.** Reschedules made 12+ hours in advance are free and unlimited. Reschedules requested within the 12-hour window are treated as a late cancellation unless approved by your coach.
>
> **Coach-Initiated Changes.** If IMS cancels or reschedules a session, your session is preserved at no penalty.
>
> **Emergencies.** If you have a medical emergency, family emergency, or genuine unavoidable conflict, contact your coach directly. We make exceptions for real emergencies — but the policy holds for routine schedule changes.

The 26-hour reminder text mentioned in the previous doc shifts to a **14-hour reminder text** to keep "you have 2 hours before the cancellation window closes" framing intact:

> *"Hey [Name] — IMS session tomorrow at [time]. Need to cancel? You have 2 hours before our 12-hour window closes. [Reschedule link]"*

---

## 7. What Changed From the v1 Stripe Doc

| Item | v1 (Stripe doc) | Final (this doc) |
|---|---|---|
| Cancellation window | 24 hours | **12 hours** |
| Reminder cadence | 26-hour SMS | **14-hour SMS** |
| Membership tiers | 3 training only | **3 training + 1 recovery** |
| Recovery services | À la carte, $TBD | **Free for members, $100/mo standalone, $25 drop-in** |
| Service catalog | Hardcoded enum | **Configurable table with 3 editable slots** |
| Team roster | Jason / Gabriel / Kara / Alex (?) | **Jason / Gabriel / Kara only** |

Everything else from the v1 Stripe doc stands: refund policy, pause policy, dunning workflow, Vagaro migration plan, schema additions for `stripe_customer_id`, refund queue, etc.

---

## 8. What's Locked, What's Still Open

**Locked:**
- 3-tier pricing structure
- 12-hour cancellation
- Team roster (3 trainers)
- Configurable service catalog with 3 editable placeholders
- All previously-locked schema, RLS, dashboard specs, build phases

**Still open (can be decided during build):**
- 60-min and 90-min massage standalone prices (when Kara firms them up)
- What goes in the 3 placeholder slots (Jason fills these in via the admin UI when ready)
- First-month trial pricing or family discount (revenue levers, not blockers)
- Whether $25 drop-in massage is a true 30-min session or a "promo-rate" framing for first-time visitors only

None of these block the build. Ship the foundation, fill in the rest as you go.

---

*IMS Coach OS · Pricing Lock-In · Final*
*Companion to IMS_Ultimate_Build_Spec.md · IMS_Stripe_Pricing_Policies.md · supabase_schema.sql*
