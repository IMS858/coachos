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
4. Set one `IMS_BASE_URL` production/staging origin in build configuration rather than hard-coding secrets. Web login and native API requests must use the same origin so the authenticated cookie session is not split across hosts.
5. Add Apple Team ID and APNs credentials to the server environment only.
6. Replace web-backed training surfaces progressively with native views; do not ship as a website-only wrapper.


## Apple Health / HealthKit release requirements

The source includes a read-only HealthKit evidence layer. Before TestFlight/App Store distribution:
- Add the HealthKit capability and use `IMSFitness.entitlements` for the app target.
- Add `NSHealthShareUsageDescription` to the target Info settings. Suggested purpose: "IMS Fitness uses the activity, workout, sleep and weight data you choose to share to give your coach context between training sessions and body-composition assessments."
- Do not request `NSHealthUpdateUsageDescription` unless IMS later writes HealthKit samples; the current integration is read-only.
- Enable HealthKit Background Delivery only when observer queries are wired at app launch and device-tested. The entitlement alone does not create background sync.
- Test authorization, limited-history access, revoked access, no-data days, timezone changes and background delivery on a physical iPhone/Apple Watch. HealthKit background delivery is not supported by the Simulator.
- Keep Coach OS semantics fail-closed: HealthKit does not reveal which read types were denied, so absent samples must remain unavailable/not reported, never zero.
- The embedded login webview must finish cookie adoption before native API sync is treated as authenticated.
