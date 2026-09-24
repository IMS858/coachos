# IMS Fitness iOS source

This directory is the native iOS client source track for bundle `com.imsfitness.app`.

Current foundation:
- SwiftUI app lifecycle and native tab navigation.
- Fail-closed mobile session bootstrap.
- Safe `imsfitness://` deep-link routing.
- Shared authenticated Coach OS web surfaces while native workout/progress screens are built.
- Coach OS APNs/device backend lives in the main Next.js app.

Before an Xcode/TestFlight archive:
1. Create the Xcode project/target with bundle ID `com.imsfitness.app`.
2. Add these Swift sources to the target.
3. Configure Associated Domains and Push Notifications entitlements.
4. Set the production/staging base URL in build configuration rather than hard-coding secrets.
5. Add Apple Team ID and APNs credentials to the server environment only.
6. Replace web-backed training surfaces progressively with native views; do not ship as a website-only wrapper.
