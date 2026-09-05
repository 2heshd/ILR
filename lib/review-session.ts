import type {LexicalItem} from './types.ts';

export function reviewWord(words:LexicalItem[],due:LexicalItem[],lockedNormalizedForm:string|null){
  if(lockedNormalizedForm){
    const locked=words.find(word=>word.normalizedForm===lockedNormalizedForm);
    if(locked)return locked;
  }
  return due[0];
}

export function nextReviewWord(due:LexicalItem[],currentId:string){
  return due.find(word=>word.id!==currentId);
}
