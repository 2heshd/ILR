const letters = text => String(text).normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
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
