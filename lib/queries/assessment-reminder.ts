/**
 * Re-assessment reminders.
 *
 * IMS re-assesses at 4, 8, and 12 weeks (then every 12 thereafter) to track
 * progress. Given the last assessment date, work out the next milestone and
 * whether the client is due / overdue.
 */

const MILESTONES_WEEKS = [4, 8, 12];
const RECURRING_AFTER = 12; // every 12 weeks past the last milestone

export interface AssessmentReminder {
  dueDate: string; // YYYY-MM-DD
  weeksSinceLast: number;
  milestoneWeek: number; // which checkpoint this is (4/8/12/24…)
  status: "upcoming" | "due_soon" | "due" | "overdue";
  daysUntil: number;
  label: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function nextAssessmentReminder(
  lastAssessmentDate: string | null,
  today = new Date()
): AssessmentReminder | null {
  if (!lastAssessmentDate) return null;

  const last = new Date(`${lastAssessmentDate}T12:00:00Z`);
  const now = new Date(`${ymd(today)}T12:00:00Z`);
  const daysSince = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weeksSince = Math.floor(daysSince / 7);

  // Find the next milestone week not yet reached
  let milestoneWeek = MILESTONES_WEEKS.find((w) => w > weeksSince);
  if (milestoneWeek === undefined) {
    // past 12 weeks → next 12-week recurring checkpoint
    const past = weeksSince - RECURRING_AFTER;
    const cycles = Math.floor(past / RECURRING_AFTER) + 1;
    milestoneWeek = RECURRING_AFTER + cycles * RECURRING_AFTER;
    // ensure strictly greater than weeksSince
    while (milestoneWeek <= weeksSince) milestoneWeek += RECURRING_AFTER;
  }

  const due = new Date(last.getTime());
  due.setUTCDate(due.getUTCDate() + milestoneWeek * 7);
  const daysUntil = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  let status: AssessmentReminder["status"];
  if (daysUntil > 14) status = "upcoming";
  else if (daysUntil > 3) status = "due_soon";
  else if (daysUntil >= -3) status = "due";
  else status = "overdue";

  const label =
    daysUntil > 0
      ? `Your ${milestoneWeek}-week check-in is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
      : daysUntil === 0
        ? `Your ${milestoneWeek}-week check-in is today`
        : `Your ${milestoneWeek}-week check-in is ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} overdue`;

  return {
    dueDate: ymd(due),
    weeksSinceLast: weeksSince,
    milestoneWeek,
    status,
    daysUntil,
    label,
  };
}
