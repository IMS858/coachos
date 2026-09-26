import test from "node:test";
import assert from "node:assert/strict";
import {activeTrainingPackageBalance,packageBalanceEvidence,packageBalanceLabel} from "../lib/plans/package-balance";

test("package balance never converts missing counters into zero",()=>{
  const result=packageBalanceEvidence({id:"p",kind:"package",total_sessions:null,sessions_used:4});
  assert.equal(result.status,"unknown");
  assert.equal(result.remaining,null);
  assert.equal(packageBalanceLabel(result),"Package balance needs review");
});

test("inconsistent dual counters stay unknown",()=>{
  const result=packageBalanceEvidence({id:"p",kind:"package",total_sessions:12,sessions_used:5,current_session_number:4});
  assert.equal(result.status,"unknown");
});

test("overrun is explicit instead of negative remaining",()=>{
  const result=packageBalanceEvidence({id:"p",kind:"package",total_sessions:6,sessions_used:8,current_session_number:8});
  assert.equal(result.status,"known");
  assert.equal(result.remaining,0);
  assert.equal(result.overrun,2);
  assert.equal(packageBalanceLabel(result),"0 remaining · 2 over package");
});

test("multiple active training packages are ambiguous unless the session is linked",()=>{
  const plans=[
    {id:"a",kind:"package",status:"active",service_type:"training",total_sessions:6,sessions_used:2,current_session_number:2},
    {id:"b",kind:"package",status:"active",service_type:"training",total_sessions:12,sessions_used:3,current_session_number:3},
  ];
  assert.equal(activeTrainingPackageBalance(plans).status,"ambiguous");
  const linked=activeTrainingPackageBalance(plans,"b");
  assert.equal(linked.status,"known");
  assert.equal(linked.remaining,9);
});

test("non-training packages do not become training runway",()=>{
  const result=activeTrainingPackageBalance([{id:"m",kind:"package",status:"active",service_type:"massage",total_sessions:6,sessions_used:1}]);
  assert.equal(result.status,"none");
});
