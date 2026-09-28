import {validDate} from "./model";

export type BodPodExtraction={
 template:"ims_body_comp_v1"|null; recognized:boolean; blankTemplate:boolean;
 name:string; date:string; weightLb:number|null; bodyFatPct:number|null; fatMassLb:number|null;
 leanPct:number|null; leanMassLb:number|null; energySummary:string; warnings:string[];
 fields:Record<string,string>;
};
const CORE={bodyFatPct:"Text10",leanPct:"Text11",weightLb:"Text12",leanMassLb:"Text13",fatMassLb:"Text14",energySummary:"Text15"} as const;
function decodeLiteral(value:string){
 let out="";for(let i=0;i<value.length;i++){const c=value[i];if(c!=="\\"){out+=c;continue;}const n=value[++i];if(n===undefined)break;
  if(/[0-7]/.test(n)){let oct=n;for(let j=0;j<2&&/[0-7]/.test(value[i+1]??"");j++)oct+=value[++i];out+=String.fromCharCode(parseInt(oct,8));continue;}
  out+=({n:"\n",r:"\r",t:"\t",b:"\b",f:"\f","(":"(",")":")","\\":"\\"} as Record<string,string>)[n]??n;
 }return out.trim();
}
function escapeRe(value:string){return value.replace(/[.*+?^$\{\}()|[\]\\]/g,"\\$&");}
export function pdfFieldValue(text:string,name:string):string{
 const match=new RegExp("/T\\s*\\("+escapeRe(name)+"\\)").exec(text);if(!match)return "";
 const objectStart=Math.max(text.lastIndexOf("\nobj",match.index),text.lastIndexOf(" obj",match.index),0);
 const objectEnd=text.indexOf("endobj",match.index);const chunk=text.slice(objectStart,objectEnd<0?match.index+2500:objectEnd);
 const literal=/\/V\s*\(((?:\\.|[^\\)])*)\)/s.exec(chunk);if(literal)return decodeLiteral(literal[1]);
 const nameValue=/\/V\s*\/([^\s<>{}\[\]()]+)/.exec(chunk);return nameValue?.[1]==="Off"?"":(nameValue?.[1]??"");
}
function num(value:string,max:number){const clean=value.replace(/,/g,"").match(/-?(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];if(!clean)return null;const n=Number(clean);return Number.isFinite(n)&&n>=0&&n<=max?n:null;}
function normalizedDate(value:string){const v=value.trim();if(validDate(v))return v;const m=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/.exec(v);if(!m)return "";const year=m[3].length===2?Number(m[3])+2000:Number(m[3]);const iso=year+"-"+m[1].padStart(2,"0")+"-"+m[2].padStart(2,"0");return validDate(iso)?iso:"";}
export function parseImsBodPodPdf(bytes:Uint8Array):BodPodExtraction{
 const text=new TextDecoder("latin1").decode(bytes),fields:Record<string,string>={};
 for(const name of ["Name","Date",...Object.values(CORE)])fields[name]=pdfFieldValue(text,name);
 const recognized=Object.values(CORE).slice(0,5).every(name=>text.includes("/T ("+name+")"))&&text.includes("/T (Name)")&&text.includes("/T (Date)");
 const weightLb=num(fields.Text12,999),bodyFatPct=num(fields.Text10,100),fatMassLb=num(fields.Text14,999),leanPct=num(fields.Text11,100),leanMassLb=num(fields.Text13,999),warnings:string[]=[];
 if(weightLb!==null&&bodyFatPct!==null&&fatMassLb!==null&&Math.abs(weightLb*bodyFatPct/100-fatMassLb)>1.5)warnings.push("Reported fat pounds differ from weight × body-fat percentage by more than rounding. Preserve the report values and review the source.");
 if(weightLb!==null&&leanMassLb!==null&&fatMassLb!==null&&Math.abs(weightLb-leanMassLb-fatMassLb)>1.5)warnings.push("Reported weight differs from fat pounds + lean pounds by more than rounding. Preserve the report values and review the source.");
 if(weightLb!==null&&leanPct!==null&&leanMassLb!==null&&Math.abs(weightLb*leanPct/100-leanMassLb)>1.5)warnings.push("Reported lean pounds differ from weight × lean percentage by more than rounding. Preserve the report values and review the source.");
 const date=normalizedDate(fields.Date);if(fields.Date&&!date)warnings.push("The test date could not be normalized. Confirm the actual date before saving.");
 const blankTemplate=recognized&&[weightLb,bodyFatPct,fatMassLb,leanPct,leanMassLb].every(v=>v===null);
 return {template:recognized?"ims_body_comp_v1":null,recognized,blankTemplate,name:fields.Name,date,weightLb,bodyFatPct,fatMassLb,leanPct,leanMassLb,energySummary:fields.Text15,warnings,fields};
}
