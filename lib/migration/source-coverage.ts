export const CORE_MIGRATION_KINDS = ["client","appointment","package"] as const;
export type CoreMigrationKind = typeof CORE_MIGRATION_KINDS[number];

export type SourceCoverageRow = { record_type: string };

export function migrationSourceCoverage(
  rows: SourceCoverageRow[],
  sourceExportDeclaredComplete = false,
  requiredKinds: readonly string[] = CORE_MIGRATION_KINDS,
) {
  const counts = new Map<string,number>();
  for (const row of rows) counts.set(row.record_type,(counts.get(row.record_type)??0)+1);
  const missing = requiredKinds.filter(kind => (counts.get(kind)??0) === 0);
  return {
    total: rows.length,
    counts,
    missing,
    sourceExportDeclaredComplete,
    reconciliationMayProceed: sourceExportDeclaredComplete && missing.length === 0,
  };
}
