# IMS Coach OS — Vercel preview launch checklist (2026-09-23)

## Verified
- Coach OS draft PR #3: feature/generator-integration-hardening-2026-09 → main. Do not merge before release gates are met.
- Generator latest full suite passed 290 tests.
- Vercel connector currently shows no accessible teams; deployment action is unavailable. No preview or production deployment has been verified.

## Owner computer session
1. Open https://vercel.com/dashboard. Check account/team selector; find IMS Coach OS project or import IMS858/coachos as Next.js with repo root.
2. Settings → Git: connect IMS858/coachos, production branch main. Keep PR #3 as a preview, not production.
3. Settings → Environment Variables: confirm Preview scope uses isolated staging Supabase keys. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are public client config; SUPABASE_SERVICE_ROLE_KEY is server-only. Explicitly set PROGRAM_GENERATOR_URL to the verified staging generator endpoint.
4. Set IMS_GENERATOR_CLIENT_RELEASE_APPROVED=false in every environment until coach exercise sign-off.
5. Review other referenced env names for Stripe, Resend, CRON_SECRET and webhooks. Do not share values in chat or commit them.
6. Settings → Deployment Protection: require authentication on previews. Use fictional client data only.
7. Open https://github.com/IMS858/coachos/pull/3 and check GitHub CI and Vercel preview build. Confirm preview SHA matches the feature branch.
8. Synthetic owner login must land on Today. Check trainer shared access, client self-only access, PDF authorization and blocked restricted programs.
9. Do not promote preview until 423 canonical exercise review/release policy is resolved, owner sign-off and end-to-end checks are complete.

## Blockers
- Vercel account/team and project linkage are not visible through the current connector.
- PR #3 was draft and mergeability state unstable at last check.
- Exercise mapping/safety approvals are incomplete; client publishing remains locked.