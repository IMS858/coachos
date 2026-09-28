import {notFound} from 'next/navigation';
import {AppShell} from '@/components/layout/app-shell';
import {fuelAccess} from '@/lib/fuel/load';
import {fuelDate} from '@/lib/fuel/model';
import {reportReaderConfigured} from '@/lib/fuel/report-provider';
import {NutritionBuilder} from '@/components/fuel/nutrition-builder';
export const dynamic='force-dynamic';
export default async function CreateNutritionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,access=await fuelAccess(id);if(!access.staff)notFound();
 const [version,release,sources]=await Promise.all([access.db.from('fuel_plan_versions').select('id,revision').eq('client_id',id).order('revision',{ascending:false}).limit(1).maybeSingle(),access.db.from('fuel_plan_releases').select('version_id').eq('client_id',id).order('sequence',{ascending:false}).limit(1).maybeSingle(),access.db.from('fuel_source_documents').select('id,original_name,sha256,byte_size,content_type').eq('client_id',id).order('created_at',{ascending:false}).limit(30)]);
 if(version.error||release.error||sources.error)throw Error('Nutrition source/version storage unavailable. No empty state was inferred.');
 return <AppShell><NutritionBuilder key={id} clientId={id} name={access.person.full_name} today={fuelDate()} revision={version.data?.revision??0} hasPrivateDraft={Boolean(version.data&&version.data.id!==release.data?.version_id)} originals={sources.data??[]} readerReady={reportReaderConfigured()} foodsReady={Boolean(process.env.USDA_FDC_API_KEY)}/></AppShell>;
}
