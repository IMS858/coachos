import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actionableMessages, type StaffUnreadMessage } from "../lib/messages/actionable";
const client = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const trainer = "33333333-3333-4333-8333-333333333333";
const message = (overrides: Partial<StaffUnreadMessage> = {}): StaffUnreadMessage => ({ id:"m",client_id:client,sender_id:client,body:"Synthetic message",created_at:"2026-09-24T12:00:00Z",read_at:null,...overrides });
test("incoming means client sender, never another staff member's outgoing reply", () => {
  const rows = [message(),message({ id:"owner",sender_id:owner }),message({ id:"trainer",sender_id:trainer })];
  assert.deepEqual(actionableMessages(rows,[]).map(row => row.id),["m"]);
});
test("archived old messages and read messages do not become action items", () => {
  const rows = [message(),message({ id:"read",read_at:"2026-09-24T12:01:00Z" })];
  assert.deepEqual(actionableMessages(rows,[{client_id:client,archived_at:"2026-09-24T13:00:00Z"}]),[]);
});
test("new incoming unread messages after clearing a thread resurface", () => {
  const rows = [message(),message({id:"new",created_at:"2026-09-24T14:00:00Z"})];
  assert.deepEqual(actionableMessages(rows,[{client_id:client,archived_at:"2026-09-24T13:00:00Z"}]).map(row => row.id),["new"]);
});
test("new business pages and operational counters share the same source-aware workspace", () => {
  for (const file of ["components/dashboard/owner-dashboard.tsx","app/action-center/page.tsx","app/messages/page.tsx","app/reports/leads/page.tsx"]) {
    assert.match(readFileSync(file,"utf8"),/loadLeadWorkspace\(/,file);
  }
});
test("private exercise selections stay out of pending program-completion queues", () => {
  assert.match(readFileSync("app/action-center/page.tsx","utf8"),/data->>source\.neq\.ims_exercise_set/);
  assert.match(readFileSync("components/clients/client-program-link.tsx","utf8"),/data->>source\.neq\.ims_exercise_set/);
});
