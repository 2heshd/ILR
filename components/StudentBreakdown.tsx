'use client';
import {accuracy,evidenceAdvice,skillNames,skillTrend,type StudentReport} from '@/lib/student-report';
export default function StudentBreakdown({student,onClose}:{student:StudentReport;onClose:()=>void}){
  return <section className="student-breakdown" aria-label={`${student.display_name} student breakdown`}>
    <header><div><p>INDIVIDUAL PRACTICE · LAST 7 DAYS · UTC</p><h2>{student.display_name}</h2></div><button onClick={onClose}>Close details</button></header>
    <div className="student-metrics"><p><strong>{student.reviews}</strong>Review attempts</p><p><strong>{student.active_days??'—'} / 7</strong>Days practiced</p><p><strong>{student.unique_words??'—'}</strong>Distinct words practiced</p></div>
    {!student.skills&&<p>Detailed reporting is not available yet. Summary results remain above.</p>}
    <div className="student-skills">{student.skills?.map(skill=>{const score=accuracy(skill.correct,skill.attempts),trend=skillTrend(skill);return <article key={skill.modality}><h3>{skillNames[skill.modality]??skill.modality}</h3><p className="student-score">{score===null?'Not tested':`${score}%`}<small>{skill.correct} correct / {skill.attempts} attempts</small></p>{score!==null&&<progress aria-label={`${skillNames[skill.modality]} accuracy`} value={score} max={100}/>}
      <dl><div><dt>Distinct words</dt><dd>{skill.words}</dd></div><div><dt>Words missed at least twice</dt><dd>{skill.repeated_misses}</dd></div><div><dt>Recent change</dt><dd>{trend===null?'Insufficient evidence':`${trend>0?'+':''}${trend} percentage points`}</dd></div></dl><p>{evidenceAdvice(skill)}</p></article>;})}</div>
    {!!student.daily?.length&&<div><h3>Daily practice</h3><div className="student-daily">{student.daily.map(day=><div key={day.day}><span>{new Date(`${day.day}T12:00:00Z`).toLocaleDateString(undefined,{weekday:'short',timeZone:'UTC'})}</span><strong>{day.attempts}</strong><small>{day.correct} correct</small></div>)}</div></div>}
    <p className="muted">Recent change compares the last three UTC calendar days with the preceding four; both need at least five attempts. Accuracy includes learning attempts and self-rated answers—it is not a proficiency score or a measured long-term retention rate. Repeated words count once per skill.</p>
    <p className="muted">Private notes, responses, and the learner’s word list are not exposed. Reading and listening comprehension are not measured by these vocabulary scores.</p>
  </section>;
}
