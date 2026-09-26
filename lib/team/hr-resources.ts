export const TEAM_RESOURCES = [
  {
    key:"standards",
    title:"IMS Coaching Standards",
    summary:"How IMS sessions should feel: prepared, individualized, evidence-led and professionally documented.",
    points:[
      "Review the client profile, current program and relevant notes before training.",
      "Coach within the approved IMS exercise and safety framework; do not improvise around unresolved contraindications.",
      "Complete the session record promptly so package usage, payroll evidence and client history stay accurate.",
      "Use objective findings and coaching observations; avoid unsupported medical diagnoses or outcome claims.",
    ],
  },
  {
    key:"client-care",
    title:"Client Care & Privacy",
    summary:"Professional expectations for client information, communication and boundaries.",
    points:[
      "Access client information only for legitimate IMS coaching work.",
      "Keep health, assessment, payment and personal information inside approved IMS systems.",
      "Use Coach OS Communications for client coaching conversations when practical.",
      "Escalate safety, privacy, billing or conduct concerns to the owner instead of resolving sensitive issues informally.",
    ],
  },
  {
    key:"schedule",
    title:"Schedule & Session Records",
    summary:"What keeps the calendar, packages and payroll evidence trustworthy.",
    points:[
      "Confirm you are viewing the correct trainer schedule before making or reviewing bookings.",
      "Record completed sessions, cancellations and no-shows using the actual Coach OS status workflow.",
      "Do not manually manipulate package balances to compensate for a scheduling mistake; flag the issue for review.",
      "Standing bookings and exceptions should remain visible in the system rather than living only in texts or memory.",
    ],
  },
  {
    key:"programming",
    title:"Programming & Exercise Library",
    summary:"How to use Quick Programming, assessment-led programming and the IMS exercise library.",
    points:[
      "Quick Programming is appropriate when an assessment is not required for the coaching context.",
      "Assessment-led programming should stay anchored to the current assessment evidence.",
      "Only publish client-facing programming when prescriptions, exercise identity and safety checks are complete.",
      "Capture new exercise videos and coaching cues in the Exercise Library so knowledge becomes reusable across the team.",
    ],
  },
  {
    key:"facility",
    title:"Facility & Safety",
    summary:"Baseline expectations for a safe, professional training environment.",
    points:[
      "Keep walkways, training stations and equipment clear and ready for the next client.",
      "Report damaged equipment, facility hazards or client incidents immediately.",
      "Know the location of the AED, emergency exits and first-aid resources before coaching independently.",
      "Never bypass a safety restriction because a session is running late or a client requests it.",
    ],
  },
  {
    key:"payroll",
    title:"Payroll & Time Evidence",
    summary:"How Coach OS supports payroll without replacing payroll review.",
    points:[
      "Completed-session records are the primary coaching evidence used for payroll preparation.",
      "Late-cancel and no-show compensation applies only when an explicit compensation rule exists.",
      "Coach OS calculations are proposed evidence until owner review and payroll-provider processing are complete.",
      "Report a session-record discrepancy before payroll review rather than creating a duplicate session.",
    ],
  },
] as const;

export const TEAM_HANDBOOK_VERSION = "2026.09";
export const TEAM_HANDBOOK_UPDATED = "September 2026";
