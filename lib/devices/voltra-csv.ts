/** Beyond+ rep CSV: preserve source units and reject malformed vendor exports. */
export const VOLTRA_COLUMNS = [
  "Set Index", "Reps Index", "Base Weight (LBS)", "Eccentric Weight (LBS)",
  "Chains Weight (LBS)", "Range of Motion (M)", "Duration (S)",
  "Mean Velocity (M/S)", "Peak Velocity (M/S)", "Mean Power (W)",
  "Peak Power (W)", "Con. Force (LBS)", "Con. Velocity (M/S)",
  "Con. Power (W)", "Ecc. Force (LBS)", "Ecc Velocity (M/S)", "Ecc Power (W)",
] as const;
type Row = Record<string, string>;
function splitCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === '"') throw new Error("Unexpected CSV quote");
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some(x => x.trim())) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(field); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
function numeric(value: string, label: string, signed = false): number {
  if (!value.trim()) throw new Error("Missing " + label);
  const n = Number(value);
  if (!Number.isFinite(n) || (!signed && n < 0)) throw new Error("Invalid " + label);
  return n;
}
export function summarizeVoltraCSV(csv: string) {
  if (!csv || new TextEncoder().encode(csv).length > 8_000_000) throw new Error("CSV must be 8 MB or smaller");
  const rows = splitCSV(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2 || rows[0].length !== VOLTRA_COLUMNS.length ||
      rows[0].some((x, i) => x !== VOLTRA_COLUMNS[i])) throw new Error("Unexpected VOLTRA CSV header");
  if (rows.length > 10001) throw new Error("Too many repetitions");
  const groups = new Map<number, Array<{ rep: number; row: Row }>>();
  const seen = new Set<string>();
  for (const fields of rows.slice(1)) {
    if (fields.length !== VOLTRA_COLUMNS.length) throw new Error("Malformed VOLTRA CSV row");
    const row = Object.fromEntries(VOLTRA_COLUMNS.map((c, i) => [c, fields[i]]));
    const set = numeric(row["Set Index"], "set"), rep = numeric(row["Reps Index"], "rep");
    if (!Number.isSafeInteger(set) || set < 1 || !Number.isSafeInteger(rep) || rep < 1) throw new Error("Invalid set or rep index");
    const key = set + ":" + rep;
    if (seen.has(key)) throw new Error("Duplicate repetition");
    seen.add(key);
    for (const column of VOLTRA_COLUMNS.slice(2, 11)) numeric(row[column], column);
    for (const column of VOLTRA_COLUMNS.slice(11)) {
      const trace = row[column].trim();
      if (!trace) continue;
      const samples = trace.split(";");
      if (samples.length > 10000) throw new Error("Trace too long");
      samples.forEach(s => numeric(s, column, true));
    }
    groups.set(set, [...(groups.get(set) ?? []), { rep, row }]);
  }
  if (!seen.size) throw new Error("No repetitions");
  const sets = [...groups.entries()].sort(([a], [b]) => a - b).map(([set_index, reps]) => {
    const vals = (column: string) => reps.map(x => numeric(x.row[column], column));
    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const loads = vals("Base Weight (LBS)");
    return { set_index, repetitions: reps.length, base_load_lb_min: Math.min(...loads),
      base_load_lb_max: Math.max(...loads),
      mean_velocity_m_s: Number(avg(vals("Mean Velocity (M/S)")).toFixed(3)),
      peak_velocity_m_s: Math.max(...vals("Peak Velocity (M/S)")),
      mean_power_w: Number(avg(vals("Mean Power (W)")).toFixed(1)),
      peak_power_w: Math.max(...vals("Peak Power (W)")),
      mean_rom_m: Number(avg(vals("Range of Motion (M)")).toFixed(3)),
      total_duration_s: Number(vals("Duration (S)").reduce((a, b) => a + b, 0).toFixed(2)) };
  });
  return { source: "voltra_beyond_plus_csv", sets, total_repetitions: seen.size,
    units: { load: "lb", force: "lb", rom: "m", duration: "s", velocity: "m/s", power: "W" },
    review_status: "requires_coach_review" };
}
