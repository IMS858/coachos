import Link from 'next/link';
import {redirect} from 'next/navigation';
import {AppShell} from '@/components/layout/app-shell';
import {requireGrowthOwner,GrowthAccessError} from '@/lib/growth/owner-access';
import {loadAcquisition} from '@/lib/growth/acquisition/server';
import {AcquisitionWorkspace} from '@/components/growth/acquisition/workspace';
export const dynamic='force-dynamic';
export default async function AcquisitionPage(){let access;try{access=await requireGrowthOwner();}catch(e){if(e instanceof GrowthAccessError&&e.status===401)redirect('/login?next=/growth/acquisition');if(e instanceof GrowthAccessError&&e.status===403)redirect('/dashboard');throw Error('Owner authorization unavailable.');}
 let data;try{data=await loadAcquisition(access.db);}catch{return <AppShell expectedRole="owner"><main className="mx-auto max-w-4xl space-y-4 py-6"><h1 className="text-3xl font-bold">Acquisition Intelligence</h1><p role="alert" className="rounded-2xl border border-status-moderate/40 bg-white p-5">The acquisition schema or snapshot evidence is unavailable. No empty traffic, zero revenue or successful connection was inferred.</p><Link className="inline-flex min-h-11 items-center text-sky" href="/growth">Return to Growth Center →</Link></main></AppShell>;}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date());return <AppShell expectedRole="owner"><AcquisitionWorkspace data={data} today={today}/></AppShell>;}
