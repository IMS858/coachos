export type CountedPage<T> = { data: T[] | null; count: number | null; error: unknown };
/** Refuse capped, changed, duplicate or failed pages instead of presenting a partial total. */
export async function readCompleteEvidence<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<CountedPage<T>>,
  pageSize = 250,
  maxRows = 10000,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || !Number.isSafeInteger(maxRows) || maxRows < 1) throw new Error("Invalid evidence paging limits.");
  const rows: T[] = [], identities = new Set<string>();
  let expected: number | null = null;
  for (;;) {
    const result = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (result.error || result.data === null || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error("Evidence could not be loaded completely. Refresh before using totals.");
    if (result.count > maxRows) throw new Error("Evidence exceeds this report's safe loading limit. Narrow the report before using totals.");
    if (expected !== null && result.count !== expected) throw new Error("Evidence changed during loading. Refresh before using totals.");
    expected = result.count;
    if (result.data.length !== Math.min(pageSize, expected - rows.length)) throw new Error("Evidence page was incomplete. No partial total was calculated.");
    for (const row of result.data) {
      if (!row.id || identities.has(row.id)) throw new Error("Evidence paging returned a duplicate or missing identity. Refresh before using totals.");
      identities.add(row.id); rows.push(row);
    }
    if (rows.length === expected) return rows;
  }
}
