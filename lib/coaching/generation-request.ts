import {z} from "zod";
const uuid=z.string().uuid();
export const generationRequestSchema=z.object({
 assessment_id:uuid,pdf_mode:z.enum(["client","coach"]).optional(),
 response_format:z.literal("json").optional(),request_id:uuid.optional(),client_id:uuid.optional(),
 expected_assessment_updated_at:z.string().datetime({offset:true}).optional(),
 sessions_per_week:z.number().int().min(1).max(5).optional(),goal:z.string().trim().min(3).max(1000).optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.response_format==="json"&&(!value.request_id||!value.client_id||!value.expected_assessment_updated_at||!value.sessions_per_week||!value.goal))ctx.addIssue({code:"custom",message:"Client-first generation requires a source snapshot, request ID and explicit frequency."});
 if(value.response_format!=="json"&&(value.request_id||value.client_id||value.expected_assessment_updated_at||value.sessions_per_week||value.goal))ctx.addIssue({code:"custom",message:"Workflow fields require a structured receipt."});
});
export type GenerationRequest=z.infer<typeof generationRequestSchema>;
export function generationIdentity(body:GenerationRequest){return body.response_format==="json"?{request_id:body.request_id,client_id:body.client_id,assessment_id:body.assessment_id,assessment_updated_at:body.expected_assessment_updated_at,sessions_per_week:body.sessions_per_week,goal:body.goal,pdf_mode:body.pdf_mode??"client"}:null;}
export function sameGenerationIdentity(stored:unknown,expected:ReturnType<typeof generationIdentity>):boolean{
 if(!stored||typeof stored!=="object"||!expected)return false;const row=stored as Record<string,unknown>;
 return Object.entries(expected).every(([key,value])=>row[key]===value);
}
