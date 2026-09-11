import {writeFile} from "node:fs/promises";
import {persianCoherenceIssues} from "../lib/persian-coherence.ts";
import {practiceAnswerIssues} from "../lib/practice-answers.ts";

const base=(process.argv[2]||"https://getcursos.vercel.app").replace(/\/$/u,"");
const repetitions=Math.max(1,Math.min(5,Number(process.argv[3]||2)));
const practiceSource=process.argv[4]==="selected"?"selected":"topic";
const banks={
  1:{topic:"Daily life",words:["من","خانه","کار","دانشگاه","کلاس","استاد","دوست","امروز","فردا","ساعت","رفتن","آمدن","خوردن","خریدن","غذا","بازار","کتاب","داشتن","بودن","کردن"]},
  2:{topic:"Transportation and work",words:["شهر","اتوبوس","مسافر","ایستگاه","راه","کار","جلسه","گزارش","مدیر","تصمیم","زمان","حرکت کردن","رسیدن","فرستادن","تغییر کردن","مشکل","برنامه","امروز","هفته","مردم"]},
  3:{topic:"Government and economy",words:["دولت","اقتصاد","قیمت","هزینه","بازار","شهروند","تصمیم","طرح","گزارش","افزایش","کاهش","اعلام کردن","بررسی کردن","اجرا کردن","اثر گذاشتن","با این حال","به دلیل","وزارت","مسئولان","شرایط"]},
  4:{topic:"Diplomacy and policy",words:["مذاکرات","توافق","دولت","سیاست","همکاری","اختلاف","اجرا","تصمیم","مقام‌ها","کارشناسان","تأکید کردن","اعلام کردن","ادامه دادن","در حالی که","اگرچه","پیامد","ساختاری","بین‌المللی","منافع","راهبرد"]},
};
const cases=[];
for(let repetition=1;repetition<=repetitions;repetition++)for(const level of [1,2,3,4])for(const kind of ["reading","listening"])for(const register of ["formal","colloquial"]){
  const bank=banks[level]; cases.push({repetition,kind,register,targetIlr:level,practiceSource,topic:bank.topic,targetWords:bank.words,wordDefinitions:[]});
}
async function run(body){
  const started=performance.now();
  try{
    const response=await fetch(`${base}/api/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(100000)});
    const data=await response.json().catch(()=>({error:"non-JSON response"}));
    const checks=[];
    if(!response.ok)checks.push(`HTTP ${response.status}: ${data.error||"generation failed"}`);
    else{
      checks.push(...persianCoherenceIssues(data.textFa),...practiceAnswerIssues(data.questions));
      const sentences=String(data.textFa||"").split(/[.!؟]+/u).filter(part=>part.trim());
      if(sentences.length<4||sentences.length>5)checks.push(`Expected 4-5 sentences; received ${sentences.length}`);
      if(body.register==="formal"&&/\b(?:یه|توی|رو|اینا|اونا)\b/u.test(data.textFa))checks.push("Colloquial marker in formal passage");
      if(body.register==="colloquial"&&!/(?:یه|توی|رو|اومد|می‌(?:رم|ریم|گم|کنم|کنیم)|ـ?ه\b)/u.test(data.textFa))checks.push("No clear spoken-register evidence");
      if(body.practiceSource==="selected"&&(!Array.isArray(data.knownWordsUsed)||data.knownWordsUsed.length<3))checks.push("Fewer than three selected words were used");
    }
    return {case:{repetition:body.repetition,kind:body.kind,register:body.register,level:body.targetIlr,topic:body.topic},http:response.status,seconds:Number(((performance.now()-started)/1000).toFixed(3)),serverTiming:response.headers.get("server-timing"),checks,data};
  }catch(error){return {case:{repetition:body.repetition,kind:body.kind,register:body.register,level:body.targetIlr,topic:body.topic},http:0,seconds:Number(((performance.now()-started)/1000).toFixed(3)),checks:[error.message],data:{}};}
}
const results=[];
for(let offset=0;offset<cases.length;offset+=8)results.push(...await Promise.all(cases.slice(offset,offset+8).map(run)));
const times=results.map(row=>row.seconds).sort((a,b)=>a-b);
const summary={generated:results.length,passed:results.filter(row=>!row.checks.length).length,failed:results.filter(row=>row.checks.length).length,p50:times[Math.floor(times.length*.5)],p95:times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)],failures:results.filter(row=>row.checks.length).map(row=>({case:row.case,seconds:row.seconds,checks:row.checks,textFa:row.data?.textFa}))};
const report={createdAt:new Date().toISOString(),base,repetitions,practiceSource,summary,results};
await writeFile("/tmp/cursos-natural-generation-audit.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(summary,null,2));
process.exitCode=summary.failed?1:0;
