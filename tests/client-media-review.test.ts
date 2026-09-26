import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {confirmedMediaAction,mayAccessMedia,parseFeedback} from "../lib/media/feedback";
const id="11111111-1111-4111-8111-111111111111";
test("feedback input validates types limits and forbidden fields",()=>{
 assert.equal(parseFeedback({feedback:"  Keep the movement controlled.  "}),"Keep the movement controlled.");
 for(const value of [null,[],{},"text",{feedback:" "},{feedback:"x".repeat(2001)},{feedback:"Good",client_id:id}])assert.throws(()=>parseFeedback(value));
});
test("media authorization denies unrelated trainers clients deleted and unknown roles",()=>{
 const viewer=(role:string,viewerId="coach",deleted_at:string|null=null)=>({id:viewerId,role,deleted_at});
 assert.equal(mayAccessMedia(viewer("owner"),"client","other"),true);
 assert.equal(mayAccessMedia(viewer("trainer"),"client","coach"),true);
 assert.equal(mayAccessMedia(viewer("trainer"),"client","other"),false);
 assert.equal(mayAccessMedia(viewer("client","client"),"client","coach"),true);
 assert.equal(mayAccessMedia(viewer("client","elsewhere"),"client","coach"),false);
 assert.equal(mayAccessMedia(viewer("owner","owner","2026-09-25"),"client","coach"),false);
 assert.equal(mayAccessMedia(viewer("admin"),"client","coach"),false);
});
test("feedback receipt cannot turn an empty response into success",()=>{
 const good={ok:true,id,deduped:false,review_status:"reviewed",reviewed_at:"2026-09-25T12:00:00Z"};
 assert.equal(confirmedMediaAction(good,id,"review").ok,true);
 for(const value of [null,{},[],{...good,id:"other"},{...good,review_status:"awaiting_review"},{...good,reviewed_at:null},{...good,deduped:undefined}])assert.throws(()=>confirmedMediaAction(value,id,"review"));
});
test("review route uses the atomic audited command rather than best-effort audit",()=>{
 const route=readFileSync("app/api/media/[id]/review/route.ts","utf8");
 assert.match(route,/finalize_client_media_review/);assert.match(route,/confirmedMediaAction/);
 assert.doesNotMatch(route,/recordAudit|createServiceClient/);
});
test("client and coach both mount the same persistent feedback thread",()=>{
 const plan=readFileSync("app/plan/page.tsx","utf8"),profile=readFileSync("components/clients/client-video-workflow.tsx","utf8"),thread=readFileSync("components/media/client-coaching-thread.tsx","utf8");
 assert.match(plan,/<SendToCoach\/><ClientCoachingThread/);assert.match(profile,/<ClientCoachingThread/);
 assert.match(thread,/<ClientMediaReview/);assert.match(thread,/<ClipPlayback/);
 assert.doesNotMatch(plan,/ComingSoon|Book your free assessment/);
});
