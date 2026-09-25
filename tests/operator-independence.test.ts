import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";

test("staff control center exposes operational load without one-click role mutation",()=>{const page=readFileSync("app/(owner)/settings/staff/page.tsx","utf8");assert.match(page,/Staff & Roles/);assert.match(page,/payroll mapping/i);assert.match(page,/active clients/);assert.match(page,/delivered 30d/);assert.doesNotMatch(page,/fetch\(|update\(|delete\(|role.*select/);});

test("operational history is owner-only and reads audit records",()=>{const page=readFileSync("app/(owner)/settings/audit/page.tsx","utf8");assert.match(page,/Operational History/);assert.match(page,/audit_logs/);assert.match(page,/owner/);});

test("outcomes report describes evidence coverage rather than inventing improvement",()=>{const page=readFileSync("app/reports/outcomes/page.tsx","utf8");assert.match(page,/Client Outcomes & Evidence/);assert.match(page,/data coverage—not claims of improvement/);assert.match(page,/v_progression_signals/);assert.match(page,/body_comp_records/);assert.match(page,/reassessment/i);});

test("owner settings links staff, history and reports",()=>{const page=readFileSync("app/(owner)/settings/page.tsx","utf8");assert.match(page,/\/settings\/staff/);assert.match(page,/\/settings\/audit/);assert.match(page,/\/reports/);});
