const PRIVATE_ASSESSMENT_KEYS = new Set([
  "device_measurements",
  "voltra_sessions",
]);

/**
 * assessments.data is client-readable in parts of Coach OS. Device evidence is
 * staff-only and belongs in assessment_device_evidence, never in this JSONB.
 * Return a fresh object so callers cannot accidentally persist private keys.
 */
export function sanitizePublicAssessmentData(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !PRIVATE_ASSESSMENT_KEYS.has(key)
    )
  );
}
