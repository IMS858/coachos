import test from "node:test";import assert from "node:assert/strict";
import {parseStaffUpload,parseStaffMediaSave} from "../lib/media/staff-upload";
import {isStaffPage} from "../lib/auth/route-policy";
const client="11111111-1111-4111-8111-111111111111",base="22222222-2222-4222-8222-222222222222";
test("staff upload accepts only owned immutable file references and supported formats",()=>{
 assert.equal(parseStaffUpload({client_id:client,ext:"MOV"}).ext,"mov");
 assert.equal(parseStaffUpload({client_id:client,ext:"jpg",base,poster:true}).poster,true);
 for(const input of [{client_id:client,ext:"html"},{client_id:client,base:"from-client-"+base},{client_id:client,ext:"mp4",base,poster:true},{client_id:client,poster:true,ext:"jpg"},{client_id:client,ext:"mp4",path:"another-client/x"}])assert.throws(()=>parseStaffUpload(input));
});
test("staff media save cannot file a client submission or another client's file as a coach demo",()=>{
 const input={client_id:client,title:"Controlled movement",storage_path:client+"/"+base+".mp4",kind:"video",category:"mobility",note:"Cue",poster_path:client+"/"+base+"-poster.jpg",duration_seconds:60.4};
 assert.equal(parseStaffMediaSave(input).id,base);assert.equal(parseStaffMediaSave(input).duration_seconds,60);
 for(const patch of [{storage_path:client+"/from-client-"+base+".mp4"},{storage_path:base+"/"+base+".mp4"},{poster_path:base+"/"+base+"-poster.jpg"},{kind:"image"},{title:""},{note:"x".repeat(2001)},{duration_seconds:NaN}])assert.throws(()=>parseStaffMediaSave({...input,...patch}));
});
test("client appointment detail reaches its own role-aware page gate",()=>{assert.equal(isStaffPage('/sessions/'+base),false);assert.equal(isStaffPage('/clients/'+client),true);});
