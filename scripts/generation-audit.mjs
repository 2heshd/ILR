// Repeatable synthetic audit. Never reads account cookies or API secrets.
// Usage: node scripts/generation-audit.mjs [preview-url] [limit] [offset] [report-path] [background-attempts]
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {unselectedContentWords} from '../lib/practice-vocabulary.ts';
import {courseSectionLabel} from '../lib/course.ts';
import {checkSupportingVocabulary} from '../lib/practice-support.ts';
import {practiceAnswerIssues} from '../lib/practice-answers.ts';
import {PRACTICE_TOPICS} from '../lib/course-topics.ts';
import {topicPracticeWords} from '../lib/practice-sources.ts';

const course=JSON.parse(await readFile(new URL('../data/course-vocabulary.json',import.meta.url),'utf8')).entries;
const news=JSON.parse(await readFile(new URL('../data/news-vocabulary.json',import.meta.url),'utf8')).entries;
const rows=[...course.map(e=>({word:e.fa,meaning:e.en,group:courseSectionLabel(e.lesson)})),...news.map(e=>({word:e.displayForm,meaning:e.definition,group:`News: ${e.topic||'General'}`}))];
const groups=new Map();
for(const row of rows){const group=groups.get(row.group)||[];group.push(row);groups.set(row.group,group);}
const cases=[];
// Exercise every learner-facing topic with the same mixed, attested bank the UI
// supplies. Static checks below still cover every catalog row; asking the model
// to force an isolated chapter's arbitrary words into one passage is not a valid
// quality test and was producing contrived prose by construction.
for(const [index,topic] of PRACTICE_TOPICS.entries()){
  const bank=topicPracticeWords(topic,course,news);
  cases.push({name:`topic / ${topic}`,body:{kind:index%2?'listening':'reading',practiceSource:'topic',topic,targetIlr:1+index%4,register:index%3===0?'colloquial':'formal',targetWords:bank.map(e=>e.word),wordDefinitions:bank}});
}
// Selected-word mode is a distinct contract. Cover small, medium, and maximum
// focused plans across modalities, levels, and registers using coherent sourced
// banks rather than generated combinations.
const selectedSizes=[12,30,80];
const selectedTopics=['Daily life','Food & shopping','Education','Health','Work & economy','Government & society','Nature & weather','Travel & transport'];
for(const [topicIndex,topic] of selectedTopics.entries()){
  const source=topicPracticeWords(topic,course,news);
  for(const [sizeIndex,size] of selectedSizes.entries()){
    const bank=source.slice(0,size);
    const index=cases.length;
    cases.push({name:`selected / ${topic} / ${size}`,body:{kind:index%2?'listening':'reading',practiceSource:'selected',topic,targetIlr:1+(topicIndex+sizeIndex)%4,register:(topicIndex+sizeIndex)%2?'colloquial':'formal',targetWords:bank.map(e=>e.word),wordDefinitions:bank}});
  }
}
const staticAudit={entries:rows.length,groups:groups.size,topics:PRACTICE_TOPICS.length,cases:cases.length,empty:rows.filter(r=>!r.word?.trim()||!r.meaning?.trim()).length,rejectedIdentity:rows.filter(r=>unselectedContentWords(r.word,[r.word]).length).map(r=>r.word)};
console.log(JSON.stringify({staticAudit}));
const deployment=process.argv[2];
if(!deployment)process.exit(0);
if(!/^https:\/\/getcursos-[a-z0-9]+-2heshds-projects\.vercel\.app$/.test(deployment))throw new Error('Use the exact approved preview URL, never production.');
const limit=Number(process.argv[3]||cases.length),offset=Number(process.argv[4]||0);
const selected=cases.slice(offset,offset+limit),results=[];
const output=process.argv[5]||'/tmp/cursos-generation-audit.json';
const backgroundAttempts=Math.max(1,Math.min(3,Number(process.argv[6]||1)));
let next=0;
let checkpoint=Promise.resolve();
function saveCheckpoint(){
  const snapshot=JSON.stringify({deployment,staticAudit,complete:false,results},null,2);
  checkpoint=checkpoint.then(()=>writeFile(output,snapshot));
  return checkpoint;
}
async function run(item){
  return new Promise(resolve=>{
    const args=['--yes','vercel','curl','/api/generate','--deployment',deployment,'--','--silent','--show-error','--max-time','100','--write-out','\nAUDIT %{http_code} %{time_total}\nSTAGES %header{server-timing}\n','--header','Content-Type: application/json','--request','POST','--data',JSON.stringify(item.body)];
    const child=spawn('npx',args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    child.on('error',error=>resolve({...item,error:error.message}));
    child.on('close',code=>{
      const match=stdout.match(/\nAUDIT (\d+) ([\d.]+)/);let data;
      try{data=JSON.parse(stdout.slice(0,match?.index));}catch{data={error:'Non-JSON or missing response'};}
      resolve({...item,http:Number(match?.[1]||0),seconds:Number(match?.[2]||0),stages:stdout.match(/STAGES (.*)/)?.[1],exitCode:code,data,transportError:code?stderr.slice(-500):undefined});
    });
  });
}
async function worker(){
  while(next<selected.length){
    const item=selected[next++],attemptHistory=[];
    let result;
    for(let attempt=1;attempt<=backgroundAttempts;attempt++){
      result=await run(item);
      result.checks=result.http===200 ? practiceAnswerIssues(result.data?.questions) : ['Request did not return an exercise'];
      if(result.http===200){
        result.checks.push(...checkSupportingVocabulary(String(result.data?.textFa??''),item.body.targetWords,result.data?.newWordsIntroduced).issues);
        if(!/[\u0600-\u06ff]/u.test(result.data?.textFa??''))result.checks.push('Missing Persian text');
      }
      attemptHistory.push({attempt,http:result.http,seconds:result.seconds,checks:result.checks,error:result.data?.error,issues:result.data?.qualityIssues});
      if(result.http===200&&!result.checks.length)break;
    }
    result.attemptHistory=attemptHistory;
    results.push(result);
    await saveCheckpoint();
    console.log(JSON.stringify({case:item.name,http:result.http,seconds:result.seconds,stages:result.stages,checks:result.checks,error:result.data?.error,issues:result.data?.qualityIssues,words:result.data?.suggestedWords}));
  }
}
await Promise.all(Array.from({length:3},worker));
const success=results.filter(r=>r.http===200&&!r.checks.length),times=success.map(r=>r.seconds).sort((a,b)=>a-b);
const summary={tested:results.length,returned:success.length,within20:success.filter(r=>r.seconds<=20).length,backgroundAttempts,median:times[Math.floor(times.length/2)]??null,p95:times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)]??null};
await writeFile(output,JSON.stringify({deployment,staticAudit,complete:true,summary,results},null,2));
console.log(JSON.stringify({summary,report:output}));
// A completed command is not a passing audit. Fail the release gate for any
// unsuccessful exercise or request beyond the user's timing target.
process.exitCode = summary.returned === selected.length && summary.within20 === selected.length ? 0 : 1;
