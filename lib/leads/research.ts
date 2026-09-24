import { z } from "zod";
const publicUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")
    && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
    && !/\.(local|internal|invalid)$/i.test(url.hostname);
}, "Use an official public HTTPS source URL.");
export const researchCandidateSchema = z.object({
  organization: z.string().trim().min(2).max(160),
  website_url: publicUrl,
  evidence_url: publicUrl,
  fit_reason: z.string().trim().min(20).max(1500),
  next_step: z.string().trim().min(10).max(1000),
  checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use a real date checked."),
}).strict();
export const researchImportSchema = z.object({
  request_id: z.string().uuid(),
  candidates: z.array(researchCandidateSchema).min(1).max(20).refine(rows => new Set(rows.map(row => new URL(row.website_url).hostname.toLowerCase().replace(/^www\./, ""))).size === rows.length, "Combine duplicate organizations before importing."),
}).strict();
