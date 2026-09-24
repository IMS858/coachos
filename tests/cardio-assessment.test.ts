import test from "node:test";
import assert from "node:assert/strict";
import {
  generatorCardioProfile,
  generatorRichRestrictions,
  includeUnverifiedSurgicalHistory,
  recommendedTrainingDays,
} from "../lib/programs/cardio-assessment";

test("blank primary never drops avoid list or authorizes intervals", () => {
  const p = generatorCardioProfile(
    { primary_machine: "", avoid_machines: ["rower", "skierg"], interval_clearance: "" },
    {}
  );
  assert.equal(p.primary_modality, null);
  assert.deepEqual(p.avoid_modalities, ["rower", "skierg"]);
  assert.deepEqual(p.limitations, ["not_cleared_for_intervals"]);
  assert.equal(p.interval_clearance, "not_cleared");
});

test("explicit clearance is the only path to unlocked intervals", () => {
  const cleared = generatorCardioProfile(
    { primary_machine: "stationary_bike", interval_clearance: "cleared" }, {}
  );
  assert.deepEqual(cleared.limitations, ["cleared_for_intervals"]);
  for (const value of [undefined, "not_cleared", "unknown", ""]) {
    assert.deepEqual(generatorCardioProfile({ interval_clearance: value }, {}).limitations, ["not_cleared_for_intervals"]);
  }
});

test("avoid overrides inconsistent machine selections and invalid entries", () => {
  const p = generatorCardioProfile({
    primary_machine: "rower",
    tolerated_machines: ["rower", "arc_trainer", "imaginary_machine"],
    avoid_machines: ["rower", "imaginary_machine"],
  }, {});
  assert.equal(p.primary_modality, "rower"); // upstream routing rejects the conflict.
  assert.deepEqual(p.secondary_modalities, ["arc_trainer"]);
  assert.deepEqual(p.avoid_modalities, ["rower"]);
});

test("heart-rate recovery only passes complete plausible values", () => {
  assert.deepEqual(generatorCardioProfile({}, { hrr_end_hr: "150", hrr_one_min_hr: "130" }).hr_recovery,
    { end_hr: 150, one_min_hr: 130 });
  assert.deepEqual(generatorCardioProfile({}, { hrr_end_hr: "100", hrr_one_min_hr: "180" }).hr_recovery, {});
  assert.deepEqual(generatorCardioProfile({}, { hrr_end_hr: "garbage", hrr_one_min_hr: "88" }).hr_recovery, {});
});

test("left/right joint restrictions map to canonical loading joints", () => {
  const rows = generatorRichRestrictions({
    left_knee: { status: "active_flare_up", severity: "6", description: "Do not load" },
    right_shoulder: { status: "avoid_loading", severity: "3" },
    neck_cervical: { status: "post_surgery" },
    "unknown body part": { status: "active_flare_up" },
  });
  assert.deepEqual(rows.map(r => [r.key, r.side, r.status]), [
    ["knee", "L", "active_flare_up"],
    ["shoulder", "R", "avoid_loading"],
    ["cervical", "bilateral", "post_surgery"],
    ["unknown", "bilateral", "active_flare_up"],
  ]);
});

test("unverified surgical history triggers hold but documented clearance does not", () => {
  const unverified = includeUnverifiedSurgicalHistory([], "ACL reconstruction 2019");
  assert.deepEqual(unverified.map(r => [r.key, r.status]), [["knee", "avoid_loading"]]);
  const cleared = generatorRichRestrictions({ left_knee: {status: "cleared"} });
  assert.equal(includeUnverifiedSurgicalHistory(cleared, "ACL reconstruction 2019").length, 1);
  assert.equal(includeUnverifiedSurgicalHistory([], "").length, 0);
  assert.deepEqual(includeUnverifiedSurgicalHistory([], "other surgery").map(r => r.key), ["unknown"]);
});

test("coach recommended total sessions includes rather than adds cardio", () => {
  for (const count of [1, 2, 3, 4, 5]) {
    const split = recommendedTrainingDays(count);
    assert.equal(split.strength_days + split.cardio_days, count);
    assert.equal(split.training_frequency, count);
  }
  assert.deepEqual(recommendedTrainingDays(4), { strength_days:3, cardio_days:1, training_frequency:4 });
});
