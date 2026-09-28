import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
export async function DELETE(request:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
 return NextResponse.json({error:"Open Standing bookings and review the current series before cancelling. A request ID and expected revision are required."},{status:409});
}
