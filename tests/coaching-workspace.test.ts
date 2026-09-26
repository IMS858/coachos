import test from "node:test";
import assert from "node:assert/strict";
import { allCatalogPages, exerciseSetData, filterCatalog, parseExerciseSetInput, type CatalogExercise } from "../lib/exercises/catalog";
import { saveExerciseSet } from "../lib/exercises/collections-server";
import { leadBucket, leadWorkspace, type LeadRecord } from "../lib/leads/workspace";
import { researchImportSchema } from "../lib/leads/research";

const actor = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
const row: CatalogExercise = { canonical_id: "EX-0001", canonical_name: "Ankle Dorsiflexion Lift-Off", aliases: "Ankle lift", category: "foot_ankle_mobility", movement_pattern: "foot_ankle", source_primary_joints: "ankle", equipment: null, mapping_status: "pending", matched_exercise_id: null };
const input = { request_id: request, client_id: client, name: "Lower-body preparation", canonical_ids: ["EX-0001"], note: "Synthetic test only" };

test("full source catalog is paged past the old 200-entry cap", async () => {
  const source = Array.from({ length: 423 }, (_, i) => ({ ...row, canonical_id: `EX-${String(i + 1).padStart(4,"0")}` }));
  const calls: number[] = [];
  const loaded = await allCatalogPages((from,to) => { calls.push(from); return Promise.resolve({ data: source.slice(from,to + 1), error: null, count: 423 }); });
  assert.equal(loaded.length,423); assert.deepEqual(calls,[0,200,400]);
});
test("partial catalog failures and changing counts are not displayed as full coverage", async () => {
  await assert.rejects(allCatalogPages(() => Promise.resolve({ data: [], error: new Error("Synthetic failure") })));
  await assert.rejects(allCatalogPages(() => Promise.resolve({ data: [row], error: null, count: 423 })), /incomplete/);
});
test("pending source exercises can be searched and selected without fabricating mappings", () => {
  assert.equal(filterCatalog([row], { query: "ankle lift", joint: "ankle" }).length,1);
  assert.equal(filterCatalog([row], { selectedOnly: true }, new Set([row.canonical_id])).length,1);
  const saved = exerciseSetData(input, [{ ...row, matched_exercise_id: "unverified-candidate" }], actor);
  assert.equal(saved.visibility,"coach_only"); assert.equal(saved.exercises[0].matched_exercise_id,null);
  assert.equal("safety_status" in saved,false); assert.equal("client_visible" in saved,false);
});
test("exercise selections reject publication overrides, duplicate IDs and unknown source IDs", () => {
  assert.equal(parseExerciseSetInput(input).client_id,client);
  assert.throws(() => parseExerciseSetInput({ ...input, status: "published" }));
  assert.throws(() => parseExerciseSetInput({ ...input, canonical_ids: ["EX-0001","EX-0001"] }));
  assert.throws(() => parseExerciseSetInput({ ...input, canonical_ids: ["made-up"] }));
  assert.throws(() => exerciseSetData({ ...input, canonical_ids: ["EX-0999"] }, [row], actor));
});

function mockDb() {
  const stores: Record<string, Record<string, any>[]> = { profiles: [{ id: client, role: "client", deleted_at: null }], clients: [{ id: client }], canonical_exercise_queue: [row], programs: [] };
  const writes: string[] = [];
  const failing = new Set<string>();
  const db = { from(table: string) {
    const filters: ((row: Record<string, any>) => boolean)[] = [];
    let action = "read", payload: Record<string, any> = {};
    const column = (record: Record<string, any>, key: string) => key === "data->>source" ? record.data?.source : record[key];
    const finish = (single = false) => {
      if (failing.has(table)) return { data: null, error: { message: "Synthetic failure" } };
      let matches = stores[table].filter(record => filters.every(filter => filter(record)));
      if (action === "insert") {
        if (stores[table].some(record => record.id === payload.id)) return { data: null, error: { code: "23505" } };
        const saved = { ...payload, updated_at: "2026-09-24T20:00:00Z" }; stores[table].push(saved); matches = [saved]; writes.push(table);
      }
      if (action === "update") { matches.forEach(record => Object.assign(record,payload)); if (matches.length) writes.push(table); }
      return { data: single ? matches[0] ?? null : matches, error: null };
    };
    const q: any = {
      select: () => q,
      eq: (key: string,value: unknown) => { filters.push(record => column(record,key) === value); return q; },
      is: (key: string,value: unknown) => { filters.push(record => column(record,key) === value); return q; },
      in: (key: string,values: unknown[]) => { filters.push(record => values.includes(column(record,key))); return q; },
      insert: (value: Record<string, any>) => { action = "insert"; payload = value; return q; },
      update: (value: Record<string, any>) => { action = "update"; payload = value; return q; },
      maybeSingle: async () => finish(true), single: async () => finish(true),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(finish()).then(resolve,reject),
    };
    return q;
  } };
  return { db: db as never, stores, writes, failing };
}
test("saving a set is one private program-row write; replay does not duplicate", async () => {
  const env = mockDb();
  const first = await saveExerciseSet(env.db,actor,input,false);
  const replay = await saveExerciseSet(env.db,actor,input,false);
  assert.equal(first.deduped,false); assert.equal(replay.deduped,true);
  assert.deepEqual(env.writes,["programs"]);
  assert.equal(env.stores.programs[0].status,"draft");
  assert.equal(env.stores.programs[0].client_id,client);
});
test("different content with a reused save ID cannot overwrite a saved set", async () => {
  const env = mockDb(); await saveExerciseSet(env.db,actor,input,false);
  await assert.rejects(saveExerciseSet(env.db,actor,{ ...input, name: "Changed" },false), /already in use/);
  assert.equal(env.stores.programs[0].name,input.name);
});
test("missing clients, catalog failures and unknown IDs produce no writes", async () => {
  for (const scenario of ["missing-client","catalog-failure","unknown-id"]) {
    const env = mockDb();
    if (scenario === "missing-client") env.stores.clients = [];
    if (scenario === "catalog-failure") env.failing.add("canonical_exercise_queue");
    await assert.rejects(saveExerciseSet(env.db,actor,scenario === "unknown-id" ? { ...input, canonical_ids: ["EX-0999"] } : input,false));
    assert.deepEqual(env.writes,[]);
  }
});
test("stale edit cannot overwrite concurrent changes or move a collection to another client", async () => {
  const env = mockDb(); await saveExerciseSet(env.db,actor,input,false);
  await assert.rejects(saveExerciseSet(env.db,actor,{ ...input, expected_updated_at: "2026-09-23T00:00:00Z" },true), /changed/);
  env.stores.programs[0].client_id = actor;
  await assert.rejects(saveExerciseSet(env.db,actor,{ ...input, expected_updated_at: "2026-09-24T20:00:00Z" },true), /not found/);
});

function lead(source: string, notes: string | null = null): LeadRecord {
  return { id: source, full_name: "Synthetic organization", source, stage: "new", notes, email: null, phone: null, interest: null, appointments_booked: 0, last_visited: null, prior_trainer: null, last_contacted_at: null, created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z" };
}
test("legacy imports are Contacts even when imported with stage new", () => {
  const ws = leadWorkspace([lead("vagaro"),lead("jason_contacts"),lead("marketing"),lead("manual"),lead("website_contact"),lead("agent_research")]);
  assert.equal(ws.contacts.length,3); assert.equal(ws.pipeline.length,2); assert.equal(ws.untouched.length,2); assert.equal(ws.research.length,1);
});
test("a genuine repeat website inquiry resurfaces without rewriting the original source", () => {
  const row = lead("vagaro", '[Website enquiry:abc123] {"message":"I would like to discuss training"}');
  assert.equal(leadBucket(row),"pipeline"); assert.equal(row.source,"vagaro");
  assert.equal(leadBucket(lead("vagaro","[Website enquiry:abc123] not JSON")),"contacts");
  assert.equal(leadBucket(lead("unknown")),"contacts");
});
test("research requires evidence and cannot smuggle outreach, qualification or personal data fields", () => {
  const candidate = { organization: "Synthetic Partner", website_url: "https://example.org", evidence_url: "https://example.org/community", fit_reason: "Public community activity matches a possible training partnership.", next_step: "Owner reviews evidence before any outreach.", checked_on: "2026-09-24" };
  assert.equal(researchImportSchema.safeParse({ request_id: request, candidates: [candidate] }).success,true);
  for (const bad of [{ ...candidate, evidence_url: "javascript:alert(1)" }, { ...candidate, checked_on: "2026-02-30" }, { ...candidate, personal_email: "private@example.org" }, { ...candidate, qualified: true }]) assert.equal(researchImportSchema.safeParse({ request_id: request, candidates: [bad] }).success,false);
  assert.equal(researchImportSchema.safeParse({ request_id: request, candidates: [candidate,candidate] }).success,false);
});
