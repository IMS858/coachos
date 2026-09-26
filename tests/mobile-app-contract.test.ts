import test from "node:test";
import assert from "node:assert/strict";
import { IMS_MOBILE, safeMobileNextPath } from "../lib/mobile/app-contract";

test("IMS Fitness mobile identity is stable",()=>{assert.equal(IMS_MOBILE.appName,"IMS Fitness");assert.equal(IMS_MOBILE.bundleId,"com.imsfitness.app");assert.equal(IMS_MOBILE.urlScheme,"imsfitness");});
test("safe mobile deep links allow client destinations",()=>{assert.equal(safeMobileNextPath("/book?date=2026-09-25"),"/book?date=2026-09-25");assert.equal(safeMobileNextPath("/messages/abc"),"/messages/abc");});
test("safe mobile deep links reject staff and external redirects",()=>{assert.equal(safeMobileNextPath("/financials"),"/dashboard");assert.equal(safeMobileNextPath("//evil.example"),"/dashboard");assert.equal(safeMobileNextPath("https://evil.example"),"/dashboard");});
