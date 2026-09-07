'use client';
import type {StudyState} from '@/lib/types';
import type {PlanMode,StudyPlan} from '@/lib/study-plans';
export const planLabels:Record<PlanMode,string>={visual:'Text recall',audio:'Audio recall',cloze:'Patterns',reading:'Reading',listening:'Listening'};
export default function StudyPlanPicker({state,mode,onModeChange,onChange}:{state:StudyState;mode:PlanMode;onModeChange:(mode:PlanMode)=>void;onChange:(plan:StudyPlan)=>void}){
  const plan=state.studyPlans?.[mode]??{wordIds:[],enabled:false};
  const ids=new Set(plan.wordIds);
  return <section id="vocabulary-plans" className="study-plan card span-12">
    <div className="row spread"><div><h2>Vocabulary session</h2><p className="muted">Choose the words you are working on now. The session stays active until you replace or end it.</p></div><span>{plan.enabled?`${ids.size} active words`:'All saved words'}</span></div>
    <div className="plan-mode-tabs" role="group" aria-label="Session skill">{(Object.keys(planLabels) as PlanMode[]).map((item,index)=><button key={item} aria-pressed={mode===item} onClick={()=>onModeChange(item)}><small>{index+1}</small>{planLabels[item]}</button>)}</div>
    <div className="session-actions row"><button onClick={()=>onChange({...plan,wordIds:[],enabled:false})}>End this session</button>{plan.enabled&&<button onClick={()=>onChange({...plan,wordIds:[],enabled:true,startedAt:new Date().toISOString()})}>Clear active words</button>}</div>
    <p className="muted">Text, audio, and patterns keep separate review histories. Use Course Vocabulary or the News Vocabulary add-on below to add or remove words.</p>
  </section>;
}
