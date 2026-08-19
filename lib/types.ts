export type SourceType = "course" | "dli" | "system_advanced" | "user";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type ReviewModality = "visual" | "audio" | "production" | "cloze";
export type ContentOrigin = "authentic" | "adapted" | "generated";
export type ContentModality = "reading" | "listening";
export type IlrLevel = 1 | 2 | 3 | 4;
export type WordKnowledgeState = "new" | "learning" | "known" | "automatic";

export type AnkiSettings = {
  endpoint: string;
  deckName: string;
  lastSyncAt?: string;
};

export type CourseCatalogState = {
  catalogId: string;
  sourceFile: string;
  importedWeeks: number[];
};

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
  knowledgeState?: WordKnowledgeState;
  courseEntryId?: number;
  courseListNumber?: number;
  courseLesson?: string;
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
  referenceAnswer?: string;
};

export type GradedAnswer = {
  questionIndex: number;
  score: number;
  feedback: string;
  missedConcepts?: string[];
};

export type ComprehensionGrade = {
  overallScore: number;
  detailScore: number;
  inferenceScore: number;
  discourseScore: number;
  mainIdeaScore: number;
  answers: GradedAnswer[];
  summary: string;
};

export type Passage = {
  id: string;
  title: string;
  textFa: string;
  ilrEstimate: number;
  topic: string;
  register: string;
  genre: string;
  sourceType: ContentOrigin;
  sourceUrl?: string;
  sourceTitle?: string;
  publisher?: string;
  publishedAt?: string;
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
  answers?: string[];
  grade?: ComprehensionGrade;
  gradingMode?: "ai" | "self";
};

export type ListeningItem = {
  id: string;
  title: string;
  transcriptFa: string;
  ilrEstimate: number;
  topic: string;
  register: string;
  genre: string;
  sourceType: ContentOrigin;
  sourceUrl?: string;
  sourceTitle?: string;
  publisher?: string;
  publishedAt?: string;
  mediaUrl?: string;
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
  answers?: string[];
  grade?: ComprehensionGrade;
  gradingMode?: "ai" | "self";
};

export type SpeakingPrompt = {
  id: string;
  promptEn: string;
  promptFa?: string;
  topic: string;
  ilrTarget: number;
  functions: string[];
  targetWords: string[];
  createdAt: string;
};

export type SpeakingGrade = {
  taskCompletion: number;
  organization: number;
  grammaticalControl: number;
  vocabularyControl: number;
  fluencyEstimate: number;
  pronunciationClarity: number;
  rhythmPacing: number;
  toneDelivery: number;
  overallScore: number;
  transcript: string;
  strengths: string[];
  priorities: string[];
  feedback: string;
};

export type SpeakingAttempt = {
  id: string;
  speakingPromptId: string;
  attemptedAt: string;
  durationMs: number;
  transcript: string;
  usedSpeechRecognition: boolean;
  audioEvaluated?: boolean;
  grade?: SpeakingGrade;
  gradingMode: "ai" | "self";
  selfScore?: number;
};

export type StudyState = {
  weekNumber: number;
  currentIlr: IlrLevel;
  skillLevels: {
    reading: IlrLevel;
    listening: IlrLevel;
    speaking: IlrLevel;
  };
  course: CourseCatalogState;
  anki: AnkiSettings;
  words: LexicalItem[];
  reviews: ReviewEvent[];
  passages: Passage[];
  passageAttempts: PassageAttempt[];
  listeningItems: ListeningItem[];
  listeningAttempts: ListeningAttempt[];
  speakingPrompts: SpeakingPrompt[];
  speakingAttempts: SpeakingAttempt[];
};
