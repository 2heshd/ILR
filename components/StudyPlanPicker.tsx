'use client';
import {useState} from 'react';
import type {StudyState} from '@/lib/types';
import {activePlan,type PlanMode,type StudyPlan} from '@/lib/study-plans';
const labels:Record<PlanMode,string>={visual:'Text recall',audio:'Audio recall',cloze:'Patterns',reading:'Reading',listening:'Listening'};
export default function StudyPlanPicker({state,mode,onChange}:{state:StudyState;mode:PlanMode;onChange:(plan:StudyPlan)=>void}){
  const [query,setQuery]=useState('');
  const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());
  const plan=state.studyPlans?.[mode]??{wordIds:[],period:'day' as const,startsOn:today.toISOString().slice(0,10),enabled:false};
  const ids=new Set(plan.wordIds);
  const matches=state.words.filter(word=>`${word.displayForm} ${word.definition??''} ${word.courseLesson??''}`.toLowerCase().includes(query.toLowerCase()));
  const groups=[...new Set(state.words.map(word=>word.courseLesson||`Week ${word.sourceWeek}`))];
  function selectMany(words:typeof state.words,add=true){const next=new Set(ids);for(const word of words)add?next.add(word.id):next.delete(word.id);onChange({...plan,enabled:true,wordIds:[...next]});}
  return <details className="study-plan card span-12"><summary>{labels[mode]} plan · {ids.size} selected {plan.enabled&&!activePlan(plan)?'· expired':''}</summary>
    <p className="muted">Choose this session’s vocabulary independently of your saved bank. Plans do not change another skill’s schedule.</p>
    <div className="row"><label>Period <select value={plan.period} onChange={e=>onChange({...plan,enabled:true,period:e.target.value as 'day'|'week'})}><option value="day">One day</option><option value="week">Seven days</option></select></label><label>Starts <input type="date" value={plan.startsOn} onChange={e=>onChange({...plan,enabled:true,startsOn:e.target.value})}/></label><button onClick={()=>onChange({...plan,wordIds:[],enabled:true})}>Clear plan</button>{!['reading','listening'].includes(mode)&&<button onClick={()=>onChange({...plan,enabled:false})}>Use all due words</button>}</div>
    <div className="row"><input aria-label="Search plan vocabulary" placeholder="Search word, definition, or chapter" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>selectMany(matches)}>Select matches ({matches.length})</button><button onClick={()=>selectMany(matches,false)}>Unselect matches</button></div>
    <label>Add a chapter <select value="" onChange={e=>{selectMany(state.words.filter(word=>(word.courseLesson||`Week ${word.sourceWeek}`)===e.target.value));}}><option value="">Choose a chapter or week…</option>{groups.map(group=><option key={group}>{group}</option>)}</select></label>
    <div className="plan-word-list">{matches.map(word=><label key={word.id}><input type="checkbox" checked={ids.has(word.id)} onChange={e=>selectMany([word],e.target.checked)}/><span lang="fa" dir="rtl">{word.displayForm}</span><small>{word.definition}</small></label>)}</div>
    {!state.words.length&&<p>Add words in Vocabulary first.</p>}
  </details>;
}
