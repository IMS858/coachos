import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("client session navigation dispatches before loading staff-only session context",()=>{
 const page=readFileSync("app/sessions/[id]/page.tsx","utf8"),summary=readFileSync("components/sessions/client-session-summary.tsx","utf8");
 assert.ok(page.indexOf('if(me.data.role==="client")')<page.indexOf('notes_pre'));
 assert.match(summary,/\.eq\("client_id",clientId\)/);assert.match(summary,/Awaiting coach confirmation/);
 assert.doesNotMatch(summary,/notes_pre|notes_post|SessionDetail|SessionTrainingExecution|\.update\(|\.insert\(/);
});
test("client plan keeps tools available without an assessment and makes backend failures visible",()=>{
 const plan=readFileSync("app/plan/page.tsx","utf8");
 assert.match(plan,/programQ.error/);assert.match(plan,/upcomingQ.error/);assert.match(plan,/videoUnavailable/);
 assert.match(plan,/\.neq\("uploaded_by",user.id\)/);assert.match(plan,/<SendToCoach\/><ClientCoachingThread/);
 assert.match(plan,/an assessment is not required/);assert.doesNotMatch(plan,/ComingSoon/);
});
test("signed playback does not claim watch completion or silently archive",()=>{
 const api=readFileSync("app/api/media/[id]/route.ts","utf8");
 assert.match(api,/mayAccessMedia/);assert.match(api,/client_visible/);assert.match(api,/safety_status/);assert.match(api,/archive_client_media/);
 assert.doesNotMatch(api,/viewed_at:|\.update\(/);assert.match(api,/confirmedMediaAction/);
});
