import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";

test("operational readiness is evidence based and not a valuation score",()=>{const page=readFileSync("app/(owner)/settings/readiness/page.tsx","utf8");assert.match(page,/Operational Readiness/);assert.match(page,/not a business valuation or certification/);assert.match(page,/Staff coverage/);assert.match(page,/Program evidence/);assert.match(page,/Assessment evidence/);assert.match(page,/Payroll configuration/);assert.match(page,/Operational history/);assert.match(page,/Forward schedule/);assert.doesNotMatch(page,/valuation score|enterprise value|multiple/);});

test("readiness links back to the action center for live exceptions",()=>{const page=readFileSync("app/(owner)/settings/readiness/page.tsx","utf8");assert.match(page,/booking requests/);assert.match(page,/payment exceptions/);assert.match(page,/draft programs/);assert.match(page,/href="\/action-center"/);});
