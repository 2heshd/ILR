'use client';
import {useState} from 'react';
import StudentBreakdown from './StudentBreakdown';
import ReportChart from './ReportChart';
import {accuracy,mean,comprehensionSummary,type StudentReport} from '@/lib/student-report';
export default function ClassroomInsights({students}:{students:StudentReport[]}){
 const [selectedId,setSelectedId]=useState(students[0]?.user_id??'');
 const selected=students.find(s=>s.user_id===selectedId)??students[0],events=students.flatMap(s=>s.comprehension??[]);
 const reading=comprehensionSummary(events,'reading'),listening=comprehensionSummary(events,'listening');
 const days=[...new Set(students.flatMap(s=>(s.daily??[]).map(d=>d.day)))].sort();
 const series=(modality:'reading'|'listening')=>days.map(day=>mean(events.filter(e=>e.modality===modality&&e.grading_mode==='ai'&&e.attempted_at.slice(0,10)===day).map(e=>e.score)));
 const reviewCount=students.reduce((n,s)=>n+s.reviews,0),shared=students.filter(s=>s.comprehension_shared).length;
 const priorities=[...reading.dimensions.map(d=>({...d,modality:'Reading'})),...listening.dimensions.map(d=>({...d,modality:'Listening'}))].filter(d=>d.count>=3&&d.score!==null).sort((a,b)=>a.score!-b.score!).slice(0,3);
 return <div className="insights"><div className="insight-summary">
 <div><span>Learners</span><strong>{students.length}</strong><p>{shared} sharing comprehension</p></div>
 {[reading,listening].map((s,i)=><div key={i}><span>{i?'Listening comp.':'Reading comp.'}</span><strong>{s.score??'—'}<small> / 100</small></strong><div className="insight-meter"><i style={{width:(s.score??0)+'%'}}/></div><p>{s.ai.length} AI-graded attempts</p></div>)}
 <div><span>Vocabulary practice</span><strong>{reviewCount.toLocaleString('en-US')}</strong><p>Review attempts · three separate inputs</p></div></div>
 <div className="overview-charts"><section className="report-panel"><div className="report-panel-heading"><h2>Comprehension over time</h2><span>Last 7 days</span></div>{events.some(e=>e.grading_mode==='ai')?<ReportChart days={days} series={[{label:'Reading',values:series('reading')},{label:'Listening',values:series('listening'),dashed:true}]} label="Class daily reading and listening comprehension, AI-graded attempts only"/>:<p className="empty-evidence">No shared AI-graded comprehension attempts yet. Vocabulary practice is reported separately below.</p>}<p className="evidence-note">Daily averages, not a controlled progress measure. Passage difficulty and support can vary.</p></section>
 <section className="report-panel"><div className="report-panel-heading"><h2>Teaching priorities</h2><span>From shared evidence</span></div>{priorities.length?priorities.map((p,i)=><div key={p.modality+p.type} className="focus-row"><strong><span className="focus-index">0{i+1}</span>{p.modality} · {p.label}</strong><p>{p.score}% across {p.count} questions. {p.score!<80?'Review the missed question type in the next lesson.':'Consolidate with a fresh passage.'}</p></div>):<div className="empty-evidence">Collect at least three scored questions in a category to identify a teaching focus.</div>}</section></div>
 <div id="learner-reports" className="report-section-title"><div><h2>Individual learner reports</h2><p>Comprehension, vocabulary, and study conditions—not one blended score.</p></div><span className="insight-period">Last 7 days · UTC</span></div>
 <div className="insight-workbench"><aside className="insight-roster"><h2>Learners <small>{students.length}</small></h2><p>Text · Audio · Patterns</p><div className="roster-list">{students.map((s,i)=><button key={s.user_id} aria-pressed={selected?.user_id===s.user_id} onClick={()=>setSelectedId(s.user_id)}><span className="learner-number">{String(i+1).padStart(2,'0')}</span><span><strong>{s.display_name}</strong><small>{[s.text_retention,s.audio_retention,s.pattern_retention].map(v=>v===null?'—':v+'%').join(' · ')}</small></span><span className="roster-arrow" aria-hidden="true">↗</span></button>)}</div></aside>{selected?<StudentBreakdown key={selected.user_id} student={selected}/>:<p className="empty-evidence">No students have joined yet. Share your class code to invite them.</p>}</div></div>;
}
