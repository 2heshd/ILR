import type { LexicalItem, StudyState } from "./types";

function compactWord(word: LexicalItem): LexicalItem {
  const compact = { ...word };
  if (compact.sourceType === "course" && compact.reviews === 0 && !Object.values(compact.modalityCards ?? {}).some(card => card && (card.reps > 0 || card.state !== 0))) {
    const { fsrsCard: _unusedSchedule, modalityCards: _unusedChannels, ...unreviewed } = compact;
    return unreviewed as LexicalItem;
  }
  return compact;
}

/** Keep large course selections within normal browser-storage limits. */
export function compactStudyState(state: StudyState): StudyState {
  const questionTypes=(questions:{type:'detail'|'inference'|'discourse'|'main_idea'}[]|undefined,focused:boolean)=>{if(!questions)return undefined;const filtered=focused?questions.filter(q=>q.type!=='detail'):questions;return (filtered.length?filtered:questions).map(q=>q.type);};
  return {
    ...state,
    words: state.words.map(compactWord),
    // Keep exact assessment categories even when bundled source text is omitted.
    // Do not age out attempt/review history during a multi-week pilot.
    passageAttempts:(state.passageAttempts??[]).map(a=>({...a,questionTypes:a.questionTypes??questionTypes(state.passages.find(p=>p.id===a.passageId)?.questions,a.readingMode==='inference')})),
    listeningAttempts:(state.listeningAttempts??[]).map(a=>({...a,questionTypes:a.questionTypes??questionTypes(state.listeningItems.find(p=>p.id===a.listeningItemId)?.questions,a.listeningMode==='gist')})),
    // These three libraries are bundled with the app and restored by hydrateState.
    passages: state.passages.filter(item=>!item.id.startsWith('cycle-')),
    listeningItems: state.listeningItems.filter(item=>!item.id.startsWith('cycle-')),
    speakingPrompts: state.speakingPrompts.filter(item=>!item.id.startsWith('cycle-')),
  };
}

export function readStudyState(storage: Pick<Storage, "getItem" | "removeItem">, key: string, legacyKeys: string[]) {
  let raw = storage.getItem(key);
  if (!raw) {
    for (const legacyKey of legacyKeys) {
      raw = storage.getItem(legacyKey);
      if (raw) break;
    }
  }
  if (!raw) return { state: null, recovered: false };
  try {
    return { state: JSON.parse(raw) as Partial<StudyState>, recovered: false };
  } catch {
    storage.removeItem(key);
    return { state: null, recovered: true };
  }
}

export function writeStudyState(storage: Pick<Storage, "setItem">, key: string, state: StudyState) {
  try {
    storage.setItem(key, JSON.stringify(compactStudyState(state)));
    return true;
  } catch {
    return false;
  }
}
