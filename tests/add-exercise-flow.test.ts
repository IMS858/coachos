import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("working library exposes fast custom exercise creation", () => {
  const catalog = readFileSync("components/library/coach-exercise-catalog.tsx", "utf8");
  const panel = readFileSync("components/library/add-exercise-panel.tsx", "utf8");
  assert.match(catalog, /AddExercisePanel/);
  for (const label of ["Shoulder Capsule CAR", "Record demo", "Upload video", "Save & add another"]) assert.ok(panel.includes(label));
});
test("custom exercise save delegates to schema-verified private draft persistence", () => {
  const route = readFileSync("app/api/exercises/route.ts", "utf8");
  const save = readFileSync("lib/exercises/capture-server.ts", "utf8");
  assert.match(route, /saveCapture/); assert.match(save, /client_visible: false/); assert.match(save, /status: "draft"/);
  assert.match(save, /video_guid/); assert.doesNotMatch(save, /programming_notes|video_provider|video_url/);
});
test("exercise upload uses a caller-scoped signed storage path, never an API video payload", () => {
  const route = readFileSync("app/api/media/exercise-upload-url/route.ts", "utf8");
  const contract = readFileSync("lib/exercises/capture.ts", "utf8");
  assert.match(route, /createSignedUploadUrl/); assert.match(route, /demoPath/); assert.match(contract, /exercise-drafts/);
});
