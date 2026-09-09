export type PilotBottleneck={product:'cursos'|'synaptx'|'asl';skill:string|null;linguistic_concept:string|null;attempts:number;correct:number;accuracy:number|null;average_response_ms:number|null};
export type PilotLearner={participant_code:string|null;attempts:number;correct:number;average_response_ms:number|null;products_used:number;active_days:number};
export type PilotEventReport={since:string;learners:PilotLearner[];bottlenecks:PilotBottleneck[]};
export type InterventionReport={linguistic_concept:string|null;interventions:number;pre_accuracy:number|null;post_accuracy:number|null;pre_latency_ms:number|null;post_latency_ms:number|null};
export type AssessmentRow={participant_code:string|null;period:'baseline'|'midpoint'|'endline';assessed_at:string;metrics:Record<string,number|null>};
export type GenerationQualityReport={since:string;total:number;learner_visible:number;rejected:number;success_rate:number|null;p50_latency_ms:number|null;p95_latency_ms:number|null;by_modality:{modality:string;source_kind:string|null;register:string|null;total:number;learner_visible:number;rejected:number;p95_latency_ms:number|null}[]};
export type PilotRawEvent={participant_code:string|null;event_id:string;occurred_at:string;product:string;event_type:string;target_language:string;skill:string|null;linguistic_concept:string|null;intervention_type:string|null;intervention_id:string|null;related_event_id:string|null;correctness:boolean|null;response_ms:number|null;attempt_number:number|null;supports_used:string[];source_kind:string|null;register:string|null;difficulty:number|null;course_week:number|null;topic:string|null};

export function evidenceAction(item:PilotBottleneck){
  const surface=item.product==='asl'?'root-family decoding':item.product==='synaptx'?`${item.skill??'language'} analysis`:`${item.skill??'practice'}`;
  if(item.accuracy===null)return `Collect scored ${surface} evidence before changing instruction.`;
  if(item.attempts<5)return `Collect more ${surface} attempts; this signal is preliminary.`;
  if(item.accuracy<70)return `Review ${item.linguistic_concept??surface} explicitly, then assign a short delayed check.`;
  if(item.accuracy<90)return `Give another varied ${surface} example and check transfer later.`;
  return `Maintain ${surface} with spaced, varied examples.`;
}

export function pilotCsv(className:string,report:PilotEventReport,interventions:InterventionReport[],assessments:AssessmentRow[]){
  const cell=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
  const rows:unknown[][]=[['record_type','class','participant_code','period_or_concept','product','skill','attempts','correct','accuracy','average_response_ms','pre_accuracy','post_accuracy','pre_latency_ms','post_latency_ms','assessed_at']];
  report.learners.forEach(row=>rows.push(['learner',className,row.participant_code,'', '', '',row.attempts,row.correct,row.attempts?Math.round(100*row.correct/row.attempts):'',row.average_response_ms,'','','','','']));
  report.bottlenecks.forEach(row=>rows.push(['bottleneck',className,'',row.linguistic_concept,row.product,row.skill,row.attempts,row.correct,row.accuracy,row.average_response_ms,'','','','','']));
  interventions.forEach(row=>rows.push(['intervention',className,'',row.linguistic_concept,'','','','','','',row.pre_accuracy,row.post_accuracy,row.pre_latency_ms,row.post_latency_ms,'']));
  assessments.forEach(row=>rows.push(['assessment',className,row.participant_code,row.period,'','','',row.metrics?.correct??'',row.metrics?.accuracy??'',row.metrics?.median_response_ms??'','','','','',row.assessed_at]));
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}

export function pilotRawCsv(events:PilotRawEvent[]){
  const fields:(keyof PilotRawEvent)[]=['participant_code','event_id','occurred_at','product','event_type','target_language','skill','linguistic_concept','intervention_type','intervention_id','related_event_id','correctness','response_ms','attempt_number','supports_used','source_kind','register','difficulty','course_week','topic'];
  const cell=(value:unknown)=>'"'+String(Array.isArray(value)?value.join('|'):value??'').replaceAll('"','""')+'"';
  return '\uFEFF'+[fields.join(','),...events.map(event=>fields.map(field=>cell(event[field])).join(','))].join('\r\n');
}
