import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {AppShell} from '@/components/layout/app-shell';
import {readCompleteEvidence} from '@/lib/migration/complete-read';
import {StandingBookings,type StandingSeries} from '@/components/schedule/standing-bookings';
import {pacificDate} from '@/lib/time/pacific';
export const dynamic='force-dynamic';
export default async function StandingBookingPage({searchParams}:{searchParams:Promise<{series?:string}>}){
 const query=await searchParams,db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
 const me=await db.from('profiles').select('role,deleted_at').eq('id',user.id).maybeSingle();if(me.error)throw Error('Standing-booking authorization unavailable.');if(!me.data||me.data.deleted_at||!['owner','trainer'].includes(me.data.role))redirect('/dashboard');
 const asOf=new Date().toISOString(),today=pacificDate(new Date(asOf));
 const rows=await readCompleteEvidence<Omit<StandingSeries,'clientName'|'trainerName'|'futureCount'>>((from,to)=>db.from('recurring_series').select('id,client_id,trainer_id,start_date,end_date,interval_weeks,duration_minutes,slots,status,revision,generated_until,replaces_series_id,location,notes',{count:'exact'}).order('id').range(from,to));
 const ids=[...new Set(rows.flatMap(r=>[r.client_id,r.trainer_id]))],seriesIds=rows.map(r=>r.id);
 const names=ids.length?await db.from('profiles').select('id,full_name').in('id',ids):{data:[],error:null};if(names.error)throw Error('Standing-booking names unavailable.');
 const future=seriesIds.length?await readCompleteEvidence<{id:string;recurring_series_id:string}>((from,to)=>db.from('sessions').select('id,recurring_series_id',{count:'exact'}).in('recurring_series_id',seriesIds).gt('scheduled_at',asOf).in('status',['scheduled','confirmed']).order('id').range(from,to)):[];
 const byName=new Map((names.data??[]).map(p=>[p.id,p.full_name]));const series=rows.map(r=>({...r,notes:r.notes??'',location:r.location??'',clientName:byName.get(r.client_id)??'Client unavailable',trainerName:byName.get(r.trainer_id)??'Trainer unavailable',futureCount:future.filter(s=>s.recurring_series_id===r.id).length}));
 return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-16"><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-sky" href="/schedule">← Calendar</Link><header><h1 className="text-3xl font-semibold">Standing bookings</h1><p className="mt-3 text-sm leading-6 text-cream-dim">Review real recurring rules, change future slots, or stop future generation. Individual-session controls stay on each session. History, charges and package balances are not rewritten.</p></header><Link className="inline-flex min-h-12 items-center rounded-xl bg-sky px-5 text-sm font-semibold text-white" href={`/sessions/new?repeat=weekly&date=${today}&trainer_id=${user.id}&from=schedule`}>Create recurring booking →</Link><p className="rounded-xl border border-divider bg-white p-4 text-sm">Captured Vagaro appointments are already on the calendar. An observed repeat pattern is not a verified recurring rule; do not recreate a series on top of those bookings. Collision checks reject overlapping sessions.</p><StandingBookings series={series} today={today} asOf={asOf} selectedId={query.series}/></main></AppShell>;
}
