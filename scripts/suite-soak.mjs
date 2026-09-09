// Bounded production health soak. Usage:
// node scripts/suite-soak.mjs <cursos-url> <synaptx-url> <asl-url> [cycles] [pause-ms]
const [cursos,synaptx,asl]=process.argv.slice(2,5);
if(![cursos,synaptx,asl].every(value=>/^https:\/\//u.test(value??'')))throw new Error('Provide exact HTTPS URLs for Cursos, SynaptX, and Aṣl.');
const cycles=Math.max(1,Math.min(240,Number(process.argv[5]||20)));
const pauseMs=Math.max(0,Math.min(60000,Number(process.argv[6]||1000)));
const bases={cursos:cursos.replace(/\/$/u,''),synaptx:synaptx.replace(/\/$/u,''),asl:asl.replace(/\/$/u,'')};
const targets=[
  {product:'cursos',route:'/api/health',kind:'health'},{product:'cursos',route:'/',kind:'page'},{product:'cursos',route:'/classroom',kind:'page'},
  {product:'synaptx',route:'/api/health',kind:'health'},{product:'synaptx',route:'/app-shell.html?page=home.html',kind:'page'},{product:'synaptx',route:'/app-shell.html?page=morphology.html',kind:'page'},{product:'synaptx',route:'/app-shell.html?page=syntax.html',kind:'page'},{product:'synaptx',route:'/app-shell.html?page=verbs.html',kind:'page'},
  {product:'asl',route:'/api/health',kind:'health'},{product:'asl',route:'/',kind:'page'},{product:'asl',route:'/verbs',kind:'page'},{product:'asl',route:'/derivations',kind:'page'},
];
const observations=[];
for(let cycle=1;cycle<=cycles;cycle++){
  for(const {product,route,kind} of targets){
    const url=`${bases[product]}${route}`;
    const started=performance.now();let status=0,body,error;
    try{
      const response=await fetch(url,{headers:{accept:kind==='health'?'application/json':'text/html'},signal:AbortSignal.timeout(10000)});status=response.status;
      if(kind==='health'){body=await response.json();if(!response.ok||body?.ok!==true||!String(body?.release??'').trim())throw new Error(`Invalid health response (${status})`);}
      else {const html=await response.text();if(!response.ok||!html.trim()||!/<(?:!doctype|html|body|main|div)\b/iu.test(html))throw new Error(`Invalid page response (${status})`);}
    }
    catch(reason){error=reason instanceof Error?reason.message:String(reason);}
    observations.push({cycle,product,route,kind,status,ms:Math.round(performance.now()-started),release:body?.release??null,schemaVersion:body?.schemaVersion??null,error:error??null});
  }
  if(cycle<cycles&&pauseMs)await new Promise(resolve=>setTimeout(resolve,pauseMs));
}
const failures=observations.filter(item=>item.error);
const products=Object.fromEntries(Object.keys(bases).map(product=>{const rows=observations.filter(item=>item.product===product),times=rows.map(item=>item.ms).sort((a,b)=>a-b);return [product,{checks:rows.length,failures:rows.filter(item=>item.error).length,p50:times[Math.floor(times.length*.5)],p95:times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)],releases:[...new Set(rows.map(item=>item.release).filter(Boolean))],routes:[...new Set(rows.map(item=>item.route))]}];}));
console.log(JSON.stringify({cycles,pauseMs,products,failures},null,2));
process.exitCode=failures.length?1:0;
