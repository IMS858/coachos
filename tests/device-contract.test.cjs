// Run with node --test tests/device-contract.test.cjs after npm install.
// Synthetic readings only; never use real client measurements in CI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
function loadTS(file) {
  const filename = path.join(__dirname, "..", file);
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  const m = new Module(filename, module);
  m.filename = filename; m.paths = module.paths; m._compile(js, filename);
  return m.exports;
}
const { approvedDeviceEvidence } = loadTS("lib/devices/approved-evidence.ts");
const { summarizeVoltraCSV, VOLTRA_COLUMNS } = loadTS("lib/devices/voltra-csv.ts");
const reading = (extra = {}) => ({
  review_status: "approved", kind: "rom", joint: "Shoulder",
  motion: "External rotation", side: "left", value: 52, unit: "degrees",
  rom_mode: "active", test_date: "2026-09-01", recorded_at: "2026-09-01T12:00:00Z", ...extra,
});
test("approved-only, side, canonical motion and explicit active ROM", () => {
  const out = approvedDeviceEvidence({ device_measurements: [
    reading(), reading({ review_status: "rejected", value: 180, side: "right" }),
    reading({ review_status: "requires_coach_review", value: 130, side: "right" }),
  ]});
  assert.deepEqual(out.objective_measures.current.rom.map(x => [x.joint, x.motion, x.side, x.degrees, x.mode]),
    [["shoulder", "er", "L", 52, "active"]]);
});
test("unverified ROM and generic force do not reach generator", () => {
  const out = approvedDeviceEvidence({ device_measurements: [
    reading({ rom_mode: "unspecified" }),
    reading({ kind: "force", value: 80, unit: "lb", protocol: "unspecified" }),
  ]});
  assert.equal(out.objective_measures, null);
  assert.equal(out.skipped_count, 2);
});
test("verified isometric force retains source units and side", () => {
  const out = approvedDeviceEvidence({ device_measurements: [
    reading({ kind: "force", joint: "Knee", motion: "Extension",
      value: 420, unit: "N", side: "right", protocol: "peak_isometric" }),
  ]});
  assert.deepEqual(out.objective_measures.current.dynamo.map(x => [x.test,x.side,x.value,x.unit]),
    [["knee_extension", "R", 420, "N"]]);
});
test("invalid newest duplicate does not suppress valid approved retest", () => {
  const out = approvedDeviceEvidence({ device_measurements: [
    reading({ value: 55, recorded_at: "2026-09-01T11:00:00Z" }),
    reading({ value: 999, recorded_at: "2026-09-01T13:00:00Z" }),
  ]});
  assert.equal(out.objective_measures.current.rom[0].degrees, 55);
});
test("no device fields in historical assessments", () => {
  const out = approvedDeviceEvidence({});
  assert.equal(out.objective_measures, null);
  assert.equal(out.approved_voltra_count, 0);
});
test("VOLTRA dynamic workouts remain descriptive, not isometric", () => {
  const out = approvedDeviceEvidence({ voltra_sessions: [{
    review_status: "approved", exercise: "Cable row", session_date: "2026-09-01",
    training_mode: "weight training", side: "bilateral", total_repetitions: 8, sets: [{ set_index: 1 }],
  }]});
  assert.equal(out.objective_measures, null);
  assert.match(out.approved_voltra_notes[0], /8 dynamic reps/);
});
const row = (set, rep) => [set, rep, 180, 180, 0, .43, 1.15, .38, .62, 210, 629,
  "100;110", ".3;.4", "50;60", "-90;-95", "-.2;-.3", "-45;-50"];
test("real 17-column Beyond+ format groups reps and preserves scalar units", () => {
  const csv = [VOLTRA_COLUMNS.join(","), row(1,1).join(","), row(1,2).join(",")].join("\n");
  const out = summarizeVoltraCSV(csv);
  assert.equal(out.total_repetitions, 2);
  assert.equal(out.sets[0].base_load_lb_min, 180);
  assert.equal(out.sets[0].peak_power_w, 629);
});
test("reject duplicate VOLTRA repetitions and malformed headers", () => {
  const csv = [VOLTRA_COLUMNS.join(","), row(1,1).join(","), row(1,1).join(",")].join("\n");
  assert.throws(() => summarizeVoltraCSV(csv), /Duplicate/);
  assert.throws(() => summarizeVoltraCSV("Set,Rep\n1,1"), /header/);
});

test("shared Python fixture produces identical VOLTRA summary", () => {
  const csv = [VOLTRA_COLUMNS.join(","),
    [1,1,180,0,0,.43,1,.38,.9,309,700,"180;181",".3;.4","100;200","180;180","-.3;-.4","-200;-300"].join(","),
    [1,2,180,0,0,.43,1,.47,.9,374,700,"180;181",".3;.4","100;200","180;180","-.3;-.4","-200;-300"].join(","),
    [1,3,180,0,0,.43,1,.50,.9,399,700,"180;181",".3;.4","100;200","180;180","-.3;-.4","-200;-300"].join(",")].join("\n");
  const summary = summarizeVoltraCSV(csv);
  assert.equal(summary.total_repetitions, 3);
  assert.deepEqual(summary.sets, [{
    set_index: 1, repetitions: 3, base_load_lb_min: 180, base_load_lb_max: 180,
    mean_velocity_m_s: .45, peak_velocity_m_s: .9,
    mean_power_w: 360.7, peak_power_w: 700, mean_rom_m: .43,
    total_duration_s: 3,
  }]);
});
test("malformed quotes and empty trace columns fail closed", () => {
  const header = VOLTRA_COLUMNS.join(",");
  const valid = row(1,1);
  assert.throws(() => summarizeVoltraCSV([header, valid.map((v,i) => i === 2 ? '18"0' : v).join(",")].join("\n")), /quote/);
  assert.throws(() => summarizeVoltraCSV([header, valid.map((v,i) => i === 11 ? "" : v).join(",")].join("\n")), /trace/);
});
