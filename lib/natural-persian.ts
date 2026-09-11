type Exemplar = { id:string; topic:string; register:string; modes:string[]; ilrMin:number; ilrMax:number; text:string };
type RetrievalRequest = {topic:string;words:string[];level:number;mode:"reading"|"listening";register:"formal"|"colloquial";priority?:"topic"|"selected"};

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

const unsafeReference=/(?:تام|بوستون|تاتوئبا|اسپرانتو|نیویورک|توکیو|ژاپن|انگلستان|ایتالیا|فرانسوی|چینی|گینس|ساشیمی|توسط|خوک)/u;

function selectedMatches(item:Exemplar,words:string[]){
  const text=normalize(item.text);
  return words.filter(word=>{
    const normalized=normalize(word).trim();
    if(normalized.length<2)return false;
    if(text.includes(normalized))return true;
    return [...tokens(normalized)].some(token=>token.length>=4&&text.includes(token));
  });
}

export function naturalPersianExamples(corpus:Exemplar[],request:RetrievalRequest,limit=3){
  const query=tokens(`${request.topic} ${request.words.join(" ")}`);
  const selectedPriority=request.priority==="selected";
  const ranked=corpus.filter(item=>item.modes.includes(request.mode)&&registerScore(item,request.register)>-10&&!unsafeReference.test(item.text)).map(item=>{
    const matches=selectedMatches(item,request.words);
    const levelScore=request.level>=item.ilrMin&&request.level<=item.ilrMax?8:-Math.min(6,Math.abs(request.level-item.ilrMin)*3);
    const score=overlapScore(query,`${item.topic} ${item.text}`)+(normalize(item.topic)===normalize(request.topic)?10:0)+levelScore+registerScore(item,request.register)+sourceScore(item)+(selectedPriority?matches.length*18:matches.length*3);
    return {item,score,matches};
  }).filter(row=>!selectedPriority||row.matches.length>0).sort((a,b)=>b.score-a.score||b.matches.length-a.matches.length||a.item.text.length-b.item.text.length||a.item.id.localeCompare(b.item.id));
  if(!selectedPriority)return ranked.slice(0,Math.max(0,Math.min(5,limit))).map(({item})=>item.text);

  // Greedily spread the references across different learner-selected words,
  // instead of returning three near-duplicates for one frequent word.
  const chosen:typeof ranked=[];const covered=new Set<string>();
  while(chosen.length<Math.max(0,Math.min(5,limit))){
    const next=ranked.filter(row=>!chosen.includes(row)).sort((a,b)=>{
      const freshA=a.matches.filter(word=>!covered.has(normalize(word))).length;
      const freshB=b.matches.filter(word=>!covered.has(normalize(word))).length;
      return freshB-freshA||b.score-a.score;
    })[0];
    if(!next)break;
    chosen.push(next);for(const word of next.matches)covered.add(normalize(word));
  }
  return chosen.map(({item})=>item.text);
}

export function naturalPersianPrompt(examples:string[]){
  if(!examples.length)return "";
  return ["NATURAL PERSIAN STYLE REFERENCES (internal examples, not facts to repeat):",...examples.map((example,index)=>`${index+1}. ${example}`),"Use these only as evidence for ordinary word order, collocations, reference tracking, and register. When a reference contains a learner-selected word, preserve its natural collocation or argument structure where it fits; do not copy its people, facts, numbers, or sentence sequence. The requested topic and vocabulary remain authoritative."].join("\n");
}
