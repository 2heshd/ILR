import type { LexicalItem, StudyState, ReviewModality } from './types.ts';
export type PlanMode = 'visual'|'audio'|'cloze'|'reading'|'listening';
export type StudyPlan = { wordIds:string[]; period:'day'|'week'; startsOn:string; enabled:boolean };
export function activePlan(plan:StudyPlan|undefined,now=new Date()){
  if(!plan?.enabled)return false;
  const start=new Date(`${plan.startsOn}T00:00:00`),end=new Date(start);
  end.setDate(end.getDate()+(plan.period==='week'?7:1));
  return now>=start&&now<end;
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
  const reviewedToday=new Set(state.reviews.filter(event=>event.modality===mode&&new Date(event.reviewedAt).toDateString()===now.toDateString()&&event.schedulerBefore?.state===0).map(event=>event.lexicalItemId));
  const newAllowance=Math.max(0,(state.dailyNewLimit??40)-reviewedToday.size);
  const due=candidates.filter(word=>new Date(word.modalityCards?.[mode]?.due??word.introducedAt).getTime()<=now.getTime());
  const old=due.filter(word=>(word.modalityCards?.[mode]?.reps??0)>0).sort((a,b)=>Date.parse(a.modalityCards![mode]!.due)-Date.parse(b.modalityCards![mode]!.due));
  return [...old,...due.filter(word=>!(word.modalityCards?.[mode]?.reps)).slice(0,newAllowance)];
}
