import type { LexicalItem, StudyState, ReviewModality } from './types.ts';
import {dailyNewWordIds,nextDayVerificationIds,reviewPriority} from './daily-adaptive.ts';
export type PlanMode = 'visual'|'audio'|'cloze'|'reading'|'listening';
export type StudyPlan = { wordIds:string[]; enabled:boolean; startedAt?:string; period?:'day'|'week'; startsOn?:string };
export function activePlan(plan:StudyPlan|undefined,_now=new Date()){
  return Boolean(plan?.enabled);
}
export function plannedWords(state:StudyState,mode:PlanMode,now=new Date()):LexicalItem[]{
  const plan=state.studyPlans?.[mode];
  if(!activePlan(plan,now))return [];
  const ids=new Set(plan?.wordIds);
  return state.words.filter(word=>ids.has(word.id));
}
export function dueWords(state:StudyState,mode:ReviewModality,now=new Date()){
  const plan=state.studyPlans?.[mode as PlanMode];
  const candidates=plan?.enabled?plannedWords(state,mode as PlanMode,now):state.words;
  const due=candidates.filter(word=>new Date(word.modalityCards?.[mode]?.due??word.introducedAt).getTime()<=now.getTime());
  const old=due.filter(word=>(word.modalityCards?.[mode]?.reps??0)>0).sort((a,b)=>reviewPriority(b,mode,now)-reviewPriority(a,mode,now));
  const oldIds=new Set(old.map(word=>word.id));
  const verificationIds=new Set(nextDayVerificationIds(state,mode,now));
  const verification=candidates.filter(word=>verificationIds.has(word.id)&&!oldIds.has(word.id));
  const started=candidates.filter(word=>!oldIds.has(word.id)&&!verificationIds.has(word.id)&&!(word.modalityCards?.[mode]?.reps)&&Object.values(word.modalityCards??{}).some(card=>(card?.reps??0)>0));
  const admitted=new Set(dailyNewWordIds(state,candidates,now));
  const admittedNew=mode==='visual'?due.filter(word=>!(word.modalityCards?.[mode]?.reps)&&!started.includes(word)&&admitted.has(word.id)):[];
  return [...old,...verification,...started,...admittedNew];
}
