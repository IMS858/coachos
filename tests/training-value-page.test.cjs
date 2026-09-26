const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.join(__dirname, "..");
function load(file, replacements = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
  const loadedModule = {exports: {}};
  new Function("require", "module", "exports", compiled)(name => {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    if (name === "react/jsx-runtime") return {jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props})};
    throw new Error("Unexpected import " + name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
function harness({role = "owner", deleted = false, profileError = false, user = true, sessions = [], failRead = false} = {}) {
  const calls = [];
  const db = {
    auth: {getUser: async () => ({data: {user: user ? {id: "viewer"} : null}})},
    from(table) {
      calls.push(table);
      let selectedIds = [];
      const query = {
        select() {return query;}, eq() {return query;}, order() {return query;}, gte() {return query;}, lt() {return query;},
        in(_column, ids) {selectedIds = ids; return query;},
        async maybeSingle() {return {data: {role, deleted_at: deleted ? "2026-01-01" : null}, error: profileError ? {message: "unavailable"} : null};},
        async range(from, to) {
          if (failRead && table === "sessions") return {data: null, count: null, error: {message: "offline"}};
          const rows = table === "sessions" ? sessions : selectedIds.map(id => ({id, full_name: "Synthetic " + id}));
          return {data: rows.slice(from, to + 1), count: rows.length, error: null};
        },
      };
      return query;
    },
  };
  const page = load("app/reports/training-value/page.tsx", {
    "next/link": {default: "a"},
    "next/navigation": {redirect: target => {throw new Error("redirect:" + target);}},
    "@/components/layout/app-shell": {AppShell: "shell"},
    "@/lib/supabase/server": {createClient: async () => db},
    "@/lib/migration/complete-read": load("lib/migration/complete-read.ts"),
    "@/lib/migration/historical-value": load("lib/migration/historical-value.ts"),
  }).default;
  return {page, calls};
}
function text(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node.type === "function") return text(node.type(node.props));
  return text(node.props?.children);
}
const session = (id, status, days) => ({id, client_id: "client-a", trainer_id: "trainer-a", scheduled_at: new Date(Date.now() + days * 86400000).toISOString(), duration_minutes: 60, session_type: "training", status});
test("actual server report rejects trainer/client/deleted viewers before reading sessions", async () => {
  for (const options of [{role: "trainer"}, {role: "client"}, {deleted: true}, {profileError: true}, {user: false}]) {
    const h = harness(options); await assert.rejects(h.page()); assert.ok(!h.calls.includes("sessions"));
  }
});
test("actual server report calculates separate estimates and pending work", async () => {
  const h = harness({sessions: [session("1", "completed", -3), session("2", "scheduled", 3), session("3", "scheduled", -2)]});
  const output = text(await h.page()).replace(/\s+/g, " "); assert.match(output, /Completed training estimate \$93/); assert.match(output, /Upcoming schedule estimate \$93/); assert.match(output, /past booking without completion/); assert.doesNotMatch(output, /\$186/);
});
test("actual server report refuses a failed read instead of showing value cards", async () => {
  const h = harness({failRead: true}); const output = text(await h.page()).replace(/\s+/g, " "); assert.match(output, /Training value is unavailable/); assert.match(output, /No partial or zero-dollar/); assert.doesNotMatch(output, /Completed training estimate/);
});
test("actual server report loads multiple pages before computing", async () => {
  const h = harness({sessions: Array.from({length: 251}, (_, i) => session(String(i), "completed", -2))});
  const output = text(await h.page()).replace(/\s+/g, " "); assert.match(output, /251 operational session records loaded/); assert.match(output, /\$23,343/);
});
