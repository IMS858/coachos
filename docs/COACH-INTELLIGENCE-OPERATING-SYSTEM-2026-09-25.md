# IMS Coach OS — Coach Intelligence + Operating System Checkpoint
Build branch: release/ims-unified-2026-09

## Product distinction
Coach OS is not a scheduling CRM with fitness branding. The staff experience now connects:
client evidence -> coach next action -> programming -> session prep -> durable history -> continuity -> business operations.

The client experience remains intentionally simpler:
Today -> Train -> Progress -> Coach -> Book -> Me.

## Coach Intelligence
- Client profile includes an evidence-backed Coach Brief.
- Coaching mode is derived from recorded delivery/programming evidence: Getting started, Programming only, In-person, or Hybrid.
- Next actions are deterministic rules from package runway, upcoming bookings, completed-session gap, assessment status and program state.
- No churn probability, medical inference, hidden score or fabricated recommendation.
- Session detail includes a pre-session brief so the coach sees context before logging the session.
- Trainer Today shows lightweight package/program/assessment prep context on each scheduled client.

## Durable coaching history
- Client profile combines completed/no-show/late-cancel sessions, assessments, program events and body-composition records into one chronological coaching timeline.
- Program Decision Trail gives staff an immutable place to record why a meaningful progression, regression, technique, assessment, tolerance or schedule decision was made.
- Decision notes never publish to clients and never alter exercise approval or program release state.

## Owner operating system
/operating-system is a cross-domain state view, not another task list.
- Action Center = what needs handling.
- Business Overview = business metrics.
- IMS Operating System = whether the coaching, growth, revenue and team loops are connected.
- /capacity shows declared trainer availability, blocked time, booked overlap, open declared time, outside-hours sessions and blocked-time conflicts.
- Client continuity signals are factual schedule/package gaps only; they are not churn predictions.

## Database rollout
Hosted ims-coach-os now includes:
- 0043 payroll_evidence_reviews
- 0044 staff_operations
- 0045 growth workspace

0046 program_decision_notes is staged in the repository and must only be applied after the exact branch head is fully green. It is additive and staff-only.

## Deployment
Automatic Vercel previews remain disabled for the release branch. Continue:
BUILD MANY -> CI MANY -> CONSOLIDATE -> ONE PREVIEW.
Do not start Vagaro migration during this block.
