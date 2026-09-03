import news from "@/data/news-vocabulary.json";
import type { LexicalItem } from "@/lib/types";

export const NEWS_META = news.meta;

export function newsVocabulary(): LexicalItem[] {
  const createdAt = "2026-09-03T00:00:00.000Z";
  return news.entries.map((word) => ({
    ...word,
    sourceType: "system_advanced" as const,
    tier: "A" as const,
    knowledgeState: "learning" as const,
    introducedAt: createdAt,
    reviews: 0,
    correct: 0,
    lapses: 0,
    dueAt: createdAt,
  })) as LexicalItem[];
}
