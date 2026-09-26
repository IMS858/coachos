import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";

test("trainer onboarding is owner-only and cannot create an owner",()=>{const api=readFileSync("app/api/admin/staff/route.ts","utf8");assert.match(api,/Owner only/);assert.match(api,/role:"trainer"/);assert.match(api,/staff\.invited/);assert.doesNotMatch(api,/role:"owner"/);});

test("trainer invite remains an explicit owner action",()=>{const ui=readFileSync("components/settings/invite-trainer-panel.tsx","utf8");assert.match(ui,/Create trainer & send invite/);assert.match(ui,/Owner access cannot be granted/);assert.match(ui,/Copy fallback invite link/);});

test("staff control center includes the onboarding panel",()=>{const page=readFileSync("app/(owner)/settings/staff/page.tsx","utf8");assert.match(page,/InviteTrainerPanel/);});
