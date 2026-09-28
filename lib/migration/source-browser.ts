/** Owner-only source presentation. No inference of live balances or completed work. */
export const SOURCE_TYPES = ["client", "appointment", "series", "package", "membership", "transaction"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type SourceBrowserRow = {
  id: string; record_type: string; source_id: string; source_payload: unknown;
  reconciliation_status: string; destination_id: string | null;
  destination_trainer_id?: string | null; review_note?: string | null; dry_run_reason?: string | null;
};
export function sourceFields(row: SourceBrowserRow): Record<string, unknown> {
  const payload = row.source_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const fields = (payload as Record<string, unknown>).fields;
  return fields && typeof fields === "object" && !Array.isArray(fields) ? fields as Record<string, unknown> : {};
}
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export function sourceLabel(row: SourceBrowserRow): string {
  const fields = sourceFields(row);
  for (const key of ["Source Name", "Client Name", "Client", "Owner", "Appointment / Customer"]) {
    if (nonempty(fields[key])) return fields[key];
  }
  return row.source_id;
}
export function filterSourceRows(rows: readonly SourceBrowserRow[], query: string): SourceBrowserRow[] {
  if (typeof query !== "string" || query.length > 200) throw new Error("Invalid source search.");
  const term = query.trim().toLocaleLowerCase("en-US");
  if (!term) return [...rows];
  return rows.filter(row => [row.source_id, ...Object.values(sourceFields(row))]
    .filter(value => typeof value === "string" || typeof value === "number")
    .some(value => String(value).toLocaleLowerCase("en-US").includes(term)));
}
/** These are read-time observations, not saved reviews or new import approvals. */
export function sourceObservation(row: SourceBrowserRow, today: string): string | null {
  if (row.reconciliation_status === "imported") return null;
  if (nonempty(row.dry_run_reason)) return row.dry_run_reason;
  if (nonempty(row.review_note)) return row.review_note;
  const fields = sourceFields(row);
  switch (row.record_type) {
    case "client": return row.destination_id ? "Destination identity linked. This is not a new account invitation." : "No Coach OS client identity linked. Source verification and account provisioning are separate; no invitation has been inferred.";
    case "appointment": {
      const date = fields["Raw date"];
      if (!row.destination_id) return "No Coach OS client identity linked. Resolve the destination identity before operational import; the export does not need to be verified again.";
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today) return "Historical appointment evidence. The future-calendar importer does not establish delivery history; scheduled is not completed.";
      return "Destination linked; current time, duration, status and collision checks still govern import.";
    }
    case "series": return "Captured occurrence pattern. A stored pattern is not a verified repeat rule or exception list; no extra appointments are generated here.";
    case "package": return nonempty(fields["Owner provenance / limitation"]) ? `Source limitation: ${fields["Owner provenance / limitation"]} Opening balances have not been inferred from displayed value.` : "Source package evidence. Ownership, opening balance and purchase linkage remain separate from the source display.";
    case "membership": return "Source membership contract, not a newly activated Coach OS subscription. Existing contract differences must be reconciled without duplicate billing.";
    case "transaction": return "Source transaction line, not a new Coach OS payment, customer debt or reconciled accounting entry.";
    default: return "Source evidence only; no operational state inferred.";
  }
}
