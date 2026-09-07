import type { LexicalItem, StudyState, ReviewModality } from './types.ts';
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
  const old=due.filter(word=>(word.modalityCards?.[mode]?.reps??0)>0).sort((a,b)=>Date.parse(a.modalityCards![mode]!.due)-Date.parse(b.modalityCards![mode]!.due));
  return [...old,...due.filter(word=>!(word.modalityCards?.[mode]?.reps))];
}
