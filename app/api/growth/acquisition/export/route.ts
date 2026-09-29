import {NextResponse,type NextRequest} from 'next/server';
import {requireGrowthOwner,GrowthAccessError} from '@/lib/growth/owner-access';
import {CONNECTORS} from '@/lib/growth/acquisition/model';
import {loadAcquisition} from '@/lib/growth/acquisition/server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{const {db}=await requireGrowthOwner(),source=request.nextUrl.searchParams.get('source');if(!CONNECTORS.some(c=>c===source))return NextResponse.json({error:'Invalid source.'},{status:400});const data=await loadAcquisition(db),snapshot=data.snapshots.find(s=>s.connector===source);if(!snapshot)return NextResponse.json({error:'No saved source snapshot.'},{status:404});return new Response(JSON.stringify(snapshot,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="ims-acquisition-${source}.json"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return NextResponse.json({error:'Private evidence export unavailable.'},{status:e instanceof GrowthAccessError?e.status:503,headers:{'Cache-Control':'private, no-store'}});}}
