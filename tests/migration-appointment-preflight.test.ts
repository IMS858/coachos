import test from "node:test";
import assert from "node:assert/strict";
import {appointmentPreflight} from "../lib/migration/appointment-preflight";

test("basic appointment preflight rejects invalid time and duration",()=>{
 assert.equal(appointmentPreflight("not-a-date",60).status,"hold");
 assert.equal(appointmentPreflight("2026-09-26T16:00:00Z",0).status,"hold");
 assert.equal(appointmentPreflight("2026-09-26T16:00:00Z",60).status,"ready");
});
