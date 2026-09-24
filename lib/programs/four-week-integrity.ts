/** Structural check only. Clinical clearance and PDF fidelity are separate gates. */
export function fourWeekStructureIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Missing structured program"];
  const program = value as {weeks?: unknown};
  if (!Array.isArray(program.weeks) || program.weeks.length !== 4) return ["Expected exactly four program weeks"];
  const issues: string[] = [];
  program.weeks.forEach((w, wi) => {
    const week = w as {week_number?: unknown; sessions?: unknown} | null;
    if (!week || week.week_number !== wi + 1) issues.push(`Week ${wi+1} is missing or out of order`);
    if (!Array.isArray(week?.sessions) || week.sessions.length === 0) {
      issues.push(`Week ${wi+1} has no sessions`); return;
    }
    week.sessions.forEach((s, si) => {
      const session = s as {blocks?: unknown} | null;
      if (!Array.isArray(session?.blocks) || session.blocks.length === 0) {
        issues.push(`Week ${wi+1}, session ${si+1} has no blocks`); return;
      }
      session.blocks.forEach((b, bi) => {
        const block = b as {exercises?: unknown} | null;
        if (!Array.isArray(block?.exercises) || block.exercises.length === 0 ||
          block.exercises.some((e: unknown) => !e || typeof e !== "object" ||
            typeof (e as {name?:unknown}).name !== "string" ||
            !(e as {name:string}).name.trim())) {
          issues.push(`Week ${wi+1}, session ${si+1}, block ${bi+1} has missing exercise data`);
        }
      });
    });
  });
  return issues;
}
