# Acquisition Intelligence — three-source read-first release

## What is shipped

`/growth/acquisition`, linked prominently from Growth Center, combines **separate** Search Console,
GA4 and Google Business Profile reports. It does not create a joined person-level funnel.
Google Ads is intentionally excluded while owner account security verification is pending.
Existing Research Desk, private Fuel, communications and mobile sign-out changes are preserved.

Search Console includes property-level web KPIs and the prior equal-length period, filtered web-query
evidence (minimum 10 impressions), configurable IMS brand-term matching and original page URLs.
GA4 includes property summary, hostnames, session source/medium, landing pages and event/key-event
counts when actually returned. An empty result is not zero website visitors or proof that the tag is
missing. The property label does not establish which hostname is measured. Business Profile includes
surface/device impressions, website/call clicks, direction requests and Reserve with Google bookings;
lifetime review count/rating is separately labeled as current metadata at retrieval.

The deterministic `ims-acquisition-v1` rules flag measurement gaps, unusual high-average-position /
zero-click query evidence, URL variants that merit canonical/redirect review, and local link attribution.
These are review suggestions, not forecasts, validated SEO diagnoses or automated budget decisions.
Owner-saved actions retain their snapshot IDs, notes, due date, revision and audit receipt. A tagged-link
builder only permits configured HTTPS website hosts and removes old query parameters. It never updates
Google Business Profile. No review-author identities, review text, event parameters or client health data
are ingested. No Google tags, website content, ads, public posts or conversion uploads are changed.

## Connection distinction and installation

Windsor authorization in ChatGPT allows authorized connector snapshots to be inspected/imported here;
it does **not** transfer the user's credentials into a deployed Next.js app. Registry entries and source
IDs are stored privately in Supabase, not seeded into public source code. Initial bootstrap records use
`origin=connector_import`, null actor and an explicit connector-import audit, not forged owner JWTs or
fabricated app refreshes. Import only real returned rows and explicitly documented report omissions.

Apply reviewed migration `0096_acquisition_intelligence.sql` after the current baseline. It adds five
owner-read tables and limited append/versioned commands. It does not modify client, payment, package,
appointment or authorization policy tables. Use the service-only `save_acquisition_snapshot` for a
validated connector import. The fingerprint is SHA-256 of the normalized stored JSONB representation;
it is NOT claimed to be the hash of the original Google response bytes.

For server refresh, configure **WINDSOR_API_KEY** securely in Vercel for the intended environment. Never
put it in chat, source control, browser state or a `NEXT_PUBLIC` setting. No new Google login or Ads
permission is requested by this adapter. API subscription/entitlements still apply. The app's presence
indicator does not certify that upstream credentials, scope or billing work: verify a real read.

Manual refresh is owner-authenticated, same-origin, one explicitly selected source and at most 90 past
days with an equal prior period. At most three parallel report reads per source, 18-second upstream
request timeout, bounded 1.5 MB responses, 1,000 rows per report. Reaching that ceiling is `limited`, not
complete. Missing fields become explicit nulls and validation rejects invalid numeric types, negative
counts, account mismatches, duplicate grains and contradictory statuses. Query parameters are fixed
from declared report specs: no arbitrary external fetch endpoint or write action is accepted.

Windsor Connectors API currently requires query-parameter authentication. The server uses only
`https://connectors.windsor.ai/<allowlisted-source>`, disallows redirects, and never logs raw fetch errors,
URLs, credentials or provider bodies. Configure any external tracing to redact `api_key` query parameters.
Only safe failure categories appear in snapshot notes. A failed read preserves older snapshots. A
completed refresh means a saved report result, not necessarily available/complete data for every report.

Daily read synchronization defaults **off** in the source registry. The owner can explicitly enable it
only when the app has a credential configured. `/api/cron/acquisition-sync` requires CRON_SECRET and
production environment; previews cannot trigger scheduled reads. The once-daily job is at 15:00 UTC
(8 AM PDT / 7 AM PST), uses a three-day reporting buffer and deterministic per-source/day request IDs.
No more than eight dispatches per source in 24 hours. Retries recover the same reservation; an interrupted
read remains recorded and consumes its allowance. Owner revocation is rechecked at persistence.

## Metric semantics and limits

- Property-level Search Console totals do not equal the sum of page/query breakdowns. Google may omit
  query rows for privacy or internal row limits. Query rows are not keyword search volume.
- CTR is clicks divided by impressions from the same report; zero denominator is not zero CTR.
- Average position is preserved as reported. It is not computed by averaging query averages and is not
  a universal local rank. Brand classification uses owner-specified aliases, not domain-substring defaults.
- GA4 distinct users must not be summed across pages, hostnames, source/medium or periods. Session and
  event scopes remain different. `conversions` is Windsor's discovered field for GA4 key-event counts;
  no key event is silently called a qualified lead or a client.
- GBP call-button clicks are not answered calls; directions are not visits. Reserve with Google bookings
  are not Coach OS appointments. Reviews shown in profile metadata are lifetime totals at retrieval.
- Report periods follow source conventions; GA4 property and GBP reporting timezones remain unverified
  until inspected. Never claim exact cross-source cohort reconciliation from matching calendar labels.
- `observed_at` identifies connector-read observation, not the upstream cache timestamp or finalization.
  A last-3-days buffer reduces fresh-data uncertainty but is not a guarantee of complete data.
- Real inquiries, consultations, client conversions and successful payments remain in the existing CRM /
  Growth Center with their own evidence. This release does not identify people from Google queries or
  stitch anonymous GA4 sessions to client medical, nutrition or financial records.

## Remaining acceptance / conversion work

Verify app runtime access with the dedicated Windsor connection and the intended three account IDs.
Review GA4 actual web stream / hostname / consent / Realtime before assuming useful session metrics.
Perform owner, trainer, client and disabled-owner direct-URL/endpoint acceptance on an integrated preview.
Source snapshot tables and actions are owner-only. Test mobile scrolling, evidence export, task save/retry,
source refresh and the production-only scheduler toggle without starting ads or posts.

Website lead capture and enhanced conversions are a separate consent/measurement rollout. The existing
website inquiry endpoint remains unchanged. Confirm successful-form events, referral/UTM capture,
consultation outcome definitions and individual release/consent before sending any lead identifiers to
Google. No outbound conversion payload is implemented or submitted in this three-source read release.
Do not bypass the Google Ads security hold. Add Ads reporting only after its authorized connection exists.

## Primary references reviewed

- https://windsor.ai/api-documentation/ — fixed connector API, account selection, query authentication,
  date windows, field discovery, row limits, read/write distinction.
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query — source scope, dimensions,
  date windows and internal limitations / top-row coverage.
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema — hostnames,
  session acquisition, distinct users and key events.
- https://developers.google.com/my-business/reference/performance/rpc/google.mybusiness.performance.v1 —
  surface/device metrics, call and website clicks, direction requests and Reserve with Google bookings.

All tests use isolated synthetic fixtures. No real analytics, client, health, billing or API secrets are
committed to this repository. Exact-head regression/lint/TypeScript/production-build/iOS compile evidence
is required before treating this as a verified release. Build green is not authenticated live acceptance.
