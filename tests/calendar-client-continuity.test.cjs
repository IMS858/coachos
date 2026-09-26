const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const dashboard=fs.readFileSync("components/dashboard/trainer-dashboard.tsx","utf8");
const schedule=fs.readFileSync("app/schedule/page.tsx","utf8");
const session=fs.readFileSync("app/sessions/[id]/page.tsx","utf8");
const client=fs.readFileSync("app/clients/[id]/page.tsx","utf8");

test("today opens the coach calendar without losing trainer context",()=>{
  assert.match(dashboard,/schedule\?date=/);
  assert.match(dashboard,/trainer=/);
});

test("calendar session blocks open the coaching session and include package evidence",()=>{
  assert.match(schedule,/href=\{\x60\/sessions\/\$\{s\.id\}\x60\}/);
  assert.match(schedule,/activeTrainingPackageBalance/);
  assert.match(schedule,/packageBalanceLabel/);
});

test("session page connects back to today calendar and client profile",()=>{
  assert.match(session,/Session context/);
  assert.match(session,/Client profile/);
  assert.match(session,/Training package/);
});

test("client profile exposes package runway and coach calendar",()=>{
  assert.match(client,/packageBalanceLabel/);
  assert.match(client,/Coach calendar/);
});
