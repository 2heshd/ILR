type Exemplar = { id:string; topic:string; register:string; modes:string[]; ilrMin:number; ilrMax:number; text:string };

const normalize=(value:string)=>value.normalize("NFKC").replace(/[يى]/gu,"ی").replace(/ك/gu,"ک").toLowerCase();
const tokens=(value:string)=>new Set(normalize(value).match(/[\p{L}\p{N}]+/gu)??[]);

function overlapScore(query:Set<string>,value:string){let score=0;for(const token of tokens(value))if(query.has(token))score+=token.length>3?3:1;return score;}

function registerScore(item:Exemplar,requested:"formal"|"colloquial"){
  if(item.register===requested)return 7;
  // Neutral corpus examples are useful evidence for both outputs, but an
  // explicitly matched register remains preferable.
  if(item.register==="neutral")return 2;
  return -20;
}

function sourceScore(item:Exemplar){
  // The hand-reviewed seed set wins close calls. The larger open corpus adds
  // breadth when it has materially better topic or vocabulary overlap.
  return item.id.startsWith("tatoeba-")?0:4;
}

export function naturalPersianExamples(corpus:Exemplar[],request:{topic:string;words:string[];level:number;mode:"reading"|"listening";register:"formal"|"colloquial"},limit=3){
  const query=tokens(`${request.topic} ${request.words.join(" ")}`);
  return corpus.filter(item=>item.modes.includes(request.mode)&&registerScore(item,request.register)>-10).map(item=>({item,score:overlapScore(query,`${item.topic} ${item.text}`)+(normalize(item.topic)===normalize(request.topic)?10:0)+(request.level>=item.ilrMin&&request.level<=item.ilrMax?8:-Math.min(6,Math.abs(request.level-item.ilrMin)*3))+registerScore(item,request.register)+sourceScore(item)})).sort((a,b)=>b.score-a.score||a.item.text.length-b.item.text.length||a.item.id.localeCompare(b.item.id)).slice(0,Math.max(0,Math.min(5,limit))).map(({item})=>item.text);
}

export function naturalPersianPrompt(examples:string[]){
  if(!examples.length)return "";
  return ["NATURAL PERSIAN STYLE REFERENCES (internal examples, not facts to repeat):",...examples.map((example,index)=>`${index+1}. ${example}`),"Use these only as evidence for ordinary word order, collocations, reference tracking, and register. Do not copy their people, facts, numbers, or sentence sequence. The requested topic and vocabulary remain authoritative."].join("\n");
}
