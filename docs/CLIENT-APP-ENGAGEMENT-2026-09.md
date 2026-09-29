# Client app engagement — private Coach OS telemetry

This release upgrades the legacy `app_events` feature instead of creating a second analytics system.

## Purpose
Show the owner and a client's assigned trainer whether the client is actually using Coach OS: last recorded activity, active days, major surfaces visited, coaching videos opened, coach messages sent, and training requests submitted. These are app-engagement signals only. A quiet app is not treated as proof that a client stopped training, churned, ignored coaching, or needs intervention.

## Privacy boundary
New events contain only server-observed client identity, timestamp, one allowlisted event code and one allowlisted product surface. Raw URLs, session/client IDs, free text, message contents, video titles, nutrition/health values, IP addresses, device/user-agent data, fingerprints, location and Google Analytics identifiers are not accepted. Staff page views are no longer recorded. Existing legacy rows are retained as historical evidence but are normalized to finite surfaces when displayed.

Direct authenticated inserts into `app_events` are revoked. `record_client_app_event` derives identity from `auth.uid()`, accepts a request UUID for idempotency, limits event vocabulary and rate, and ignores non-client actors. The raw table remains owner-readable under RLS. The aggregate view is service-role only. `get_client_app_engagement` is owner or assigned-primary-trainer only and returns only normalized aggregates/recent event codes.

## Product integration
- Client AppShell records a throttled surface view; staff AppShell does not.
- Coaching video opens record `watch/training` without media id/title.
- Successfully saved client training requests record `book/booking`.
- Successfully sent messages call the usage endpoint; the database records only client sends.
- Client profile includes an App engagement panel.
- Owner Reports → App usage continues to show roster-level activity, with portal provisioning and recorded-active-days semantics.

Client usage stays inside Coach OS. It is not sent to GA4, Google Ads or the public-site acquisition analytics. Aggregate retention analysis can be added later without exporting client-level behavior.
