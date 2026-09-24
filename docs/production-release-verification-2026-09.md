# Coach OS release verification — September 2026

## Deployment identity
- Verify the production Vercel deployment is READY and its Git commit matches the intended main branch head.
- Do not equate a green GitHub typecheck with a deployed production build.
- Verify the public login route responds and protected routes require authentication.

## Staff end-to-end acceptance
1. Sign in as an IMS owner; verify Today, Schedule, Daily Agenda, Programs, Assessments, and Exercise Catalog navigation.
2. Compare a known booking against the trainer grid and daily agenda; check Pacific time and daylight-saving boundaries.
3. Open a real assessment; generate a draft; confirm it is not visible as a published client program.
4. Run program preflight. Review generated plan, private coach PDF, client PDF, unsynchronized edits and catalog safety blockers.
5. Confirm the client-release endpoint refuses unapproved mappings, missing safety reviews, missing private PDFs and missing release sign-off.

## Client end-to-end acceptance
1. Sign in as a designated test client; verify required waiver gating.
2. Confirm only assigned, published programs and their approved client PDFs are visible.
3. Confirm assigned exercise videos, upcoming bookings and workout details appear.
4. Verify another client's private programs, PDFs and media cannot be accessed.

## Production release decision
- Automated CI, production build, deployment identity and authenticated role-specific browser checks must all pass.
- Keep IMS_GENERATOR_CLIENT_RELEASE_APPROVED disabled until canonical mapping, exercise safety, PDF regression and owner sign-off are independently complete.
- Never publish a generated draft just because its readiness panel passes.
