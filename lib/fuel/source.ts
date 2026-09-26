// Bounded below the deployment request-body limit. Larger PDFs need a future direct-upload flow.
export const MAX_FUEL_PDF_BYTES=3*1024*1024;
export async function readFuelPdf(request:Request):Promise<Uint8Array>{
 if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/pdf")throw Error("Upload a PDF original.");
 const declared=request.headers.get("content-length");if(declared&&(!/^\d+$/.test(declared)||Number(declared)>MAX_FUEL_PDF_BYTES))throw Error("PDF must be no larger than 3 MB.");
 if(!request.body)throw Error("PDF body is missing.");const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FUEL_PDF_BYTES){await reader.cancel();throw Error("PDF must be no larger than 3 MB.");}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 if(size<8||new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-")throw Error("The upload is not a PDF original.");return bytes;
}
export function validSourceReceipt(value:unknown,id:string,clientId:string,sha256:string,bytes:number):boolean{if(!value||typeof value!=="object")return false;const r=value as Record<string,unknown>;return r.ok===true&&r.id===id&&r.client_id===clientId&&r.sha256===sha256&&r.byte_size===bytes&&typeof r.deduped==="boolean";}
