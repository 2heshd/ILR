'use client';
import {useMemo,useState} from 'react';
import type {StudyState} from '@/lib/types';
import type {CourseVocabularyEntry} from '@/lib/course';
import {planCatalogTree} from '@/lib/plan-catalog';
import {activePlan,type PlanMode,type StudyPlan} from '@/lib/study-plans';
export const planLabels:Record<PlanMode,string>={visual:'Text recall',audio:'Audio recall',cloze:'Patterns',reading:'Reading',listening:'Listening'};
export default function StudyPlanPicker({state,mode,catalog,onModeChange,onChange,onCourseChange}:{state:StudyState;mode:PlanMode;catalog:CourseVocabularyEntry[];onModeChange:(mode:PlanMode)=>void;onChange:(plan:StudyPlan)=>void;onCourseChange:(entries:CourseVocabularyEntry[],add:boolean,plan:StudyPlan)=>void}){
  const [query,setQuery]=useState('');
  const [source,setSource]=useState<'course'|'bank'>('course');
  const [page,setPage]=useState(0);
  const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());
  const plan=state.studyPlans?.[mode]??{wordIds:[],period:'day' as const,startsOn:today.toISOString().slice(0,10),enabled:false};
  const ids=new Set(plan.wordIds);
  const tree=useMemo(()=>planCatalogTree(catalog),[catalog]);
  const matches=state.words.filter(word=>`${word.displayForm} ${word.definition??''} ${word.courseLesson??''}`.toLowerCase().includes(query.toLowerCase()));
  function selectMany(words:typeof state.words,add=true){const next=new Set(ids);for(const word of words)add?next.add(word.id):next.delete(word.id);onChange({...plan,enabled:true,wordIds:[...next]});}
  function actions(label:string,entries:CourseVocabularyEntry[]){return <span className="plan-group-actions"><small>{entries.length} entries</small><button aria-label={`Add ${label} to ${planLabels[mode]} plan`} onClick={()=>onCourseChange(entries,true,plan)}>Add to plan</button><button aria-label={`Remove ${label} from ${planLabels[mode]} plan`} onClick={()=>onCourseChange(entries,false,plan)}>Unselect</button></span>;}
  const search=query.trim().toLowerCase();
  return <section id="vocabulary-plans" className="study-plan card span-12">
    <div className="row spread"><div><h2>Study plans</h2><p className="muted">Choose a skill, then add units, chapters, lessons, or individual words.</p></div><span>{ids.size} words selected{plan.enabled&&!activePlan(plan)?' · outside plan dates':''}</span></div>
    <div className="plan-mode-tabs" role="group" aria-label="Plan skill">{(Object.keys(planLabels) as PlanMode[]).map(item=><button key={item} aria-pressed={mode===item} onClick={()=>onModeChange(item)}>{planLabels[item]}</button>)}</div>
    <div className="row"><label>Period <select value={plan.period} onChange={e=>onChange({...plan,enabled:true,period:e.target.value as 'day'|'week'})}><option value="day">One day</option><option value="week">Seven days</option></select></label><label>Starts <input type="date" value={plan.startsOn} onChange={e=>onChange({...plan,enabled:true,startsOn:e.target.value})}/></label><button onClick={()=>onChange({...plan,wordIds:[],enabled:true})}>Clear plan</button>{!['reading','listening'].includes(mode)&&<button onClick={()=>onChange({...plan,enabled:false})}>Use all due words</button>}</div>
    <p className="muted">{plan.enabled?'Only the selected words are used during these dates.':'No plan is active for this skill.'} Each skill has its own plan and review schedule.</p>
    <div className="row"><button aria-pressed={source==='course'} onClick={()=>{setSource('course');setQuery('');}}>Full course</button><button aria-pressed={source==='bank'} onClick={()=>{setSource('bank');setQuery('');setPage(0);}}>My vocabulary</button><input aria-label="Search plan vocabulary" placeholder={source==='course'?'Find a unit, chapter, lesson, or word':'Search your words or definitions'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
    {source==='course'?<div className="plan-course-tree"><p className="muted">All {catalog.length.toLocaleString()} course entries. Adding a section also saves missing words to your bank; unselecting only changes this plan.</p>{!catalog.length&&<p>Loading course sections…</p>}{tree.map(unit=>{
      const chapters=unit.chapters.map(chapter=>({...chapter,lessons:chapter.lessons.filter(lesson=>`${lesson.label} ${lesson.entries.map(e=>`${e.fa} ${e.en}`).join(' ')}`.toLowerCase().includes(search))})).filter(chapter=>chapter.lessons.length);
      if(!chapters.length)return null;
      return <details key={`${unit.label}:${search}`} open={search?true:undefined}><summary>{unit.label}</summary>{actions(unit.label,unit.entries)}{chapters.map(chapter=><details className="plan-chapter" key={`${chapter.label}:${search}`} open={search?true:undefined}><summary>{chapter.label}</summary>{actions(`${unit.label} ${chapter.label}`,chapter.entries)}{chapter.lessons.map(lesson=><div className="plan-lesson" key={lesson.label}><span>{lesson.label.split(' - ').at(-1)}</span>{actions(lesson.label,lesson.entries)}</div>)}</details>)}</details>;
    })}{catalog.length>0&&!tree.some(unit=>unit.entries.some(e=>`${e.lesson} ${e.fa} ${e.en}`.toLowerCase().includes(search)))&&<p>No sections match this search.</p>}</div>:<><div className="row"><button onClick={()=>selectMany(matches)}>Select matches ({matches.length})</button><button onClick={()=>selectMany(matches,false)}>Unselect matches</button></div><div className="plan-word-list">{matches.slice(page*100,(page+1)*100).map(word=><label key={word.id}><input type="checkbox" checked={ids.has(word.id)} onChange={e=>selectMany([word],e.target.checked)}/><span lang="fa" dir="rtl">{word.displayForm}</span><small>{word.definition}</small></label>)}</div><div className="row"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>{matches.length?`${page*100+1}–${Math.min((page+1)*100,matches.length)} of ${matches.length}`:'No matching words'}</span><button disabled={(page+1)*100>=matches.length} onClick={()=>setPage(page+1)}>Next</button></div></>}
  </section>;
}
