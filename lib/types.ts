export type SourceType = "dli" | "system_advanced" | "user";

export type LexicalItem = {
  id: string;
  displayForm: string;
  normalizedForm: string;
  romanization?: string;
  definition?: string;
  sourceType: SourceType;
  sourceWeek: number;
  introducedAt: string;
  reviews: number;
  correct: number;
  lapses: number;
  medianResponseMs?: number;
  dueAt: string;
  stability?: number;
  difficulty?: number;
};

export type ReviewEvent = {
  id: string;
  lexicalItemId: string;
  reviewedAt: string;
  correct: boolean;
  responseMs: number;
  rating: "again" | "hard" | "good" | "easy";
  modality: "visual" | "audio" | "production";
};

export type StudyState = {
  weekNumber: number;
  words: LexicalItem[];
  reviews: ReviewEvent[];
};
