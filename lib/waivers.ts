/**
 * Waiver documents — the single source of truth.
 *
 * These previously lived in two places: the text inside the intake component,
 * and the version string inside the intake API. That's exactly how a waiver
 * ends up recorded under a version whose wording nobody can reproduce. Both
 * flows (first-time intake and re-signing) now read from here.
 *
 * BUMPING A VERSION
 * Change `version` on a document when its wording materially changes. Everyone
 * who signed an older version is then treated as out of date and re-prompted.
 * Cosmetic edits shouldn't bump it — that would drag the whole roster through
 * a re-sign for nothing.
 */

/** How long a signature stands before it's re-collected. */
export const WAIVER_VALIDITY_MONTHS = 12;

export type WaiverDoc = {
  type:
    | "liability"
    | "massage_consent"
    | "minor_consent"
    | "photo_release"
    | "telehealth"
    | "communications"
    | "membership_agreement"
    | "package_terms"
    | "facility_use";
  title: string;
  body: string;
  required: boolean;
  version: string;
  /**
   * Who this document applies to.
   *   all      — everyone
   *   massage  — only clients receiving hands-on bodywork
   *   minor    — only participants under 18
   * Keeps the signing flow honest: nobody should be made to sign a massage
   * consent for a service they don't receive.
   */
  appliesTo?: "all" | "massage" | "minor" | "membership" | "package" | "partner";
};

export const WAIVER_DOCS: WaiverDoc[] = [
  {
    type: "liability",
    version: "2026-07-liability-v2",
    title: "Liability Waiver & Assumption of Risk",
    required: true,
    appliesTo: "all",
    body: `In consideration for being permitted to participate in services offered by Innovative Movement Solutions ("IMS") — including but not limited to Bod Pod body composition testing, massage therapy, recovery services, and/or personal training or fitness programs — I, the undersigned, acknowledge and agree to the following.

━━━━━━━━━━━━━━━━━━━━
1. WAIVER OF LIABILITY
━━━━━━━━━━━━━━━━━━━━
I fully understand and acknowledge that these services involve physical exertion, manipulation of the body, and/or exposure to various types of equipment.

I knowingly and voluntarily waive, release, and discharge Innovative Movement Solutions, its owners, employees, agents, contractors, and representatives from any and all claims, demands, damages, rights of action, or causes of action — present or future, whether known or unknown — arising out of or connected with my participation.

This waiver is intended to be as broad and inclusive as permitted under California law, including but not limited to California Civil Code Section 1542, which states:

"A general release does not extend to claims that the creditor or releasing party does not know or suspect to exist in his or her favor at the time of executing the release and that, if known by him or her, would have materially affected his or her settlement with the debtor or released party."

I expressly waive the provisions of Section 1542 and any similar rights under federal or state law.

━━━━━━━━━━━━━━━━━━━━
2. ASSUMPTION OF RISK
━━━━━━━━━━━━━━━━━━━━
I understand and acknowledge that participation in Bod Pod testing, massage therapy, recovery services, and/or physical training at IMS involves inherent risks, which may include, but are not limited to: physical exertion, allergic reactions, muscle strain, dehydration, stress, changes in body temperature or composition, cardiovascular events, falls, or other potential injuries or medical complications.

I affirm that I am in good physical condition, have disclosed all relevant health issues, and have either received medical clearance or accept full responsibility for any risks.

I understand that IMS does not diagnose, treat, or prevent medical conditions, and that participation is entirely voluntary. I knowingly and voluntarily assume all risks, known or unknown, associated with these services.

━━━━━━━━━━━━━━━━━━━━
3. MEDICAL CLEARANCE & DISCLOSURE
━━━━━━━━━━━━━━━━━━━━
IMS recommends that I consult a physician before beginning any exercise program, particularly if I am over 40, have been sedentary, am pregnant or recently postpartum, or have any cardiovascular, respiratory, metabolic, orthopedic, or neurological condition.

I agree to disclose all relevant medical conditions, medications, injuries, and surgeries, and to promptly inform IMS of any change in my health status, including any new injury, illness, pregnancy, or medication.

I understand that withholding or misstating health information may increase my risk of injury and that IMS relies on the accuracy of what I disclose when programming my training.

━━━━━━━━━━━━━━━━━━━━
4. STOPPING & REPORTING
━━━━━━━━━━━━━━━━━━━━
I understand I may stop, pause, or decline any exercise, technique, or service at any time, for any reason, without explanation.

I agree to immediately report to IMS staff any pain, dizziness, shortness of breath, light-headedness, or unusual discomfort experienced during a session, and to report any injury before leaving the premises.

━━━━━━━━━━━━━━━━━━━━
5. EMERGENCY CARE
━━━━━━━━━━━━━━━━━━━━
I authorize IMS staff to summon emergency medical assistance on my behalf if they believe it is warranted, and I accept financial responsibility for any resulting emergency transport or treatment.

I understand that an automated external defibrillator (AED) is maintained on the premises in accordance with California Health and Safety Code section 104113, and that IMS staff are not medical professionals. I release IMS and any person rendering emergency care in good faith from liability to the extent permitted by California law.

━━━━━━━━━━━━━━━━━━━━
6. FACILITY RULES & PERSONAL PROPERTY
━━━━━━━━━━━━━━━━━━━━
I agree to follow posted facility rules and staff instructions, to use equipment only as directed and only after instruction, and to conduct myself in a manner that is safe and respectful toward staff and other clients.

I understand IMS is not responsible for loss, theft, or damage to personal property brought onto the premises, including items left in changing areas, lockers, or vehicles.

━━━━━━━━━━━━━━━━━━━━
7. INDEMNIFICATION & HOLD HARMLESS
━━━━━━━━━━━━━━━━━━━━
To the fullest extent permitted under California law, I agree to indemnify, defend, and hold harmless Innovative Movement Solutions — including its owners, employees, agents, affiliates, successors, and assigns — from and against any and all claims, demands, losses, liabilities, costs, or expenses (including attorneys' fees) arising from or related to my participation in Bod Pod testing, massage therapy, recovery services, or fitness/training services.

This includes claims arising from the ordinary negligence of IMS, its staff, or contractors, but excludes claims that result from gross negligence, recklessness, or willful misconduct, which cannot be waived under California law.

━━━━━━━━━━━━━━━━━━━━
8. GOVERNING LAW & VENUE
━━━━━━━━━━━━━━━━━━━━
This agreement is governed by the laws of the State of California, without regard to its conflict-of-law principles. Any dispute arising out of or relating to this agreement or my participation shall be brought exclusively in the state or federal courts located in San Diego County, California, and I consent to personal jurisdiction there.

━━━━━━━━━━━━━━━━━━━━
9. SEVERABILITY & ENTIRE AGREEMENT
━━━━━━━━━━━━━━━━━━━━
If any provision of this agreement is held invalid or unenforceable, that provision shall be limited or severed to the minimum extent necessary, and the remaining provisions shall continue in full force and effect.

This agreement, together with any separate membership or service agreement, is the entire agreement between me and IMS regarding these subjects, and supersedes any prior oral or written understanding. It binds my heirs, executors, administrators, and assigns.

━━━━━━━━━━━━━━━━━━━━
By signing below, I acknowledge that I have read and understood this entire agreement, that I have had the opportunity to ask questions, that I am signing freely and voluntarily, that I am 18 years or older, and that I agree to the use of electronic records and signatures.`,
  },

  {
    type: "massage_consent",
    version: "2026-07-massage-v1",
    title: "Massage & Bodywork Consent",
    required: true,
    appliesTo: "massage",
    body: `This consent applies to massage therapy, soft-tissue work, and any hands-on assessment or manual technique provided at Innovative Movement Solutions ("IMS").

━━━━━━━━━━━━━━━━━━━━
1. NATURE OF THE WORK
━━━━━━━━━━━━━━━━━━━━
I understand that massage and bodywork involve physical touch and manipulation of muscle and soft tissue, and may involve contact with areas including the back, shoulders, neck, hips, glutes, abdomen, arms, and legs, as clinically appropriate to my presenting concern.

I understand this work is intended to support relaxation, recovery, mobility, and general wellbeing. It is not a substitute for medical care and no diagnosis or treatment of any medical condition is offered or implied.

━━━━━━━━━━━━━━━━━━━━
2. SCOPE OF PRACTICE
━━━━━━━━━━━━━━━━━━━━
I understand that massage services are provided by practitioners operating within the scope of California massage practice, and that practitioners providing massage for compensation are certified by the California Massage Therapy Council (CAMTC) where required by law.

I understand IMS practitioners do not perform chiropractic adjustment, physical therapy, medical diagnosis, or prescription of any kind, and that any nutritional or lifestyle guidance offered is educational rather than medical.

━━━━━━━━━━━━━━━━━━━━
3. CONSENT, DRAPING & MY RIGHT TO STOP
━━━━━━━━━━━━━━━━━━━━
I understand that I will be appropriately draped at all times, that only the area being worked will be undraped, and that I may remain fully clothed if I prefer.

I understand that I may decline any technique, ask that work on any area stop or not begin, adjust pressure, or end the session entirely at any point, for any reason, without explanation and without penalty.

I understand that no sexual or romantic conduct of any kind is permitted or tolerated, by either practitioner or client, and that any such conduct will end the session immediately.

I agree to tell my practitioner if anything is painful or uncomfortable, and understand that some techniques may produce temporary soreness for 24 to 48 hours.

━━━━━━━━━━━━━━━━━━━━
4. DISCLOSURE
━━━━━━━━━━━━━━━━━━━━
I have disclosed all relevant medical conditions, injuries, surgeries, allergies (including to oils, lotions, or latex), skin conditions, medications including blood thinners, and any pregnancy, and I will inform my practitioner of any change.

I understand that certain conditions may make massage inadvisable, and that IMS may decline or modify a service on that basis.

━━━━━━━━━━━━━━━━━━━━
By signing below, I acknowledge that I have read and understood this consent, that I have had the opportunity to ask questions, and that I consent to receive massage and bodywork services at IMS.`,
  },

  {
    type: "minor_consent",
    version: "2026-07-minor-v1",
    title: "Parent / Guardian Consent for a Minor",
    required: false,
    appliesTo: "minor",
    body: `This consent is completed by the parent or legal guardian of a participant under 18 years of age.

━━━━━━━━━━━━━━━━━━━━
1. AUTHORITY & CONSENT
━━━━━━━━━━━━━━━━━━━━
I certify that I am the parent or legal guardian of the minor participant named in this account, and that I have full legal authority to consent to their participation and to sign this agreement on their behalf.

I consent to the minor's participation in training, assessment, and recovery services at Innovative Movement Solutions ("IMS").

━━━━━━━━━━━━━━━━━━━━
2. WAIVER, RELEASE & INDEMNITY
━━━━━━━━━━━━━━━━━━━━
On behalf of myself, the minor, and our respective heirs and assigns, I agree to the terms of the IMS Liability Waiver & Assumption of Risk, and I release and hold harmless IMS to the fullest extent permitted by California law for claims arising from the minor's participation, excluding gross negligence, recklessness, or willful misconduct.

I understand that California law limits the extent to which a parent may release a minor's own future claims, and that this agreement is intended to be enforced only to the extent the law permits.

━━━━━━━━━━━━━━━━━━━━
3. SUPERVISION & MEDICAL AUTHORISATION
━━━━━━━━━━━━━━━━━━━━
I understand IMS will determine, at its discretion, whether the minor may train unaccompanied, and I agree to any supervision requirement IMS sets.

I authorise IMS staff to summon emergency medical care for the minor if they believe it is warranted, and I accept financial responsibility for any resulting treatment or transport. I have provided current emergency contact details and will keep them up to date.

━━━━━━━━━━━━━━━━━━━━
4. PHOTOGRAPHY
━━━━━━━━━━━━━━━━━━━━
I understand that no image or recording of the minor will be used for marketing or social media unless I separately and expressly grant permission.

━━━━━━━━━━━━━━━━━━━━
By signing below, I confirm I am the parent or legal guardian, that I have read and understood this consent and the Liability Waiver, and that I agree to the use of electronic records and signatures.`,
  },

  {
    type: "photo_release",
    version: "2026-07-photo-v2",
    title: "Photo & Video Release",
    required: false,
    appliesTo: "all",
    body: `I grant Innovative Movement Solutions ("IMS") permission to photograph and video record me during sessions and to use those images and recordings in:

- IMS social media posts (Instagram, Facebook, YouTube, and similar)
- IMS marketing materials (website, brochures, advertising)
- IMS internal training and case study materials

I understand:

- I will not be identified by full name without my additional written consent.
- I may revoke this release at any time by emailing jason@imsmethod.com. Revocation applies to future use only — content already published or distributed may remain in circulation.
- I will not receive compensation for the use of my image.
- I waive any right to inspect or approve the finished materials.
- This release does not cover any image of a minor, which requires separate parent or guardian consent.
- Other clients may photograph or record in shared areas of the facility, and IMS cannot control the conduct of third parties.

This release is entirely optional. Declining will not affect my training, my access to any service, or my relationship with IMS in any way.`,
  },

  {
    type: "telehealth",
    version: "2026-07-telehealth-v2",
    title: "Remote Coaching Consent",
    required: false,
    appliesTo: "all",
    body: `From time to time, IMS may offer remote coaching sessions, programme reviews, or follow-up consultations conducted by video call, phone, or asynchronous messaging and video.

I acknowledge:

- Remote coaching is not a substitute for in-person assessment where physical evaluation is needed, and IMS may require me to attend in person before continuing.
- Communication by video, phone, or messaging carries inherent privacy limitations. IMS uses reputable platforms but cannot guarantee absolute confidentiality, and technical failure may interrupt or prevent a session.
- IMS coaches are not licensed medical providers. Guidance given remotely is educational and instructional, not medical advice, diagnosis, or treatment.
- I am responsible for my own environment during a remote session, including adequate space, safe equipment, and stopping if anything feels unsafe.
- Sessions are not recorded without my knowledge, and any recording made for coaching review will be shared only with me.

I consent to receive remote coaching services from IMS as part of my membership or programme.`,
  },

  {
    type: "communications",
    version: "2026-07-comms-v1",
    title: "Contact Preferences",
    required: false,
    appliesTo: "all",
    body: `IMS will always send you the messages needed to run your training — appointment confirmations, reminders, cancellations, billing notices, and replies to messages you send us. Those are part of the service and are not marketing.

This consent covers everything beyond that.

I agree that IMS may send me occasional email or text messages about studio news, schedule changes, workshops, promotions, and offers.

I understand:

- Message frequency varies, and standard message and data rates may apply.
- I may opt out of texts at any time by replying STOP, and out of marketing email using the unsubscribe link in any message.
- Opting out of marketing will not affect service messages, my training, or my membership.
- IMS will not sell or rent my contact details to any third party.

This consent is optional and may be withdrawn at any time.`,
  },
  {
    type: "membership_agreement",
    version: "2026-07-membership-v2",
    title: "Monthly Membership Agreement",
    required: false,
    appliesTo: "membership",
    body: `This agreement covers monthly membership at Innovative Movement Solutions ("IMS"), 10650 Scripps Ranch Blvd, San Diego, CA 92131 · (619) 937-1434.

━━━━━━━━━━━━━━━━━━━━
YOU MAY CANCEL THIS AGREEMENT AT ANY TIME PRIOR TO MIDNIGHT OF THE THIRD BUSINESS DAY AFTER THE DATE YOU SIGN IT. TO CANCEL, EMAIL jason@imsmethod.com OR DELIVER WRITTEN NOTICE TO THE ADDRESS ABOVE. IF YOU CANCEL WITHIN THAT PERIOD YOU WILL RECEIVE A FULL REFUND OF ALL AMOUNTS PAID.
━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━
1. WHAT'S INCLUDED
━━━━━━━━━━━━━━━━━━━━
Your membership tier sets the number of coached sessions per week, together with access to the recovery services included at your tier. Sessions are one-to-one unless your agreement says otherwise. Details of your tier and monthly rate are shown on your account and in your welcome email.

━━━━━━━━━━━━━━━━━━━━
2. YOUR RESERVED TIME
━━━━━━━━━━━━━━━━━━━━
Your membership reserves a recurring weekly slot held in your name. Because that time is held for you and not offered to anyone else, it is reserved whether or not you attend.

Unused sessions do not roll over from one month to the next. A membership buys access to a standing place in the schedule, not a bank of credits — if you want sessions that accumulate, a package is the better fit and we're happy to switch you.

━━━━━━━━━━━━━━━━━━━━
3. CHANGING OR CANCELLING A SESSION
━━━━━━━━━━━━━━━━━━━━
Give at least 24 hours' notice and you may reschedule that session, free of charge, to any available slot within the same seven days. Your reserved time is unaffected — it stays yours the following week as normal.

With less than 24 hours' notice, or if you don't attend, the session is considered used and cannot be made up. That time was held for you and could not be offered to anyone else.

Rescheduled sessions must be taken within that seven-day window. They don't carry into the following month, and a session missed inside the notice period isn't replaced. Your monthly rate is unaffected in every case — you've already paid for the month.

━━━━━━━━━━━━━━━━━━━━
4. BILLING
━━━━━━━━━━━━━━━━━━━━
Your membership bills monthly in advance on the same date each month, automatically, to the payment method on file. You authorise IMS to charge that method until this agreement ends. Keeping the card current is your responsibility; a failed payment may suspend access until it's resolved.

━━━━━━━━━━━━━━━━━━━━
5. CANCELLING YOUR MEMBERSHIP — 30 DAYS' NOTICE
━━━━━━━━━━━━━━━━━━━━
After any initial term, you may cancel at any time by giving written notice — email to jason@imsmethod.com is sufficient — at least 30 days before your next billing date.

Your membership continues, and your reserved time remains yours, through the end of that 30-day notice period. One further payment may fall due within it. There is no cancellation fee.

━━━━━━━━━━━━━━━━━━━━
6. PAUSING
━━━━━━━━━━━━━━━━━━━━
You may pause your membership once per calendar year for up to 60 days by giving 14 days' written notice. Your reserved time is held during a pause where the schedule allows; if it can't be held, we'll tell you before the pause begins and find you the closest alternative on return.

━━━━━━━━━━━━━━━━━━━━
7. CANCELLING FOR DEATH, DISABILITY OR RELOCATION
━━━━━━━━━━━━━━━━━━━━
As provided by California law, this agreement may be cancelled and a pro-rata refund of unused prepaid amounts issued if:
· you die — by your estate;
· you become disabled such that you cannot receive the services, on presentation of a physician's verification; or
· you move more than 25 miles from the studio and IMS cannot provide comparable services within that distance, on presentation of proof.

━━━━━━━━━━━━━━━━━━━━
8. RATE CHANGES
━━━━━━━━━━━━━━━━━━━━
Your rate is fixed for at least 12 months from signing. After that, IMS may change it with at least 30 days' written notice. If you don't accept a change you may cancel before it takes effect without giving the 30-day notice in section 5.

━━━━━━━━━━━━━━━━━━━━
9. TERM
━━━━━━━━━━━━━━━━━━━━
This agreement continues month to month until cancelled under section 5, and in no event exceeds the maximum term permitted by California law.

━━━━━━━━━━━━━━━━━━━━
10. OTHER TERMS
━━━━━━━━━━━━━━━━━━━━
This agreement is governed by California law, with venue in San Diego County. If any provision is held invalid, the rest remains in force. This agreement is in addition to — not in place of — the IMS Liability Waiver & Assumption of Risk, which continues to apply.

By signing below I confirm I have read and understood this agreement, that I have received a copy, that I am 18 or older, and that I agree to the use of electronic records and signatures.`,
  },

  {
    type: "package_terms",
    version: "2026-07-package-v1",
    title: "Session Package Terms",
    required: false,
    appliesTo: "package",
    body: `This covers prepaid session packages at Innovative Movement Solutions ("IMS"), 10650 Scripps Ranch Blvd, San Diego, CA 92131 · (619) 937-1434.

━━━━━━━━━━━━━━━━━━━━
YOU MAY CANCEL THIS AGREEMENT AT ANY TIME PRIOR TO MIDNIGHT OF THE THIRD BUSINESS DAY AFTER THE DATE YOU SIGN IT. TO CANCEL, EMAIL jason@imsmethod.com OR DELIVER WRITTEN NOTICE TO THE ADDRESS ABOVE. IF YOU CANCEL WITHIN THAT PERIOD YOU WILL RECEIVE A FULL REFUND OF ALL AMOUNTS PAID.
━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━
1. WHAT YOU'RE BUYING
━━━━━━━━━━━━━━━━━━━━
A package is a set number of prepaid sessions, drawn down one at a time as you train. The per-session rate falls as the package gets larger, and that discount is the consideration for paying in advance.

━━━━━━━━━━━━━━━━━━━━
2. HOW LONG YOU HAVE
━━━━━━━━━━━━━━━━━━━━
Sessions must be used within the window below, from date of purchase:

    6 sessions  ·  6 months
   12 sessions  ·  9 months
   24 sessions  ·  12 months
   48 sessions  ·  18 months

These windows are set at roughly double the time it would take training twice a week, so ordinary life — travel, illness, a busy quarter — doesn't cost you sessions.

━━━━━━━━━━━━━━━━━━━━
3. IF TIME RUNS SHORT
━━━━━━━━━━━━━━━━━━━━
We would rather you used what you paid for. If you're approaching your expiry with sessions left, tell us and we will extend it once, by up to 3 months, at no charge.

Extensions beyond that, and reinstatement of expired sessions, are at our discretion — but ask. We have never wanted this to be a way of keeping money for training we didn't deliver.

━━━━━━━━━━━━━━━━━━━━
4. MEDICAL HOLDS
━━━━━━━━━━━━━━━━━━━━
If injury, illness, pregnancy, or surgery prevents you from training, your package is paused for the duration on presentation of reasonable documentation. Time paused is added to your expiry. There is no limit on medical holds and no charge for them.

━━━━━━━━━━━━━━━━━━━━
5. CANCELLING A SESSION
━━━━━━━━━━━━━━━━━━━━
Give at least 24 hours' notice and the session returns to your package at no cost.

With less than 24 hours' notice, or if you don't attend, the session is drawn from your package. That time was held for you and could not be offered to anyone else.

━━━━━━━━━━━━━━━━━━━━
6. REFUNDS
━━━━━━━━━━━━━━━━━━━━
Unused sessions are refundable at any time at the rate you would have paid for the package size you actually used, less sessions taken. For example: buy a 24-pack at $90 per session, use 6, and the refund is calculated at the 6-pack rate of $100 per session for those 6, with the balance returned.

That reflects the fact that the lower rate was earned by the larger commitment. No cancellation fee applies.

━━━━━━━━━━━━━━━━━━━━
7. SHARING & TRANSFER
━━━━━━━━━━━━━━━━━━━━
Packages are for the named client and cannot be shared or resold. Transfer to an immediate family member is permitted once, with our written agreement.

━━━━━━━━━━━━━━━━━━━━
8. OTHER TERMS
━━━━━━━━━━━━━━━━━━━━
This agreement is governed by California law, with venue in San Diego County. If any provision is held invalid, the rest remains in force. This agreement is in addition to — not in place of — the IMS Liability Waiver & Assumption of Risk, which continues to apply.

By signing below I confirm I have read and understood these terms, that I have received a copy, that I am 18 or older, and that I agree to the use of electronic records and signatures.`,
  },

  {
    type: "facility_use",
    version: "2026-07-facility-v1",
    title: "Facility Use & Participation Waiver",
    required: false,
    appliesTo: "partner",
    body: `This waiver is for participants attending a programme, study, class, or session at the premises of Innovative Movement Solutions ("IMS"), 10650 Scripps Ranch Blvd, San Diego, CA 92131, where that activity is run by a third-party organisation or practitioner rather than by IMS.

━━━━━━━━━━━━━━━━━━━━
1. WHO IS RESPONSIBLE FOR WHAT
━━━━━━━━━━━━━━━━━━━━
I understand that the programme I am attending is designed, delivered, and supervised by the organising party, not by IMS, and that IMS is providing the premises and equipment only.

I understand IMS does not direct, approve, or supervise the content of the programme, and makes no representation about its suitability for me. Any question about the activity itself is for the organising party.

━━━━━━━━━━━━━━━━━━━━
2. ASSUMPTION OF RISK
━━━━━━━━━━━━━━━━━━━━
I understand that physical activity carries inherent risks including physical exertion, muscle strain, falls, cardiovascular events, and other injury, and that these risks exist regardless of care taken.

I affirm that I have disclosed all relevant health conditions to the organising party, that I have any medical clearance I require, and that I assume these risks knowingly and voluntarily.

━━━━━━━━━━━━━━━━━━━━
3. RELEASE
━━━━━━━━━━━━━━━━━━━━
To the fullest extent permitted by California law, I release and hold harmless Innovative Movement Solutions, its owners, employees, agents, and contractors from any claim arising from my presence at or use of the premises and equipment, excluding claims arising from gross negligence, recklessness, or willful misconduct, which cannot be waived.

This release is intended to be as broad as permitted under California law, and I expressly waive California Civil Code section 1542 as to claims I do not know or suspect to exist at the time of signing.

━━━━━━━━━━━━━━━━━━━━
4. FACILITY RULES & EMERGENCY CARE
━━━━━━━━━━━━━━━━━━━━
I agree to follow posted rules and any instruction from IMS staff, to use equipment only as directed, and to report any injury before leaving the premises.

I authorise IMS staff to summon emergency medical assistance if they believe it warranted, and accept financial responsibility for any resulting treatment or transport. I understand IMS staff are not medical professionals.

━━━━━━━━━━━━━━━━━━━━
5. PERSONAL PROPERTY
━━━━━━━━━━━━━━━━━━━━
IMS is not responsible for loss, theft, or damage to personal property brought onto the premises.

━━━━━━━━━━━━━━━━━━━━
6. OTHER TERMS
━━━━━━━━━━━━━━━━━━━━
Governed by California law, venue in San Diego County. If any provision is held invalid, the rest remains in force.

By signing below I confirm I have read and understood this waiver, that I am 18 or older or signing as parent/guardian, and that I agree to the use of electronic records and signatures.`,
  },
];

/** Quick lookup by type. */
export const WAIVER_BY_TYPE = Object.fromEntries(
  WAIVER_DOCS.map((w) => [w.type, w])
) as Record<WaiverDoc["type"], WaiverDoc>;

export type WaiverState = "current" | "missing" | "expired" | "outdated";

export type WaiverStatus = {
  type: WaiverDoc["type"];
  title: string;
  required: boolean;
  state: WaiverState;
  signed_at: string | null;
  signed_version: string | null;
  expires_at: string | null;
};

/**
 * Work out where a client stands on each document.
 *
 * `rows` is every waiver they've signed; only the most recent of each type
 * matters. A signature can fail three ways — never given, too old, or given
 * against superseded wording — and they're worth distinguishing because
 * "you never signed this" and "this needs renewing" are different
 * conversations.
 */
/**
 * Which documents apply to a given client.
 *
 * Massage consent only appears for people actually receiving bodywork, and the
 * minor consent only for under-18s. Presenting everyone with every document is
 * how you train people to scroll past without reading.
 */
export function docsFor(opts: { receivesMassage?: boolean; isMinor?: boolean } = {}) {
  return WAIVER_DOCS.filter((d) => {
    if (d.appliesTo === "massage") return opts.receivesMassage === true;
    if (d.appliesTo === "minor") return opts.isMinor === true;
    // Membership terms, package terms and the facility waiver are sent
    // deliberately at the point of sale or on arrival — they must never appear
    // in the login gate, where they'd block someone over paperwork nobody has
    // asked them to sign yet.
    if (d.appliesTo === "membership" || d.appliesTo === "package" || d.appliesTo === "partner") {
      return false;
    }
    return true;
  });
}

/** Documents that are sent rather than gated — what the "send agreement" picker offers. */
export const SENDABLE_DOCS = WAIVER_DOCS.filter(
  (d) => d.appliesTo !== "minor" || true
);

/** Expiry windows for prepaid packages, in months, keyed by session count. */
export const PACKAGE_EXPIRY_MONTHS: Record<number, number> = {
  6: 6,
  12: 9,
  24: 12,
  48: 18,
};

/** Expiry for a package of any size, interpolating between the published tiers. */
export function packageExpiryMonths(sessions: number): number {
  const tiers = Object.keys(PACKAGE_EXPIRY_MONTHS).map(Number).sort((a, b) => a - b);
  for (const t of tiers) if (sessions <= t) return PACKAGE_EXPIRY_MONTHS[t];
  return PACKAGE_EXPIRY_MONTHS[tiers[tiers.length - 1]];
}

export function assessWaivers(
  rows: { waiver_type: string; waiver_version: string; signed_at: string }[],
  opts: { receivesMassage?: boolean; isMinor?: boolean } = {}
): WaiverStatus[] {
  const latest = new Map<string, { version: string; signed_at: string }>();
  for (const r of rows) {
    const prev = latest.get(r.waiver_type);
    if (!prev || new Date(r.signed_at) > new Date(prev.signed_at)) {
      latest.set(r.waiver_type, { version: r.waiver_version, signed_at: r.signed_at });
    }
  }

  return docsFor(opts).map((doc) => {
    const signed = latest.get(doc.type);
    if (!signed) {
      return {
        type: doc.type, title: doc.title, required: doc.required,
        state: "missing" as const, signed_at: null,
        signed_version: null, expires_at: null,
      };
    }

    const signedAt = new Date(signed.signed_at);
    const expires = new Date(signedAt);
    expires.setMonth(expires.getMonth() + WAIVER_VALIDITY_MONTHS);

    const state: WaiverState =
      signed.version !== doc.version
        ? "outdated"
        : expires < new Date()
          ? "expired"
          : "current";

    return {
      type: doc.type, title: doc.title, required: doc.required,
      state, signed_at: signed.signed_at,
      signed_version: signed.version,
      expires_at: expires.toISOString(),
    };
  });
}

/** Required documents that aren't currently valid. Empty means they're clear. */
export function outstandingRequired(statuses: WaiverStatus[]): WaiverStatus[] {
  return statuses.filter(
    (s) =>
      // Minor consent isn't flagged required globally — it doesn't apply to most
      // people — but where it does apply, it's mandatory.
      (s.required || s.type === "minor_consent") && s.state !== "current"
  );
}
