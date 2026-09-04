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
  return {
    ...state,
    words: state.words.map(compactWord),
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
