import Link from 'next/link';
/** Navigation only: a click no longer fabricates a contact timestamp or changes a sales stage. */
export function LeadTouchButton({leadId,contacted}:{leadId:string;contacted:boolean}){return <Link href={`/leads/${leadId}`} className="inline-flex min-h-11 items-center rounded-xl border border-divider bg-white px-3 text-xs font-semibold text-sky">{contacted?'Review follow-up':'Open inquiry / log contact'} →</Link>;}
