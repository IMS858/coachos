export type CoachingPriority = "attention" | "next" | "steady";

export type CoachBriefInput = {
  now: string;
  packageRemaining: number | null;
  nextSessionAt: string | null;
  lastCompletedAt: string | null;
  latestAssessmentAt: string | null;
  assessmentStatus: string | null;
  draftPrograms: number;
  activePrograms: number;
  savedExerciseSets: number;
};

export type CoachAction = {
  key: string;
  priority: CoachingPriority;
  label: string;
  reason: string;
  href: string;
};

const DAY = 86_400_000;
const daysSince = (now: string, value: string | null) => value ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(value)) / DAY)) : null;

export function coachingMode(input: CoachBriefInput): "Programming only" | "In-person" | "Hybrid" | "Getting started" {
  const hasProgramming = input.activePrograms > 0 || input.draftPrograms > 0 || input.savedExerciseSets > 0;
  const hasSessions = input.lastCompletedAt !== null || input.nextSessionAt !== null;
  if (hasProgramming && hasSessions) return "Hybrid";
  if (hasSessions) return "In-person";
  if (hasProgramming) return "Programming only";
  return "Getting started";
}

export function buildCoachActions(clientId: string, input: CoachBriefInput): CoachAction[] {
  const actions: CoachAction[] = [];
  const quietDays = daysSince(input.now, input.lastCompletedAt);
  const assessmentDays = daysSince(input.now, input.latestAssessmentAt);

  if (input.packageRemaining !== null && input.packageRemaining <= 2) {
    actions.push({ key:"package", priority:"attention", label:"Review package runway", reason: input.packageRemaining === 0 ? "Active package has no sessions remaining." : `${input.packageRemaining} session${input.packageRemaining === 1 ? "" : "s"} remaining.`, href:`/clients/${clientId}#client-plans` });
  }
  if (!input.nextSessionAt && input.lastCompletedAt) {
    actions.push({ key:"schedule", priority:"attention", label:"Schedule the next session", reason:"No upcoming training session is currently on the books.", href:`/sessions/new?client_id=${clientId}` });
  }
  if (quietDays !== null && quietDays >= 14) {
    actions.push({ key:"quiet", priority:"attention", label:"Reconnect with client", reason:`${quietDays} days since the last completed session.`, href:`/messages/${clientId}` });
  }
  if (input.assessmentStatus && input.assessmentStatus !== "complete") {
    actions.push({ key:"assessment", priority:"next", label:"Finish current assessment", reason:"Assessment evidence is in progress and not yet complete.", href:`/assessments/new?client_id=${clientId}` });
  } else if (assessmentDays !== null && assessmentDays >= 84) {
    actions.push({ key:"reassess", priority:"next", label:"Consider a reassessment", reason:`${assessmentDays} days since the latest completed assessment.`, href:`/assessments/new?client_id=${clientId}` });
  }
  if (input.draftPrograms > 0) {
    actions.push({ key:"draft", priority:"next", label:"Finish programming", reason:`${input.draftPrograms} private program draft${input.draftPrograms === 1 ? "" : "s"} still need coach review.`, href:"/programs" });
  } else if (input.activePrograms === 0 && input.savedExerciseSets > 0) {
    actions.push({ key:"convert", priority:"next", label:"Turn the exercise set into a program", reason:"Exercises are saved privately, but no active client program exists yet.", href:`/clients/${clientId}#exercise-sets` });
  } else if (input.activePrograms === 0 && input.lastCompletedAt) {
    actions.push({ key:"program", priority:"next", label:"Build the next training plan", reason:"Training history exists without a current published or active program.", href:`/library?client_id=${clientId}` });
  }
  if (actions.length === 0) {
    actions.push({ key:"steady", priority:"steady", label:"Review today’s coaching plan", reason:"No package, schedule, assessment, or draft-program exception is currently flagged.", href:`/clients/${clientId}#exercise-sets` });
  }
  return actions.slice(0,4);
}

export function sessionPrepSummary(input: Pick<CoachBriefInput,"packageRemaining"|"latestAssessmentAt"|"activePrograms"> & { now:string }): string[] {
  const notes: string[] = [];
  if (input.packageRemaining !== null) notes.push(input.packageRemaining === 0 ? "package depleted" : `${input.packageRemaining} package session${input.packageRemaining === 1 ? "" : "s"} left`);
  if (input.activePrograms > 0) notes.push(`${input.activePrograms} active program${input.activePrograms === 1 ? "" : "s"}`);
  const age = daysSince(input.now,input.latestAssessmentAt);
  if (age !== null) notes.push(age === 0 ? "assessment today" : `assessment ${age}d ago`);
  return notes;
}
