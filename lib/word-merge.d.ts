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
};

export function dedupeLexicalWords<T extends MergeableWord>(input: T[]): {
  words: T[];
  aliases: Map<string, string>;
};
