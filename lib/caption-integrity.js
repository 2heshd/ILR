const letters = text => String(text).normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
// Narrow recognition spelling repair, not fuzzy alignment: retain every cue
// and timestamp, and accept the change only if the WHOLE source then matches.
export function reconcileCaptionSpellings(text, timings) {
  if (!Array.isArray(timings)) return timings;
  const repaired=timings.map(item=>letters(item.word)==='اید'
    ? {...item,word:item.word.replace('اید','عید')} : item);
  if(captionsCoverText(text,repaired))return repaired;
  const sourceWords=String(text).match(/[\p{L}\p{M}\p{N}\u200c]+/gu)??[];
  if(sourceWords.length!==repaired.length||sourceWords.length<5)return timings;
  const exact=sourceWords.filter((word,index)=>letters(word)===letters(repaired[index].word)).length/sourceWords.length;
  if(exact<0.8)return timings;
  const sourceAligned=repaired.map((item,index)=>({...item,word:sourceWords[index]}));
  return captionsCoverText(text,sourceAligned)?sourceAligned:timings;
}
export function captionsCoverText(text, timings) {
  if (!Array.isArray(timings) || !timings.length) return false;
  let previous = -1;
  for (const item of timings) {
    if (!item.word || !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end < item.start || item.start < previous) return false;
    previous = item.start;
  }
  return letters(text) === letters(timings.map(item=>item.word).join(''));
}
// Include every newly reached cue, even if several elapsed between frames.
export function nextCaption(timings, previousIndex, now) {
  let index=previousIndex;
  while(index+1<timings.length && timings[index+1].start<=now) index++;
  return {index,word:index>previousIndex ? timings.slice(previousIndex+1,index+1).map(item=>item.word).join(' ') : null};
}
