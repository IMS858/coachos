import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {mediaReviewHref} from "../lib/media/review-links";
test("pending clip navigation targets exact durable identity, not the client's latest 20 clips",()=>{
 const id="11111111-1111-4111-8111-111111111111";assert.equal(mediaReviewHref(id),"/coaching/media/"+id);assert.throws(()=>mediaReviewHref("../../other"));
 const action=readFileSync("app/action-center/page.tsx","utf8"),page=readFileSync("app/coaching/media/[id]/page.tsx","utf8"),thread=readFileSync("components/media/client-coaching-thread.tsx","utf8");
 assert.match(action,/href:mediaReviewHref\(row.id\)/);assert.match(page,/mayAccessMedia/);assert.match(page,/mediaId=\{id\}/);assert.match(thread,/source=source.eq\("id",mediaId\)/);
});
