export type SkillEvidence = { modality:string; attempts:number; correct:number; words:number; repeated_misses:number; early_attempts:number; early_correct:number; recent_attempts:number; recent_correct:number };
export type StudentReport = {user_id:string;display_name:string;reviews:number;text_retention:number|null;audio_retention:number|null;pattern_retention:number|null;last_review:string|null;active_days?:number;unique_words?:number;skills?:SkillEvidence[];daily?:{day:string;attempts:number;correct:number}[]};
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
