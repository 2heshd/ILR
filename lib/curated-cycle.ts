import cycle from "@/data/curated-cycle.json";
import type { LexicalItem, ListeningItem, Passage, SpeakingPrompt } from "@/lib/types";

export const CURRICULUM_META = cycle.meta;

export function curatedVocabulary(): LexicalItem[] {
  return cycle.vocabulary.map((word) => ({
    ...word,
    sourceType: word.sourceType as LexicalItem["sourceType"],
    tier: word.tier as LexicalItem["tier"],
    knowledgeState: "learning",
    introducedAt: cycle.meta.createdAt,
    reviews: 0,
    correct: 0,
    lapses: 0,
    dueAt: cycle.meta.createdAt,
  }));
}

export function curatedPassages(): Passage[] {
  return cycle.passages.map((item) => ({
    ...item,
    sourceType: item.sourceType as Passage["sourceType"],
    practiceMode: item.practiceMode as Passage["practiceMode"],
    questions: item.questions.map((question) => ({ ...question, type: question.type as Passage["questions"][number]["type"] })),
  }));
}

export function curatedListeningItems(): ListeningItem[] {
  return cycle.listeningItems.map((item) => ({
    ...item,
    sourceType: item.sourceType as ListeningItem["sourceType"],
    practiceMode: item.practiceMode as ListeningItem["practiceMode"],
    questions: item.questions.map((question) => ({ ...question, type: question.type as ListeningItem["questions"][number]["type"] })),
  }));
}

export function curatedSpeakingPrompts(): SpeakingPrompt[] {
  return cycle.speakingPrompts.map((item) => ({ ...item, ilrTarget: 1 }));
}
