const DAYS=180;
const MODALITIES=[['visual',1.02],['audio',.97],['cloze',1]];
const TARGET=.85;
function random(seed){return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);}
function clamp(low,high,value){return Math.max(low,Math.min(high,value));}
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0;}
function simulate(name,ability,seed){
 const rand=random(seed),cards=[],daily=[],loads=[];
 let rolling=.85,totalWords=0;
 for(let day=0;day<DAYS;day++){
  const newLimit=rolling>=.9?40:rolling>=.8?35:30;
  for(let word=0;word<newLimit;word++)for(const [mode,modifier] of MODALITIES)cards.push({mode,modifier,due:day+1,last:day,strength:6.2});
  totalWords+=newLimit;
  let correct=0,tested=0;
  const target=rolling<.8?.88:rolling>.9?.82:TARGET;
  for(const card of cards){
   if(card.due>day)continue;
   const elapsed=Math.max(1,day-card.last);
   const probability=clamp(.45,.98,Math.exp(-elapsed/card.strength)*ability*card.modifier);
   const success=rand()<probability;
   tested++;if(success)correct++;
   card.last=day;
   if(success){card.strength=Math.min(365,card.strength*1.65);card.due=day+Math.max(1,Math.round(-card.strength*Math.log(target)));}
   else {card.strength=Math.max(1.5,card.strength*.62);card.due=day+1;}
  }
  const retention=tested?correct/tested:TARGET;
  daily.push(retention);loads.push(tested+newLimit*3);
  const window=daily.slice(-7);rolling=window.reduce((sum,value)=>sum+value,0)/window.length;
 }
 const scored=daily.slice(14);
 return {name,days:DAYS,words:totalWords,retention:Number((scored.reduce((a,b)=>a+b,0)/scored.length).toFixed(3)),last30:Number((daily.slice(-30).reduce((a,b)=>a+b,0)/30).toFixed(3)),p95DailyEvents:percentile(loads,.95),maxDailyEvents:Math.max(...loads)};
}
const results=[simulate('supported',.96,11),simulate('typical',1,29),simulate('strong',1.04,47)];
console.log(JSON.stringify({target:'0.80–0.90 cold recall',assumptions:'Seeded heterogeneous forgetting model; 30–40 words/day; three independent modalities; all scheduled reviews completed.',results},null,2));
if(results.some(result=>result.last30<.8||result.last30>.9))process.exitCode=1;
