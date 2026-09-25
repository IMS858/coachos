const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, overrides = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const localRequire = require("node:module").createRequire(filename);
  function resolve(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name.startsWith(".")) {
      const candidate = path.resolve(path.dirname(filename), name);
      const typed = [candidate + ".ts", candidate + ".tsx", path.join(candidate, "index.ts")].find(p => fs.existsSync(p));
      if (typed) return load(typed, overrides, cache);
    }
    return localRequire(name);
  }
  new Function("require", "module", "exports", result.outputText)(resolve, module, module.exports);
  return module.exports;
}
const capture = load("lib/exercises/capture.ts");
const server = load("lib/exercises/capture-server.ts");
const drafts = load("lib/programs/library-draft.ts");
const actor = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const exercise = "33333333-3333-4333-8333-333333333333";
const program = "44444444-4444-4444-8444-444444444444";
const raw = () => ({ request_id: exercise, client_program_id: program, client_context_id: client, name: "Synthetic shoulder drill", category: "mobility", description: "Synthetic coaching description", coaching_cues: ["Slow and controlled"], primary_joints: ["shoulder"], video_storage_path: null, default_prescription: { sets: "2", reps: "30s", load: "unloaded", rest_seconds: "0", tempo: "controlled" } });
function database() {
  const rows = { profiles: [{ id: client, role: "client", deleted_at: null }], clients: [{ id: client }], exercises: [], programs: [] };
  const writes = [];
  const failInsert = new Set();
  const db = { from(table) {
    let body;
    const filters = [];
    const q = {
      select() { return q; }, eq(key, value) { filters.push(r => r[key] === value); return q; }, is(key, value) { filters.push(r => r[key] === value); return q; },
      insert(value) { body = value; return q; },
      async maybeSingle() { return finish(); }, async single() { return finish(); },
    };
    function finish() {
      if (body) {
        if (failInsert.has(table)) return { error: { code: "XX000" }, data: null };
        if (rows[table].some(r => r.id === body.id)) return { error: { code: "23505" }, data: null };
        if (table === "exercises") {
          const allowed = new Set(["id","name","ims_label","slug","category","movement_pattern","level","short_description","coaching_cues","primary_joints","default_sets","default_reps","default_rest_seconds","default_tempo","setup_notes","video_guid","tags","status","client_visible","created_by"]);
          assert.deepEqual(Object.keys(body).filter(k => !allowed.has(k)), [], "only verified hosted columns may be inserted");
          assert.ok(["mobility_drill", "other"].includes(body.movement_pattern));
        }
        rows[table].push(structuredClone(body)); writes.push(table);
        return { data: structuredClone(body), error: null };
      }
      return { data: rows[table].find(r => filters.every(f => f(r))) ?? null, error: null };
    }
    return q;
  } };
  return { db, rows, writes, failInsert };
}
test("capture normalizes numeric inputs and preserves timed reps and zero rest", () => {
  const input = capture.parseCapture(raw(), actor);
  assert.equal(input.default_prescription.sets, 2); assert.equal(input.default_prescription.reps, "30s"); assert.equal(input.default_prescription.rest_seconds, 0);
});
test("invalid fields, identities, enum values and nested objects are rejected before writes", () => {
  for (const change of [{ status: "published" }, { client_visible: true }, { category: "corrective" }, { client_context_id: "invalid" }, { default_prescription: { sets: {}, reps: "5" } }, { default_prescription: { sets: "0" } }, { primary_joints: ["invented"] }]) assert.throws(() => capture.parseCapture({ ...raw(), ...change }, actor));
});
test("private demo paths are constrained to the actual coach and save ID", () => {
  const path = capture.demoPath(actor, exercise, "mov");
  assert.ok(capture.validateDemoPath(path, actor, exercise));
  for (const invalid of [path.replace(actor, client), path.replace(exercise, program), `exercise-drafts/${actor}/../file.mov`, "https://example.invalid/video.mp4"]) assert.throws(() => capture.parseCapture({ ...raw(), video_storage_path: invalid }, actor));
});
test("empty files, oversized recordings, unsupported formats and mismatched MIME fail visibly", () => {
  assert.equal(capture.videoFileError({ name: "demo.mov", type: "video/quicktime", size: 4096 }), null);
  for (const file of [{ name: "x.svg", type: "image/svg+xml", size: 100 }, { name: "x.mp4", type: "text/html", size: 100 }, { name: "x.mp4", type: "video/mp4", size: 0 }, { name: "x.mov", type: "video/quicktime", size: capture.MAX_DEMO_BYTES + 1 }]) assert.ok(capture.videoFileError(file));
});
test("one exercise save creates a linked PRIVATE client outline, never a package or message", async () => {
  const env = database(); const result = await server.saveCapture(env.db, actor, capture.parseCapture(raw(), actor));
  assert.equal(result.client_program_id, program); assert.equal(env.rows.exercises[0].client_visible, false); assert.equal(env.rows.exercises[0].status, "draft");
  assert.equal(env.rows.programs[0].status, "draft"); assert.equal(env.rows.programs[0].data.exercises[0].exercise_id, exercise);
  assert.deepEqual(env.writes, ["exercises", "programs"]);
  assert.ok(!JSON.stringify(env.rows.exercises[0]).includes(client), "client identity is not stored on a reusable library row");
});
test("retries and parallel saves never create a second exercise or client draft", async () => {
  const env = database(); const input = capture.parseCapture(raw(), actor);
  await Promise.all([server.saveCapture(env.db, actor, input), server.saveCapture(env.db, actor, input)]);
  await server.saveCapture(env.db, actor, input);
  assert.equal(env.rows.exercises.length, 1); assert.equal(env.rows.programs.length, 1);
});
test("a client draft failure is explicit and can be resumed without redoing the exercise", async () => {
  const env = database(); env.failInsert.add("programs"); const input = capture.parseCapture(raw(), actor);
  await assert.rejects(server.saveCapture(env.db, actor, input), e => e.exerciseSaved === true && e.status === 503);
  assert.equal(env.rows.exercises.length, 1); assert.equal(env.rows.programs.length, 0);
  env.failInsert.clear(); await server.saveCapture(env.db, actor, input);
  assert.equal(env.rows.exercises.length, 1); assert.equal(env.rows.programs.length, 1);
});
test("changed content cannot reuse a completed save ID", async () => {
  const env = database(); await server.saveCapture(env.db, actor, capture.parseCapture(raw(), actor));
  await assert.rejects(server.saveCapture(env.db, actor, capture.parseCapture({ ...raw(), name: "Different" }, actor)), e => e.status === 409);
});
test("missing or deleted clients are rejected before saving an exercise", async () => {
  for (const mode of ["missing", "deleted"]) {
    const env = database(); if (mode === "missing") env.rows.clients = []; else env.rows.profiles[0].deleted_at = "2026-09-24T00:00:00Z";
    await assert.rejects(server.saveCapture(env.db, actor, capture.parseCapture(raw(), actor)));
    assert.deepEqual(env.writes, []);
  }
});
test("library-only capture does not create a fictional client/program", async () => {
  const env = database(); await server.saveCapture(env.db, actor, capture.parseCapture({ ...raw(), client_context_id: null, client_program_id: null }, actor));
  assert.deepEqual(env.writes, ["exercises"]);
});
test("converted source snapshots and custom exercise defaults both reopen in the draft editor", () => {
  const data = { source: "ims_library_program", exercises: [{ canonical_id: "EX-0001", name: "Synthetic A", matched_exercise_id: exercise }, { exercise_id: program, name: "Synthetic B", sets: 2, reps: "30s", rest_seconds: 0 }] };
  const rows = drafts.libraryDraftRows(data);
  assert.equal(rows.length, 2); assert.equal(rows[0].exercise_id, exercise); assert.equal(rows[1].reps, "30s");
});
test("prescription editing keeps source identity and fails closed on overrides", () => {
  const data = { source: "ims_library_program", exercises: [{ name: "Synthetic", exercise_id: exercise }] };
  const prescription = { key: "0", sets: 2, reps: "30s", load: "unloaded", rest_seconds: 0, tempo: "slow" };
  const saved = drafts.applyDraftPrescription(data, [prescription]);
  assert.equal(saved.exercises[0].exercise_id, exercise); assert.equal(saved.visibility, "coach_only"); assert.equal(saved.prescription_status, "ready_for_coach_review");
  assert.throws(() => drafts.applyDraftPrescription(data, [{ ...prescription, exercise_id: program }]));
  assert.throws(() => drafts.applyDraftPrescription(data, [{ ...prescription, sets: false }]));
  assert.throws(() => drafts.applyDraftPrescription(data, []));
});
const compression = load("lib/compress.ts");
test("Full HD sizing preserves portrait orientation without upscaling or crop", () => {
  assert.deepEqual(compression.fitVideoDimensions(2160, 3840), { width:1080, height:1920 });
  assert.deepEqual(compression.fitVideoDimensions(3840, 2160), { width:1920, height:1080 });
  assert.deepEqual(compression.fitVideoDimensions(640, 480), { width:640, height:480 });
  assert.throws(() => compression.fitVideoDimensions(0, 0));
});
test("unsupported encoding returns the exact original file, never a silent audio downgrade", async () => {
  const file = { size: 30 * 1024 * 1024, name: "synthetic.mov" };
  const result = await compression.compressVideo(file);
  assert.equal(result.file, file); assert.equal(result.skipped, true);
});
test("generic program edits cannot publish or rewrite quick draft identity", async () => {
  const calls = [];
  const db = { auth:{getUser:async()=>({data:{user:{id:actor}}})}, from(table) {
    const q = { select(){return q;}, eq(){return q;}, async maybeSingle(){return table === "profiles" ? {data:{role:"owner",deleted_at:null},error:null} : {data:{id:program,status:"draft",data:{source:"ims_library_program"}},error:null};}, update(){calls.push("write");throw new Error("unexpected write");} };
    return q;
  } };
  const route = load("app/api/programs/[id]/route.ts", {
    "next/server": {NextResponse:{json:(body,init={})=>new Response(JSON.stringify(body),{status:init.status||200})}},
    "@/lib/supabase/server":{createClient:async()=>db},
    "@/lib/exercises/catalog":{isExerciseSet:v=>v?.source==="ims_exercise_set"},
    "@/lib/media/request":{smallJson:r=>r.json()},
  });
  for (const body of [{status:"published"},{data:{source:"manual"}},{data:{source:"manual"},status:"published"}]) {
    const request = new Request("https://ims.invalid/api/programs/"+program,{method:"PATCH",body:JSON.stringify(body)});
    request.nextUrl = new URL(request.url);
    const response=await route.PATCH(request,{params:Promise.resolve({id:program})});assert.equal(response.status,409);
  }
  assert.deepEqual(calls,[]);
});
function nextResponse() { return { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status || 200, headers: init.headers }) } }; }
function authDatabase(role, deleted = false) {
  return { auth: { getUser: async () => ({ data: { user: role === "anonymous" ? null : { id:actor } } }) }, from() {
    const q = { select(){return q;}, eq(){return q;}, maybeSingle:async()=>({data:{role,deleted_at:deleted?"2026-09-24":null},error:null}) }; return q;
  } };
}
for (const [role, deleted, expected] of [["anonymous",false,401],["client",false,403],["owner",true,403]]) {
  test(`exercise creation denies ${role}${deleted ? " (disabled)" : ""} before any elevated storage or write`, async () => {
    const route = load("app/api/exercises/route.ts", {
      "next/server":nextResponse(), "@/lib/supabase/server":{createClient:async()=>authDatabase(role,deleted),createServiceClient:()=>{throw new Error("Elevated access must not happen");}},
      "@/lib/exercises/capture":capture,"@/lib/exercises/capture-server":server,"@/lib/media/request":{smallJson:r=>r.json()},
    });
    const req=new Request("https://ims.invalid/api/exercises",{method:"POST",body:JSON.stringify(raw())});req.nextUrl=new URL(req.url);
    assert.equal((await route.POST(req)).status,expected);
  });
}
test("cross-origin exercise creation is rejected before data validation or storage", async () => {
  const route=load("app/api/exercises/route.ts",{"next/server":nextResponse(),"@/lib/supabase/server":{createClient:async()=>authDatabase("owner"),createServiceClient:()=>{throw new Error("Unexpected elevated access");}},"@/lib/exercises/capture":capture,"@/lib/exercises/capture-server":server,"@/lib/media/request":{smallJson:()=>{throw new Error("Unexpected body read");}}});
  const req=new Request("https://ims.invalid/api/exercises",{method:"POST",headers:{origin:"https://other.invalid"},body:"{}"});req.nextUrl=new URL(req.url);
  assert.equal((await route.POST(req)).status,403);
});
test("private demo access rejects clients and invalid file ownership before signing", async () => {
  for (const state of [{role:"client",status:"draft",visible:false,path:capture.demoPath(actor,exercise,"mp4")},{role:"owner",status:"draft",visible:false,path:capture.demoPath(client,exercise,"mp4")}]) {
    let signed=0;
    const db={auth:{getUser:async()=>({data:{user:{id:actor}}})},from(table){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:table==="profiles"?{role:state.role,deleted_at:null}:{id:exercise,status:state.status,client_visible:state.visible,created_by:actor,video_guid:"supabase:"+state.path},error:null})};return q;}};
    const route=load("app/api/exercises/[id]/video/route.ts",{"next/server":nextResponse(),"@/lib/exercises/capture":capture,"@/lib/supabase/server":{createClient:async()=>db,createServiceClient:()=>({storage:{from:()=>({createSignedUrl:async()=>{signed++;return{data:{signedUrl:"https://storage.invalid/synthetic"},error:null};}})}})}});
    const response=await route.GET(new Request("https://ims.invalid"),{params:Promise.resolve({id:exercise})});assert.ok([404,409].includes(response.status));assert.equal(signed,0);
  }
});
test("small JSON reader enforces actual streamed length", async () => {
  const {smallJson}=load("lib/media/request.ts");
  const valid=new Request("https://ims.invalid",{method:"POST",body:'{"ok":true}'});
  assert.deepEqual(await smallJson(valid),{ok:true});
  await assert.rejects(smallJson(new Request("https://ims.invalid",{method:"POST",body:"x".repeat(33)}),32),/too large/);
});
