import type {LexicalItem} from './types.ts';
// Higher scores are revealed earlier. Untested audio stays uncertain.
export function revealPriority(word:LexicalItem|undefined){
 if(!word)return 1100;
 const base={new:900,learning:600,known:300,automatic:0}[word.knowledgeState??'new'];
 const evidence=(mode:'audio'|'visual'|'cloze')=>{const item=word.modalityMastery?.[mode];if(!item?.reviews)return 1;return 1-item.correct/item.reviews+Math.min(1,(item.medianResponseMs??15000)/15000)*.2;};
 return base+60*evidence('audio')+25*evidence('visual')+15*evidence('cloze');
}
