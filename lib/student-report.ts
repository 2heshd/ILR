export type SkillEvidence = { modality:string; attempts:number; correct:number; words:number; repeated_misses:number; early_attempts:number; early_correct:number; recent_attempts:number; recent_correct:number };
export type ComprehensionEvidence = {
  id:string;modality:'reading'|'listening';attempted_at:string;score:number|null;
  grading_mode:'ai'|'self'|'unknown';listens:number|null;transcript:boolean|null;
  practice_mode?:'full'|'inference'|'gist'|'rapid'|'unknown';
  rereads:number|null;duration_ms:number|null;
  questions:{type:'detail'|'inference'|'discourse'|'main_idea';score:number}[];
};
export type StudentReport = {user_id:string;display_name:string;reviews:number;text_retention:number|null;audio_retention:number|null;pattern_retention:number|null;last_review:string|null;active_days?:number;unique_words?:number;skills?:SkillEvidence[];daily?:{day:string;attempts:number;correct:number}[];comprehension_shared?:boolean;comprehension?:ComprehensionEvidence[]};
export const dimensionNames={main_idea:'Main idea',detail:'Events & details',inference:'Inference',discourse:'Relationships & discourse'};
export function mean(values:(number|null|undefined)[]){const valid=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));return valid.length?Math.round(valid.reduce((s,v)=>s+v,0)/valid.length):null;}
export function comprehensionSummary(events:ComprehensionEvidence[],modality:'reading'|'listening'){
 const all=events.filter(e=>e.modality===modality),ai=all.filter(e=>e.grading_mode==='ai'),self=all.filter(e=>e.grading_mode==='self');
 const firstListen=ai.filter(e=>e.practice_mode==='full'&&e.listens===1&&e.transcript===false);
 const assisted=ai.filter(e=>e.practice_mode==='full'&&((e.listens!==null&&e.listens>1)||e.transcript===true));
 return {all,ai,self,score:mean(ai.map(e=>e.score)),selfScore:mean(self.map(e=>e.score)),firstListenScore:mean(firstListen.map(e=>e.score)),firstListenCount:firstListen.length,assistedScore:mean(assisted.map(e=>e.score)),assistedCount:assisted.length,
  dimensions:Object.entries(dimensionNames).map(([type,label])=>{const questions=ai.flatMap(e=>e.questions).filter(q=>q.type===type);return {type,label,count:questions.length,score:mean(questions.map(q=>q.score))};})};
}
export const skillNames:Record<string,string>={visual:'Text recall',audio:'Audio recognition',cloze:'Word patterns',production:'Production'};
export function accuracy(correct:number,attempts:number){return attempts>0?Math.round(100*correct/attempts):null;}
export function evidenceAdvice(skill:SkillEvidence){
  if(skill.attempts===0)return 'Not practiced yet. Start with a small set of familiar words in this skill.';
  if(skill.attempts<10)return 'Limited evidence. Collect more attempts before drawing a conclusion.';
  if(skill.correct/skill.attempts<0.9)return `Revisit missed items in ${skillNames[skill.modality]?.toLowerCase()??'this skill'} before increasing new vocabulary. Success in another skill does not replace this practice.`;
  return 'Maintain scheduled reviews. Expand gradually while checking delayed recall.';
}
export function skillTrend(skill:SkillEvidence){
  if(skill.early_attempts<5||skill.recent_attempts<5)return null;
  return Math.round(100*(skill.recent_correct/skill.recent_attempts-skill.early_correct/skill.early_attempts));
}
