// Bounded, synthetic production smoke. It never reads account state or API keys.
// Usage: node scripts/production-generation-smoke.mjs <expected-release-sha> <preview-report> [preview-report]
import {readFile} from 'node:fs/promises';
import {captionsCoverText} from '../lib/caption-integrity.js';
import {checkSupportingVocabulary} from '../lib/practice-support.ts';
import {practiceAnswerIssues} from '../lib/practice-answers.ts';

const production='https://getcursos.vercel.app';
const [expectedRelease,...reportPaths]=process.argv.slice(2);
if(!/^[a-f0-9]{40}$/u.test(expectedRelease??''))throw new Error('Expected 40-character release SHA required');
if(!reportPaths.length)throw new Error('At least one completed preview audit report is required');

const health=await fetch(`${production}/api/health`,{signal:AbortSignal.timeout(10000)}).then(response=>response.json());
if(health?.ok!==true||health?.release!==expectedRelease)throw new Error(`Production release mismatch: ${health?.release??'missing'}`);

const reports=await Promise.all(reportPaths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
if(reports.some(report=>report.complete!==true))throw new Error('Production smoke requires completed preview audit reports');
const previewResults=reports.flatMap(report=>report.results??[]);
const cases=['reading','listening'].map(kind=>{
  const item=previewResults.find(result=>result.body?.kind===kind&&result.http===200&&!result.checks?.length);
  if(!item)throw new Error(`No passing preview ${kind} case found`);
  return item;
});

async function timedRequest(route,body){
  const started=performance.now();
  const response=await fetch(`${production}${route}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),
  });
  return {response,seconds:(performance.now()-started)/1000};
}

const generated=[];
for(const item of cases){
  const {response,seconds}=await timedRequest('/api/generate',item.body);
  const data=await response.json().catch(()=>({error:'Non-JSON response'}));
  const checks=response.ok?practiceAnswerIssues(data.questions):[`HTTP ${response.status}: ${data.error??'generation failed'}`];
  if(response.ok&&item.body.practiceSource==='selected')checks.push(...checkSupportingVocabulary(String(data.textFa??''),item.body.targetWords,data.newWordsIntroduced).issues);
  if(response.ok&&!/[\u0600-\u06ff]/u.test(data.textFa??''))checks.push('Missing Persian text');
  if(seconds>20)checks.push(`Generation exceeded 20 seconds (${seconds.toFixed(2)}s)`);
  const result={kind:item.body.kind,source:item.body.practiceSource,topic:item.body.topic,http:response.status,seconds,checks,data};
  generated.push(result);
  console.log(JSON.stringify({...result,data:undefined}));
}

const listening=generated.find(result=>result.kind==='listening');
for(const route of ['/api/speech','/api/speech-timings']){
  const {response,seconds}=await timedRequest(route,{text:listening.data.textFa});
  const payload=Buffer.from(await response.arrayBuffer());
  const checks=[];
  let audio=payload;
  if(route.endsWith('timings')&&response.ok){
    try{
      const metadataSize=payload.readUInt32BE(0);
      if(metadataSize+4>=payload.length)throw new Error('Invalid timing metadata length');
      const metadata=JSON.parse(payload.subarray(4,metadataSize+4).toString('utf8'));
      if(!captionsCoverText(listening.data.textFa,metadata.words))checks.push('Captions do not cover the complete transcript');
      audio=payload.subarray(metadataSize+4);
    }catch(error){checks.push(error.message);}
  }
  if(!response.ok)checks.push(`HTTP ${response.status}`);
  if(audio.length<500||!(audio.subarray(0,3).toString()==='ID3'||(audio[0]===255&&(audio[1]&224)===224)))checks.push('Missing MP3 frame/header');
  if(listening.seconds+seconds>20)checks.push(`Listening plus audio exceeded 20 seconds (${(listening.seconds+seconds).toFixed(2)}s)`);
  generated.push({kind:route.slice(5),http:response.status,seconds,totalSeconds:listening.seconds+seconds,checks});
  console.log(JSON.stringify(generated.at(-1)));
}

const failures=generated.flatMap(result=>result.checks.map(check=>({kind:result.kind,check})));
console.log(JSON.stringify({release:health.release,checks:generated.length,failures}));
process.exitCode=failures.length?1:0;
