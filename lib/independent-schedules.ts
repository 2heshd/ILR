import {createSerializedCard,reviewFsrs} from './fsrs.ts';
import type {LexicalItem,ReviewEvent,ReviewModality} from './types.ts';
export function independentSchedules(word:LexicalItem,reviews:ReviewEvent[],alreadyMigrated=false){
  const cards={...word.modalityCards};
  for(const mode of ['visual','audio','cloze','production'] as ReviewModality[]){
    if(alreadyMigrated&&cards[mode])continue;
    let card=createSerializedCard(new Date(word.introducedAt||Date.now()));
    // Old snapshots shared every channel's schedule. Rebuild from the actual
    // channel-specific evidence instead of promoting an untested skill.
    const history=reviews.filter(event=>event.lexicalItemId===word.id&&event.modality===mode).sort((a,b)=>Date.parse(a.reviewedAt)-Date.parse(b.reviewedAt));
    for(const event of history)card=reviewFsrs(card,event.rating,new Date(event.reviewedAt)).after;
    cards[mode]=card;
  }
  return cards;
}
