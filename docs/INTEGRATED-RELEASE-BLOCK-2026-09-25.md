# IMS Coach OS — Integrated Release Block
Branch: release/ims-unified-2026-09

This block intentionally remains undeployed until its exact head passes the complete quality gate.

## Coaching intelligence
- Durable client timeline and coach brief
- Evidence-backed session prep
- Prescription -> performed exercise evidence
- Repeated exercise history without automatic progression claims
- Immutable program decision reasoning
- Client read-only performed history

## Group coaching
- Private templates and recurring series
- Occurrences with separate release state
- Structured class programs and occurrence assignment history
- Staff class cockpit: plan, roster, attendance, delivery evidence
- Class access products and immutable credit-ledger architecture
- Instructor compensation rules separate from client pricing
- Client class participation history
- Class Intelligence: recorded fill, attendance, waitlist and repeat participation
- Explicit future growth attribution
- Prelaunch booking commands revoked
- Waitlist offer/acceptance architecture staged
- Atomic attendance command staged but ungranted
- Shared schedule-integrity evidence across 1:1, classes and blocks

## Owner operations
- IMS Operating System
- Capacity and continuity evidence
- Staff Control Center
- Deterministic payroll final-preview readiness
- Action Center class-prep queue distinct from trainer Today

## Hosted database
Hosted Supabase is intentionally behind the repository for this block. Do not partially apply 0046+ until exact-head CI is green and the ordered migration set has been reviewed as one release.

## Deployment
No Vercel preview during incremental work.
BUILD MANY -> CI MANY -> CONSOLIDATE -> ORDERED DB ROLLOUT -> ONE PREVIEW -> PHONE QA.
