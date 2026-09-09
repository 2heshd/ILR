// Synthetic preview-only audio checks; no account cookies or API keys read.
import {readFile,mkdtemp,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {captionsCoverText} from '../lib/caption-integrity.js';
const [deployment,report]=process.argv.slice(2);
if(!/^https:\/\/getcursos-[a-z0-9]+-2heshds-projects\.vercel\.app$/.test(deployment??''))throw new Error('Exact preview URL required');
const audit=JSON.parse(await readFile(report,'utf8'));
const item=audit.results.find(r=>r.http===200&&r.body.kind==='listening');
if(!item)throw new Error('No returned listening transcript to test');
const directory=await mkdtemp(join(tmpdir(),'cursos-audio-audit-'));
for(const route of ['speech','speech-timings']){
  const path=join(directory,route==='speech'?'audio.mp3':'aligned.bin');
  const result=await new Promise(resolve=>{
    const args=['--yes','vercel','curl',`/api/${route}`,'--deployment',deployment,'--','--silent','--show-error','--max-time','30','--output',path,'--write-out','%{http_code} %{time_total}','--header','Content-Type: application/json','--request','POST','--data',JSON.stringify({text:item.data.textFa})];
    const child=spawn('npx',args);let stdout='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',()=>{});
    child.on('error',e=>resolve({error:e.message}));
    child.on('close',code=>{const match=stdout.match(/(\d{3}) ([\d.]+)/);resolve({code,http:Number(match?.[1]||0),seconds:Number(match?.[2]||0)});});
  });
  const bytes=(await stat(path).catch(()=>({size:0}))).size;
  const checks=[];
  if(result.http===200){
    try {
      const payload=await readFile(path);
      let audio=payload;
      if(route==='speech-timings'){
        const size=payload.readUInt32BE(0);
        if(size+4>=payload.length)throw new Error('Invalid metadata length');
        const metadata=JSON.parse(payload.subarray(4,size+4).toString('utf8'));
        if(!captionsCoverText(item.data.textFa,metadata.words))checks.push('Captions do not cover the complete transcript');
        audio=payload.subarray(size+4);
      }
      if(audio.length<500||!(audio.subarray(0,3).toString()==='ID3'||(audio[0]===255&&(audio[1]&224)===224)))checks.push('Missing MP3 frame/header');
    }catch(error){checks.push(error.message);}
  }
  console.log(JSON.stringify({route,...result,bytes,checks,path,generationSeconds:item.seconds,totalSeconds:item.seconds+(result.seconds||0)}));
  if(result.http!==200||bytes<500||checks.length||item.seconds+result.seconds>20)process.exitCode=1;
}
