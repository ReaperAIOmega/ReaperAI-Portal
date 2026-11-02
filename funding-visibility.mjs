export function publishedFundingAssessments(rows){return (rows??[]).filter(r=>r.status==='published'&&r.published_at);}
export function fundingScoreLabel(row){return row.components?.score_supported===false?'Not supported':row.score;}
