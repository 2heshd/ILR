type MergeableWord = {
  id: string;
  displayForm: string;
  normalizedForm?: string;
  definition?: string;
  romanization?: string;
  topic?: string;
  introducedAt?: string;
  reviews?: number;
  correct?: number;
  lapses?: number;
  sourceType?: string;
};

type DeletedPlatformVocabularyRow = {
  normalized_form?: string;
  display_form?: string;
};

export function dedupeLexicalWords<T extends MergeableWord>(input: T[]): {
  words: T[];
  aliases: Map<string, string>;
};

export function removeDeletedSharedWord<T extends MergeableWord>(
  words: T[],
  deletedRow: DeletedPlatformVocabularyRow,
): T[];
