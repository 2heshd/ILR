export type SourceType = "course" | "dli" | "system_advanced" | "user";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type ReviewModality = "visual" | "audio" | "production" | "cloze";
export type ContentOrigin = "authentic" | "adapted" | "generated";
export type ContentModality = "reading" | "listening";
export type IlrLevel = 1 | 2 | 3 | 4;
export type WordKnowledgeState = "new" | "learning" | "known" | "automatic";
export type LexicalTier = "A" | "B" | "C";
export type PracticeMode = "controlled" | "transfer";
export type ErrorCategory = "lexical" | "acoustic" | "syntactic" | "discourse" | "cultural_pragmatic";

export type ModalityMastery = {
  reviews: number;
  correct: number;
  medianResponseMs?: number;
};

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
  tier?: LexicalTier;
  knowledgeState?: WordKnowledgeState;
  modalityMastery?: Partial<Record<ReviewModality, ModalityMastery>>;
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
  modalityCards?: Partial<Record<ReviewModality, SerializedFsrsCard>>;
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
  timerWindowMs?: number;
  hintUsed?: boolean;
  context?: string;
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
  failureTypes?: ErrorCategory[];
  recommendedRepair?: string;
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
  practiceMode?: PracticeMode;
  sourceUrl?: string;
  sourceTitle?: string;
  publisher?: string;
  author?: string;
  publishedAt?: string;
  wordCount?: number;
  unknownTokenRatio?: number;
  culturalTags?: string[];
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
  firstPass: boolean;
  errorCategories?: ErrorCategory[];
  readingMode?: "full" | "inference";
  maskedPercent?: number;
  sentenceGists?: string[];
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
  practiceMode?: PracticeMode;
  sourceUrl?: string;
  sourceTitle?: string;
  publisher?: string;
  author?: string;
  publishedAt?: string;
  mediaUrl?: string;
  audioDurationSec?: number;
  wordCount?: number;
  unknownTokenRatio?: number;
  culturalTags?: string[];
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
  firstPass: boolean;
  errorCategories?: ErrorCategory[];
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
