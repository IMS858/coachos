import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("owner growth and research navigation does not leak spend controls to trainers",()=>{
  const sidebar=readFileSync("components/layout/app-sidebar.tsx","utf8"), mobile=readFileSync("components/layout/staff-bottom-nav.tsx","utf8");
  assert.match(sidebar.split("trainer: [")[0],/Growth Center/);assert.match(sidebar.split("trainer: [")[0],/Research Desk/);
  assert.doesNotMatch(sidebar.split("trainer: [")[1].split("client: [")[0],/Growth Center|Financials|Payroll/);
  assert.doesNotMatch(mobile.split("const trainerMore = [")[1].split("];",1)[0],/Growth Center|Financials|Payroll/);
  const page=readFileSync("app/growth/page.tsx","utf8"), route=readFileSync("app/api/growth/route.ts","utf8"), ui=readFileSync("components/growth/growth-center.tsx","utf8");
  assert.match(page,/profile\.data\?\.role!=="owner"/);assert.match(route,/execute_growth_command/);assert.match(route,/32768/);
  assert.doesNotMatch(route,/createServiceClient|sendEmail|stripe\.|submitPayroll|approvePayroll/);
  assert.match(ui,/not a lead/);assert.match(ui,/successful payments/);assert.match(ui,/not connected/);
});
test("exercise picker captures dosage in the actual save request",()=>{
  const source=readFileSync("components/library/exercise-catalog-browser.tsx","utf8"),loader=readFileSync("components/library/coach-exercise-catalog.tsx","utf8");
  assert.match(source,/ExercisePrescriptionFields/);assert.match(source,/prescriptions/);assert.match(loader,/savedPrescriptions/);
  assert.match(source,/private coaching draft/);
});
test("release development no longer causes automatic Vercel preview deployments",()=>{
  const config=JSON.parse(readFileSync("vercel.json","utf8"));
  assert.equal(config.git.deploymentEnabled["release/ims-unified-2026-09"],false);
  assert.equal(config.framework,"nextjs");assert.equal(config.crons.length,3);
});
