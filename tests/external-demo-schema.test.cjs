// Additive schema rehearsal only; never connects to a hosted database.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('external demo URL rollout preserves GUIDs and starts unknown rather than inventing playable URLs',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try {
  await db.exec("create table exercises(id text primary key,video_guid text,client_visible boolean);insert into exercises values('synthetic','original-guid',false)");
  const migration=fs.readFileSync('packages/db/migrations/0082_exercise_external_demo_url.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const row=(await db.query('select id,video_guid,client_visible,video_url from exercises')).rows[0];
  assert.deepEqual(row,{id:'synthetic',video_guid:'original-guid',client_visible:false,video_url:null});
  assert.equal((await db.query("select is_nullable,column_default from information_schema.columns where table_name='exercises' and column_name='video_url'")).rows[0].is_nullable,'YES');
  assert.doesNotMatch(migration,/update\s+(?:public\.)?exercises/i);
 } finally {await db.close();}
});
