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
      definition: incoming.definition || current.definition,
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
