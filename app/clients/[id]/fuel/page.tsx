import {FuelWorkspace} from "@/components/fuel/workspace";
export const dynamic="force-dynamic";
export default async function ClientFuel({params}:{params:Promise<{id:string}>}){const {id}=await params;return <FuelWorkspace clientId={id}/>;}
