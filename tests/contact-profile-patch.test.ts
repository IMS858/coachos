import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseContactPatch} from "../lib/clients/profile-patch";
test("contact-only client can omit email and add it later without login changes", () => {
 assert.deepEqual(parseContactPatch({kind:"profile",full_name:"Bridget Example",email:""},true),{full_name:"Bridget Example",email:null});
 assert.deepEqual(parseContactPatch({kind:"profile",email:"  Person@Example.test  "},true),{email:"person@example.test"});
 assert.deepEqual(parseContactPatch({kind:"profile",email:null},true),{email:null});
});
test("contact edits cannot activate, link or elevate a profile", () => {
 for (const extra of [{contact_only:false},{auth_user_id:"other"},{id:"other"},{role:"owner"}]) assert.throws(() => parseContactPatch({kind:"profile",email:"person@example.test",...extra},true));
 for (const value of [null,[],false,{kind:"profile"},{kind:"profile",email:3},{kind:"profile",email:"not-email"}]) assert.throws(() => parseContactPatch(value,true));
 assert.throws(() => parseContactPatch({kind:"profile",email:""},false));
});
test("profile editing is scoped and cannot send invitations or mutate auth", () => {
 const source=readFileSync("app/api/clients/[id]/route.ts","utf8");
 assert.match(source,/from\("clients"\).*select\("id"\)/);
 assert.match(source,/parseContactPatch\(body, target.data.contact_only\)/);
 assert.match(source,/if \(!saved.data\)/);
 assert.doesNotMatch(source,/createServiceClient|auth\.admin|sendLoginInvite|sendEmail/);
});
test("record-only profiles are excluded from all existing portal access actions", () => {
 for(const file of ["app/api/clients/[id]/invite/route.ts","app/api/clients/[id]/set-password/route.ts"]) assert.match(readFileSync(file,"utf8"),/contact_only/);
 assert.match(readFileSync("app/api/admin/invite-all/route.ts","utf8"),/\.eq\("contact_only", false\)/);
 assert.match(readFileSync("app/clients/[id]/page.tsx","utf8"),/email: profileRow.email \?\? ""/);
});
