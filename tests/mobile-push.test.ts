import test from "node:test";import assert from "node:assert/strict";import { mobilePushPayload,mobilePushTarget } from "../lib/mobile/push";
test("message push opens private client thread",()=>assert.equal(mobilePushTarget("coach_message",{clientId:"abc"}),"/messages/abc"));
test("session push cannot escape approved client routes",()=>assert.equal(mobilePushTarget("booking_confirmed",{sessionId:"abc"}),"/dashboard"));
test("workout push opens program",()=>assert.equal(mobilePushTarget("workout_ready",{programId:"p1"}),"/programs/p1"));
test("APNs payload carries safe local target",()=>{const p=mobilePushPayload({kind:"session_reminder",title:"Training tomorrow",body:"See you at IMS"});assert.equal(p.target,"/book");assert.equal(p.aps.sound,"default");});
