export type SourceType = "dli" | "system_advanced" | "user";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type ReviewModality = "visual" | "audio" | "production" | "cloze";

export type SerializedFsrsCard = {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  lastReview?: string;
};

export type LexicalItem = {
  id: string;
  displayForm: string;
  normalizedForm: string;
  romanization?: string;
  definition?: string;
  sourceType: SourceType;
  sourceWeek: number;
  topic?: string;
  introducedAt: string;
  reviews: number;
  correct: number;
  lapses: number;
  medianResponseMs?: number;
  dueAt: string;
  stability?: number;
  difficulty?: number;
  fsrsCard?: SerializedFsrsCard;
};

export type ReviewEvent = {
  id: string;
  lexicalItemId: string;
  reviewedAt: string;
  correct: boolean;
  responseMs: number;
  rating: ReviewRating;
  modality: ReviewModality;
  schedulerBefore?: SerializedFsrsCard;
  schedulerAfter?: SerializedFsrsCard;
};

export type PassageQuestion = {
  question: string;
  type: "detail" | "inference" | "discourse" | "main_idea";
};

export type Passage = {
  id: string;
  title: string;
  textFa: string;
  ilrEstimate: number;
  topic: string;
  register: string;
  targetWords: string[];
  questions: PassageQuestion[];
  createdAt: string;
};

export type PassageAttempt = {
  id: string;
  passageId: string;
  attemptedAt: string;
  durationMs: number;
  comprehensionScore: number;
  inferenceScore: number;
  discourseScore: number;
  unknownWordCount: number;
  rereads: number;
};

export type ListeningItem = {
  id: string;
  title: string;
  transcriptFa: string;
  ilrEstimate: number;
  topic: string;
  register: string;
  targetWords: string[];
  questions: PassageQuestion[];
  createdAt: string;
};

export type ListeningAttempt = {
  id: string;
  listeningItemId: string;
  attemptedAt: string;
  listensCount: number;
  comprehensionScore: number;
  detailScore: number;
  inferenceScore: number;
  transcriptRevealed: boolean;
};

export type StudyState = {
  weekNumber: number;
  words: LexicalItem[];
  reviews: ReviewEvent[];
  passages: Passage[];
  passageAttempts: PassageAttempt[];
  listeningItems: ListeningItem[];
  listeningAttempts: ListeningAttempt[];
};
