/** Prompt-only normalization. Original learner vocabulary and saved IDs stay intact. */
export function readablePracticeEntry(value: string) {
  return value.normalize('NFKC').replace(/[يى]/gu, 'ی').replace(/ك/gu, 'ک')
    .replace(/[\u064b-\u065f\u0670\u0640\u00ad]/gu, '').replace(/\s+/gu, ' ').trim();
}

export function practiceBank(selected: string[], definitions: {word:string;meaning:string}[]) {
  const meanings = new Map(definitions.map(entry => [entry.word, entry.meaning]));
  return selected.map(word => ({word: readablePracticeEntry(word), meaning: meanings.get(word) ?? ''}));
}
