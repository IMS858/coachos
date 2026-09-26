const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const source=fs.readFileSync("app/clients/[id]/page.tsx","utf8");
test("client profile booking and calendar keep coach/date context",()=>{
  assert.ok(source.includes('trainer_id=${user.id}&date=${todayPt}'));
  assert.ok(source.includes('href={"/schedule?date="+todayPt+"&trainer="+user.id}'));
});
