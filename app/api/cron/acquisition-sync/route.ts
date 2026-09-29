import {createHash,timingSafeEqual} from 'node:crypto';
import {NextResponse,type NextRequest} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import {acquisitionProviderReady} from '@/lib/growth/acquisition/provider';
import {refreshAcquisition} from '@/lib/growth/acquisition/server';
import {reportWindow,type Connector} from '@/lib/growth/acquisition/model';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){const secret=process.env.CRON_SECRET,actual=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply({error:'Unauthorized.'},401);
 if(process.env.VERCEL_ENV!=='production'||!acquisitionProviderReady())return reply({skipped:'Production-only read sync is not configured.'});
 const db=createServiceClient(),settings=await db.from('growth_acquisition_sources').select('connector,sync_owner_id').eq('daily_sync',true);if(settings.error)return reply({error:'Source options unavailable.'},503);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date()),range=reportWindow(today);
 const results=await Promise.all((settings.data??[]).map(async source=>{const hex=createHash('sha256').update('ims-acquisition:'+source.connector+':'+today).digest('hex'),id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;try{const run=await refreshAcquisition(db,source.sync_owner_id,id,source.connector as Connector,range.start,range.end,'scheduled_refresh');return {connector:source.connector,status:run.status};}catch{return {connector:source.connector,status:'unconfirmed'};}}));
 return reply({results,external_writes:false});
}
