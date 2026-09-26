export type CutoverSourceRecord = {
  id: string;
  record_type: string;
  source_hash: string;
  reconciliation_status: string;
  dry_run_status?: string | null;
};

export type CutoverReview = {
  record_id: string;
  record_type: string;
  source_hash: string;
  revision: number;
  decision: "hold" | "reviewed" | "excluded";
};

export type CutoverRecordState =
  | "unreviewed"
  | "held"
  | "excluded"
  | "stale_review"
  | "reviewed_needs_preflight"
  | "reviewed_preflight_ready";

export function latestReviewsByRecord(reviews: CutoverReview[]): Map<string,CutoverReview> {
  const latest=new Map<string,CutoverReview>();
  for(const review of reviews){
    const current=latest.get(review.record_id);
    if(!current || review.revision>current.revision) latest.set(review.record_id,review);
  }
  return latest;
}

export function cutoverRecordState(record: CutoverSourceRecord, review?: CutoverReview): CutoverRecordState {
  if(!review) return "unreviewed";
  if(review.record_type!==record.record_type || review.source_hash!==record.source_hash) return "stale_review";
  if(review.decision==="hold") return "held";
  if(review.decision==="excluded") return "excluded";
  if(record.reconciliation_status==="imported") return "stale_review";
  if(record.record_type==="appointment" && record.dry_run_status!=="ready") return "reviewed_needs_preflight";
  return "reviewed_preflight_ready";
}

export function cutoverReadiness(records: CutoverSourceRecord[], reviews: CutoverReview[]) {
  const latest=latestReviewsByRecord(reviews);
  const states=records.map(record=>cutoverRecordState(record,latest.get(record.id)));
  const count=(state:CutoverRecordState)=>states.filter(value=>value===state).length;
  return {
    total: records.length,
    unreviewed: count("unreviewed"),
    held: count("held"),
    excluded: count("excluded"),
    stale: count("stale_review"),
    needsPreflight: count("reviewed_needs_preflight"),
    preflightReady: count("reviewed_preflight_ready"),
    complete: records.length>0 && states.every(state=>state==="excluded" || state==="reviewed_preflight_ready"),
  };
}
