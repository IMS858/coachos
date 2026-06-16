/**
 * Outreach template library — copy-paste follow-up messages by scenario.
 * Email + text versions. {{first}} is replaced with the lead's first name.
 */

export interface Template {
  id: string;
  label: string;
  channel: "email" | "text";
  subject?: string;
  body: string;
}

export const OUTREACH_TEMPLATES: Template[] = [
  // ---- First touch ----
  {
    id: "first_text",
    label: "First follow-up (text)",
    channel: "text",
    body: `Hi {{first}}, it's Jason at IMS in Scripps Ranch. You showed interest in training with us — I'd love to get you in for a free Movement Assessment. No pressure, just 30 min to see how you move and map out a plan. Want me to grab you a time this week?`,
  },
  {
    id: "first_email",
    label: "First follow-up (email)",
    channel: "email",
    subject: "Your free Movement Assessment at IMS",
    body: `Hi {{first}},

It's Jason at Innovative Movement Solutions in Scripps Ranch. You'd shown interest in training with us, and I wanted to personally reach out.

I'd like to offer you a free 30-minute Movement Assessment — we look at how your joints move, talk through your goals, and give you a clear picture of what your body needs. No pressure to sign up.

Just reply here or text me at (619) 937-1434 and I'll find you a time.

Jason Patterson
IMS — Innovative Movement Solutions`,
  },
  // ---- Membership lead ----
  {
    id: "membership_text",
    label: "Membership interest (text)",
    channel: "text",
    body: `Hey {{first}}, Jason at IMS here. You'd looked into a membership with us — we've got 2x, 3x, and 4x/week options built around your goals. Want me to walk you through what fits best? Happy to start with a free assessment so we dial it in.`,
  },
  // ---- Massage lead ----
  {
    id: "massage_text",
    label: "Massage interest (text)",
    channel: "text",
    body: `Hi {{first}}, it's IMS in Scripps Ranch. You'd been interested in massage/bodywork — our recovery room (NormaTec, infrared, licensed massage) is open to members and non-members. Want me to get you booked?`,
  },
  // ---- Pilates lead ----
  {
    id: "pilates_text",
    label: "Pilates interest (text)",
    channel: "text",
    body: `Hey {{first}}, Jason at IMS. You'd shown interest in Pilates — ours is private, 1-on-1 on the Reformer, no group classes. Great for core, control, and mobility. Want to come try a session?`,
  },
  // ---- Win-back (lapsed) ----
  {
    id: "winback_text",
    label: "Win-back / lapsed (text)",
    channel: "text",
    body: `Hi {{first}}, it's Jason at IMS. It's been a while! We've added a lot — new recovery room, Pilates, and more coaching availability. I'd love to get you back in. Want a free re-assessment to see where you're at now?`,
  },
  {
    id: "winback_email",
    label: "Win-back / lapsed (email)",
    channel: "email",
    subject: "We'd love to get you back in, {{first}}",
    body: `Hi {{first}},

It's Jason at IMS. It's been a while since we saw you, and I wanted to reach out personally.

We've grown a lot — a dedicated recovery room with NormaTec and infrared, private Pilates, and more coaching availability. If you've been thinking about getting back to training, I'd love to make it easy.

Come in for a free re-assessment — we'll see where your body is now and build a plan from there. Just reply or text (619) 937-1434.

Jason Patterson
IMS — Innovative Movement Solutions`,
  },
  // ---- No-show ----
  {
    id: "noshow_text",
    label: "Missed appointment (text)",
    channel: "text",
    body: `Hey {{first}}, we missed you for your assessment! No worries, life happens. Want me to reschedule you? Just let me know what day works and I'll get you in.`,
  },
  // ---- Networking / general ----
  {
    id: "networking_text",
    label: "Networking contact (text)",
    channel: "text",
    body: `Hi {{first}}, Jason from IMS in Scripps Ranch. Great connecting! If you or anyone you know is looking for serious movement coaching, strength, or recovery, I'd love to help. First assessment's on me.`,
  },
];

export function fillTemplate(body: string, firstName?: string | null): string {
  return body.replace(/\{\{first\}\}/g, firstName?.split(" ")[0] || "there");
}
