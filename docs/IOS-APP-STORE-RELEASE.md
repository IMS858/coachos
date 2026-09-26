# IMS Fitness iOS release track

## Product boundary
The App Store product is **IMS Fitness** for clients. Coach OS remains the staff/owner operating system and shared backend.

## Native client scope
- Sign in / account recovery
- Today / assigned workout
- Program and exercise demonstrations
- Workout logging and completion
- Progress
- Personal Training booking requests and upcoming sessions
- Communications with coach
- Package/account status
- Native push notifications and deep links

## Shared backend
Reuse Coach OS Supabase auth/data and authorized server APIs. Do not create a second client database, billing ledger, package ledger, messaging store or scheduling authority.

## Release sequence
1. Stabilize exact-head Coach OS API contracts and authenticated client flows.
2. Create the iOS client target with production/staging environment separation.
3. Add native auth session storage, navigation, API client and deep links.
4. Add push token registration and notification routing.
5. Device QA through TestFlight against staging.
6. App Store privacy metadata, screenshots, support/privacy URLs and review notes.
7. Production release only after Coach OS database migrations, booking cutover rules and client exercise publication gates are satisfied.

## Safety / launch gates
- Training self-booking only.
- Vagaro remains authoritative until explicit cutover.
- Never expose unpublished exercises or bypass IMS_GENERATOR_CLIENT_RELEASE_APPROVED.
- Package balance is context; session completion is the consumption event.
- Client messages use the same Coach OS message store.
- No production secrets in the mobile bundle.
