import test from "node:test";
import assert from "node:assert/strict";
import { ptWallClockToUtc } from "../lib/recurring";
import { usesHandlerAuthentication, isStaffPage } from "../lib/auth/route-policy";
import { generatorEndpoint } from "../lib/programs/generator-endpoint";

test("recurring sessions keep Pacific wall time across both DST boundaries", () => {
  for (const [date, expected] of [
    ["2026-03-07", "14:15"], ["2026-03-08", "13:15"], ["2026-03-09", "13:15"],
    ["2026-10-31", "13:15"], ["2026-11-01", "14:15"], ["2026-11-02", "14:15"],
  ]) assert.equal(ptWallClockToUtc(date, "06:15").toISOString(), `${date}T${expected}:00.000Z`);
});
test("midnight and late appointments keep the intended date", () => {
  assert.equal(ptWallClockToUtc("2026-09-24", "00:00").toISOString(), "2026-09-24T07:00:00.000Z");
  assert.equal(ptWallClockToUtc("2026-09-24", "23:45").toISOString(), "2026-09-25T06:45:00.000Z");
});
test("ambiguous time uses first occurrence, nonexistent and invalid times fail explicitly", () => {
  assert.equal(ptWallClockToUtc("2026-11-01", "01:30").toISOString(), "2026-11-01T08:30:00.000Z");
  assert.throws(() => ptWallClockToUtc("2026-03-08", "02:30"), /does not exist/);
  assert.throws(() => ptWallClockToUtc("2026-02-30", "06:00"), /Invalid/);
  assert.throws(() => ptWallClockToUtc("2026-09-24", "24:00"), /Invalid/);
});
test("service auth bypass uses exact endpoints, never broad API prefixes", () => {
  for (const route of ["/api/webhooks/stripe", "/api/cron/low-balance", "/api/cron/recurring", "/api/cron/session-reminders", "/api/intake/submit", "/api/intake/waivers", "/api/integrations/website-lead"]) {
    assert.equal(usesHandlerAuthentication(route), true);
    assert.equal(usesHandlerAuthentication(route + "/admin"), false);
  }
  for (const route of ["/api/clients", "/api/intake/send", "/api/cron", "/api/media/assign", "/api/programs", "/api/webhooks/stripe-extra"]) assert.equal(usesHandlerAuthentication(route), false);
});
test("client program details reach ownership checks while staff listing and edit pages stay restricted", () => {
  assert.equal(isStaffPage("/programs/11111111-1111-4111-8111-111111111111"), false);
  for (const route of ["/programs", "/programs/new", "/programs/11111111-1111-4111-8111-111111111111/edit", "/clients", "/clients/123", "/assessments/new"]) assert.equal(isStaffPage(route), true);
  assert.equal(isStaffPage("/plan"), false);
});
test("private generator requests require a configured HTTPS destination", () => {
  assert.equal(generatorEndpoint(undefined, "generate", true), null);
  assert.equal(generatorEndpoint("http://generator.example", "generate", true), null);
  assert.equal(generatorEndpoint("https://user:pass@example.com", "render", true), null);
  assert.equal(generatorEndpoint("http://localhost:8000", "render", true), null);
  assert.equal(generatorEndpoint("http://localhost:8000", "render", false), "http://localhost:8000/api/render");
  assert.equal(generatorEndpoint("https://generator.example/", "generate", true), "https://generator.example/api/generate");
});
