export type PayrollRule={compensation_type:"hourly"|"per_session"|"salary"|"custom";rate_cents:number|null;late_cancel_rate_cents:number|null;no_show_rate_cents:number|null;effective_from:string;active:boolean};
export type PayrollEvidence={status:string;duration_minutes:number|null;scheduled_at:string};
export type PayrollCalculation={eligible:boolean;amount_cents:number|null;reason:string};
export function calculatePayrollEvidence(session:PayrollEvidence,rule:PayrollRule|null):PayrollCalculation{
 if(!rule||!rule.active)return {eligible:false,amount_cents:null,reason:"Compensation rule not configured"};
 const sessionDate=session.scheduled_at.slice(0,10);if(sessionDate<rule.effective_from)return {eligible:false,amount_cents:null,reason:"Session predates compensation rule"};
 if(session.status==="late_cancelled")return rule.late_cancel_rate_cents==null?{eligible:false,amount_cents:null,reason:"Late-cancel compensation not configured"}:{eligible:true,amount_cents:rule.late_cancel_rate_cents,reason:"Configured late-cancel rate"};
 if(session.status==="no_show")return rule.no_show_rate_cents==null?{eligible:false,amount_cents:null,reason:"No-show compensation not configured"}:{eligible:true,amount_cents:rule.no_show_rate_cents,reason:"Configured no-show rate"};
 if(session.status!=="completed")return {eligible:false,amount_cents:null,reason:"Session is not completed"};
 if(rule.compensation_type==="per_session")return rule.rate_cents==null?{eligible:false,amount_cents:null,reason:"Per-session rate missing"}:{eligible:true,amount_cents:rule.rate_cents,reason:"Configured per-session rate"};
 if(rule.compensation_type==="hourly"){if(rule.rate_cents==null)return {eligible:false,amount_cents:null,reason:"Hourly rate missing"};const minutes=Math.max(0,session.duration_minutes??0);return {eligible:true,amount_cents:Math.round(rule.rate_cents*minutes/60),reason:`Configured hourly rate × ${minutes} minutes`};}
 return {eligible:false,amount_cents:null,reason:rule.compensation_type==="salary"?"Salary is tracked outside session-level calculation":"Custom compensation requires owner review"};
}
