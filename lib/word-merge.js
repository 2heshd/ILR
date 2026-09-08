function normalizedKey(word) {
  return String(word.normalizedForm || word.displayForm)
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670\s‌]+/gu, "")
    .replace(/ك/gu, "ک")
    .replace(/[يى]/gu, "ی");
}

/**
 * Collapses vocabulary arriving from local state, a cloud snapshot, and the
 * shared platform table. The first ID becomes canonical so existing review
 * references remain stable; useful metadata from later copies is retained.
 */
export function dedupeLexicalWords(input) {
  const words = [];
  const indexes = new Map();
  const aliases = new Map();

  for (const incoming of input) {
    const key = normalizedKey(incoming);
    const index = indexes.get(key);
    if (index === undefined) {
      indexes.set(key, words.length);
      aliases.set(incoming.id, incoming.id);
      words.push({ ...incoming, normalizedForm: key });
      continue;
    }

    const current = words[index];
    aliases.set(incoming.id, current.id);
    words[index] = {
      ...current,
      ...incoming,
      id: current.id,
      normalizedForm: key,
      displayForm: incoming.displayForm || current.displayForm,
      definition: current.courseEntryId ? current.definition : incoming.definition || current.definition,
      courseEntryId: current.courseEntryId || incoming.courseEntryId,
      courseLesson: current.courseEntryId ? current.courseLesson : incoming.courseLesson,
      romanization: incoming.romanization || current.romanization,
      topic: incoming.topic || current.topic,
      introducedAt: current.introducedAt || incoming.introducedAt,
      reviews: Math.max(current.reviews ?? 0, incoming.reviews ?? 0),
      correct: Math.max(current.correct ?? 0, incoming.correct ?? 0),
      lapses: Math.max(current.lapses ?? 0, incoming.lapses ?? 0),
    };
  }

  return { words, aliases };
}

// Keep exact ChiMishe meanings, including different senses sharing a spelling.
export function restoreCourseDefinitions(words, entries) {
  const byForm = new Map();
  for (const entry of entries) {
    const key = normalizedKey({displayForm:entry.fa});
    const definitions = byForm.get(key) || [];
    if(entry.en && !definitions.includes(entry.en)) definitions.push(entry.en);
    byForm.set(key,definitions);
  }
  return words.map(word => {
    if (!word.courseEntryId) return word;
    const definitions = byForm.get(normalizedKey(word));
    if(!definitions?.length) return word;
    const definition = definitions.join(' / ');
    return definition === word.definition ? word : {...word,definition};
  });
}

/**
 * Applies a shared-bank DELETE event without touching course-owned vocabulary.
 * Realtime DELETE payloads use snake_case because they contain the database row.
 */
export function removeDeletedSharedWord(words, deletedRow) {
  const key = normalizedKey({
    normalizedForm: deletedRow?.normalized_form,
    displayForm: deletedRow?.display_form,
  });
  if (!key) return words;
  return words.filter((word) => word.sourceType !== "user" || normalizedKey(word) !== key);
}
