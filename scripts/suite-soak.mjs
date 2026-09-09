// Bounded production health soak. Usage:
// node scripts/suite-soak.mjs <cursos-url> <synaptx-url> <asl-url> [cycles] [pause-ms]
const [cursos,synaptx,asl]=process.argv.slice(2,5);
if(![cursos,synaptx,asl].every(value=>/^https:\/\//u.test(value??'')))throw new Error('Provide exact HTTPS URLs for Cursos, SynaptX, and Aṣl.');
const cycles=Math.max(1,Math.min(240,Number(process.argv[5]||20)));
const pauseMs=Math.max(0,Math.min(60000,Number(process.argv[6]||1000)));
const targets=[['cursos',`${cursos.replace(/\/$/u,'')}/api/health`],['synaptx',`${synaptx.replace(/\/$/u,'')}/api/health`],['asl',`${asl.replace(/\/$/u,'')}/api/health`]];
const observations=[];
for(let cycle=1;cycle<=cycles;cycle++){
  for(const [product,url] of targets){
    const started=performance.now();let status=0,body,error;
    try{const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});status=response.status;body=await response.json();if(!response.ok||body?.ok!==true||!String(body?.release??'').trim())throw new Error(`Invalid health response (${status})`);}
    catch(reason){error=reason instanceof Error?reason.message:String(reason);}
    observations.push({cycle,product,status,ms:Math.round(performance.now()-started),release:body?.release??null,schemaVersion:body?.schemaVersion??null,error:error??null});
  }
  if(cycle<cycles&&pauseMs)await new Promise(resolve=>setTimeout(resolve,pauseMs));
}
const failures=observations.filter(item=>item.error);
const products=Object.fromEntries(targets.map(([product])=>{const rows=observations.filter(item=>item.product===product),times=rows.map(item=>item.ms).sort((a,b)=>a-b);return [product,{checks:rows.length,failures:rows.filter(item=>item.error).length,p50:times[Math.floor(times.length*.5)],p95:times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)],releases:[...new Set(rows.map(item=>item.release).filter(Boolean))]}];}));
console.log(JSON.stringify({cycles,pauseMs,products,failures},null,2));
process.exitCode=failures.length?1:0;
