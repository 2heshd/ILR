"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import StudyPlanPicker, {planLabels} from "@/components/StudyPlanPicker";
import {revealPriority} from '@/lib/reveal-priority';
import {canManageClasses} from "@/lib/classroom-access";
import { dueWords, plannedWords, type PlanMode, type StudyPlan } from "@/lib/study-plans";
import {nextReviewWord,reviewWord} from "@/lib/review-session";
import { independentSchedules } from "@/lib/independent-schedules";
import { patternHints } from "@/lib/persian-patterns";
import AccountWorkspace from "@/components/AccountWorkspace";
import {inviteCodeFromHash,normalizeClassCode,validClassCode} from '@/lib/class-invites';
import ComprehensionGrader from "@/components/ComprehensionGrader";
import GistListening from "@/components/GistListening";
import InferenceReadingText, { persianSentences } from "@/components/InferenceReadingText";
import InteractivePersianText from "@/components/InteractivePersianText";
import Onboarding from "@/components/Onboarding";
import RapidCaptions from "@/components/RapidCaptions";
import SpeakingLab from "@/components/SpeakingLab";
import { adaptiveAllocation, currentTrainingPhase, dominantBottleneck, selectContextWords } from "@/lib/adaptive";
import type { AnkiReviewRow, AnkiVocabularyRow } from "@/lib/anki";
import { COURSE_META, courseSectionLabel, loadCourseCatalog, loadCourseWeek, type CourseVocabularyEntry } from "@/lib/course";
import { curatedListeningItems, curatedPassages, curatedSpeakingPrompts } from "@/lib/curated-cycle";
import { createSerializedCard, reviewFsrs } from "@/lib/fsrs";
import { NEWS_META, newsVocabulary } from "@/lib/news";
import { NEWS_TOPICS, newsTopicFor, type NewsTopic } from "@/lib/news-topics";
import { removeDeletedSharedWord } from "@/lib/word-merge.js";
import { captionsCoverText, nextCaption } from '@/lib/caption-integrity';
import {COURSE_TOPICS,PRACTICE_TOPICS,courseTopicFor} from '@/lib/course-topics';
import { normalizePersian, parseWeeklyInput } from "@/lib/persian";
import { isMeaningfulPersianText, sanitizePersianSpeechText } from "@/lib/persian-speech";
import { sourceMetrics } from "@/lib/source-analytics";
import { LatestPracticePrefetch, loadPracticeWithRetries, practicePrefetchKey } from "@/lib/practice-prefetch";
import { focusedSelectedPracticeWords, topicPracticeWords, type PracticeSource } from "@/lib/practice-sources";
import { appendLearningEvents, makeLearningEvent, type LearningEvent } from "@/lib/learning-events";
import { compactStudyState, readStudyState, writeStudyState } from "@/lib/storage";
import { appendCloudReview, deletePlatformVocabulary, getSupabaseClient, loadCloudState, loadPlatformVocabulary, loadUsername, mergePlatformVocabulary, mergeStudyStates, saveCloudState, syncPlatformVocabulary, updateUsername } from "@/lib/supabase";
import { dedupeLexicalWords, restoreCourseDefinitions } from "@/lib/word-merge";
import type {
  ComprehensionGrade,
  LexicalItem,
  ListeningAttempt,
  ListeningItem,
  IlrLevel,
  Passage,
  PassageAttempt,
  PracticeMode,
  ReviewEvent,
  ReviewModality,
  ReviewRating,
  SpeakingAttempt,
  SpeakingPrompt,
  StudyState,
  WordKnowledgeState,
} from "@/lib/types";

const STORAGE_KEY = "ilr-persian-v3";
const ONBOARDING_KEY = "ilr-persian-onboarding-v1";
const LEGACY_KEYS = ["ilr-persian-v2", "ilr-persian-v1"];
const EVENT_OUTBOX_KEY = "synaptx-suite-event-outbox-v1";
const INTERVENTION_MAP_KEY = "synaptx-suite-interventions-v1";
const PERSIAN_WORD_PATTERN = /([\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+)/g;
const IS_PERSIAN_WORD = /^[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+$/;
const SYNAPTX_URL = process.env.NEXT_PUBLIC_SYNAPTX_URL ?? (process.env.NODE_ENV === "production" ? "https://synapt-x.vercel.app" : "http://localhost:3002");
const ASL_URL = process.env.NEXT_PUBLIC_ASL_URL ?? (process.env.NODE_ENV === "production" ? "https://getcognis.vercel.app" : "http://localhost:3000");
const NEWS_CATALOG = newsVocabulary();

function syntaxUrl(sentence: string) {
  const params = new URLSearchParams({ sentence, language: "fa" });
  return `${SYNAPTX_URL}/syntax.html?${params}`;
}

function morphologyUrl(word: string, definition?: string, romanization?: string) {
  const params = new URLSearchParams({ word, language: "fa", focus: "etymology" });
  if (definition?.trim()) params.set("definition", definition.trim());
  if (romanization?.trim()) params.set("romanization", romanization.trim());
  return `${SYNAPTX_URL}/morphology.html?${params}`;
}

type Tab = "home" | "today" | "reading" | "listening" | "speaking" | "vocabulary" | "analytics" | "account";

const TAB_LABELS: Record<Tab, string> = {
  home: "Home",
  account: "Account",
  today: "Flashcards",
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  vocabulary: "Vocabulary",
  analytics: "Progress",
};

type GradingResult = {
  answers: string[];
  grade: ComprehensionGrade;
  gradingMode: "ai" | "self";
};

type GeneratedPractice = {
  title: string;
  textFa: string;
  topic: string;
  register: string;
  knownWordsUsed?: unknown[];
  newWordsIntroduced?: unknown[];
  questions?: Passage["questions"];
};

type PreparedPractice = {
  data: GeneratedPractice;
  targetIlr: number;
  practiceMode: PracticeMode;
  words: string[];
  generatedTargets: string[];
  generatedWordCount: number;
  supportingWords: string[];
};

type PracticeGenerationContext = {
  key: string;
  kind: "reading" | "listening";
  request: Record<string, unknown>;
  targetIlr: number;
  practiceMode: PracticeMode;
  practiceSource: PracticeSource;
  words: string[];
};

const emptyState: StudyState = {
  weekNumber: 1,
  currentIlr: 1,
  skillLevels: { reading: 1, listening: 1, speaking: 1 },
  course: { catalogId: COURSE_META.id, sourceFile: COURSE_META.sourceFile, importedWeeks: [] },
  anki: { endpoint: "http://127.0.0.1:8765", deckName: "" },
  words: [],
  reviews: [],
  passages: curatedPassages(),
  passageAttempts: [],
  listeningItems: curatedListeningItems(),
  listeningAttempts: [],
  speakingPrompts: curatedSpeakingPrompts(),
  speakingAttempts: [],
};

function id() {
  return crypto.randomUUID();
}

type TimedCaption = { word: string; start: number; end: number };

function hydrateState(raw: Partial<StudyState> | null | undefined): StudyState {
  const seededPassages = [...(raw?.passages??[]).filter(item=>!curatedPassages().some(seed=>seed.id===item.id)),...curatedPassages()];
  const seededListening = [...(raw?.listeningItems??[]).filter(item=>!curatedListeningItems().some(seed=>seed.id===item.id)),...curatedListeningItems()];
  const seededSpeaking = [...(raw?.speakingPrompts??[]).filter(item=>!curatedSpeakingPrompts().some(seed=>seed.id===item.id)),...curatedSpeakingPrompts()];
  const { words: mergedWords, aliases: wordAliases } = dedupeLexicalWords(raw?.words ?? []);
  const wordIds = new Set(mergedWords.map((word) => word.id));
  const passageIds = new Set(seededPassages.map((item) => item.id));
  const listeningIds = new Set(seededListening.map((item) => item.id));
  const speakingIds = new Set(seededSpeaking.map((item) => item.id));
  const state: StudyState = {
    ...emptyState,
    ...raw,
    currentIlr: raw?.currentIlr ?? 1,
    skillLevels: {
      reading: raw?.skillLevels?.reading ?? 1,
      listening: raw?.skillLevels?.listening ?? 1,
      speaking: raw?.skillLevels?.speaking ?? 1,
    },
    course: {
      ...emptyState.course,
      catalogId: COURSE_META.id,
      sourceFile: COURSE_META.sourceFile,
      importedWeeks: raw?.course?.catalogId === COURSE_META.id ? (raw.course.importedWeeks ?? []) : [],
    },
    anki: { ...emptyState.anki, ...(raw?.anki ?? {}) },
    words: mergedWords,
    studyPlans: Object.fromEntries(Object.entries(raw?.studyPlans ?? {}).map(([mode, plan]) => [mode, plan ? {...plan, wordIds: [...new Set(plan.wordIds.map(wordId => wordAliases.get(wordId) ?? wordId))].filter(wordId => wordIds.has(wordId))} : plan])),
    reviews: [...new Map((raw?.reviews ?? [])
      .map((review) => ({ ...review, lexicalItemId: wordAliases.get(review.lexicalItemId) ?? review.lexicalItemId }))
      .filter((review) => wordIds.has(review.lexicalItemId))
      .map((review) => [review.id, review] as const)).values()],
    passages: seededPassages,
    passageAttempts: (raw?.passageAttempts ?? []).filter((attempt) => passageIds.has(attempt.passageId)).map((attempt) => ({ ...attempt, firstPass: attempt.firstPass ?? true })),
    listeningItems: seededListening,
    listeningAttempts: (raw?.listeningAttempts ?? []).filter((attempt) => listeningIds.has(attempt.listeningItemId)).map((attempt) => ({ ...attempt, firstPass: attempt.firstPass ?? !attempt.transcriptRevealed })),
    speakingPrompts: seededSpeaking,
    speakingAttempts: (raw?.speakingAttempts ?? []).filter((attempt) => speakingIds.has(attempt.speakingPromptId)),
  };
  const reviewsByWord=new Map<string,ReviewEvent[]>();
  for(const review of state.reviews){const list=reviewsByWord.get(review.lexicalItemId)??[];list.push(review);reviewsByWord.set(review.lexicalItemId,list);}
  state.words = state.words.map((word) => {
    const modalityCards=independentSchedules(word,reviewsByWord.get(word.id)??[],raw?.schedulingVersion===2);
    const fsrsCard=modalityCards.visual!;
    const knowledgeState = word.knowledgeState ?? (word.sourceWeek < state.weekNumber ? "known" : "learning");
    const tier = word.tier ?? (word.sourceType === "system_advanced" ? "A" : word.sourceType === "course" ? "B" : "C");
    return {
      ...word,
      tier,
      modalityMastery: word.modalityMastery ?? {},
      modalityCards,
      knowledgeState,
      fsrsCard,
      dueAt: word.dueAt || fsrsCard.due,
    };
  });
  state.schedulingVersion=2;
  return state;
}

function weakestAccuracy(word:LexicalItem){const tested=Object.values(word.modalityMastery??{}).filter(item=>item&&item.reviews>0);return tested.length?Math.min(...tested.map(item=>item!.correct/item!.reviews)):word.correct/Math.max(1,word.reviews);}
function WordPatternHint({word}:{word:string}){const hints=patternHints(word);return hints.length?<details className="vocab-pattern-hint"><summary>Word-building hint</summary>{hints.map(hint=><p key={hint.form}><b lang="fa">{hint.form}</b> · {hint.rule}<br/><small>{hint.example}</small></p>)}</details>:null;}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
}

function courseWordKey(value: string) {
  return normalizePersian(value)
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670\s‌]+/g, "");
}

function isPatternItem(word: LexicalItem) {
  return word.displayForm.trim().split(/[\s\u200c]+/).filter(Boolean).length > 1;
}

function normalizeEnglishAnswer(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/^(?:to|a|an|the)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function answerMatchesDefinition(answer: string, definition?: string) {
  const normalizedAnswer = normalizeEnglishAnswer(answer);
  if (!normalizedAnswer || !definition) return false;
  return definition
    .split(/\s*(?:[;,/|]|\bor\b)\s*/i)
    .map(normalizeEnglishAnswer)
    .filter(Boolean)
    .some((expected) => expected === normalizedAnswer || (
      Math.min(expected.length, normalizedAnswer.length) >= 4
      && (expected.includes(normalizedAnswer) || normalizedAnswer.includes(expected))
    ));
}

function progressiveListeningText(text: string, words: LexicalItem[], revealPercent: number) {
  const parts = text.split(PERSIAN_WORD_PATTERN);
  const byWord = new Map(words.map((word) => [word.normalizedForm, word]));
  const unknownWords = [...new Set(parts
    .filter((part) => IS_PERSIAN_WORD.test(part))
    .map((part) => normalizePersian(part)))].sort((a,b)=>revealPriority(byWord.get(b))-revealPriority(byWord.get(a)));
  const revealCount = Math.ceil(unknownWords.length * revealPercent / 100);
  const revealed = new Set(unknownWords.slice(0, revealCount));
  return {
    text: parts.map((part) => {
      if (!IS_PERSIAN_WORD.test(part)) return part;
      const normalized = normalizePersian(part);
      const status = byWord.get(normalized)?.knowledgeState;
      return revealed.has(normalized) ? part : "•••";
    }).join(""),
    unknownCount: unknownWords.length,
    revealedCount: revealCount,
  };
}

function friendlyAccountError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error || "Account request failed.");
  if (/duplicate|unique|already registered|already exists/i.test(message)) return "That email or username is already in use.";
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirm your email before signing in.";
  if (/password/i.test(message) && /short|least|weak/i.test(message)) return "Use a stronger password with at least 8 characters.";
  return message;
}

async function generateJson(body: Record<string, unknown>) {
  try {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
  });
  const data = await response.json().catch(() => ({error: 'The generation service did not respond. Please try again; your current practice is unchanged.'}));
  if (!response.ok) throw new Error(data.error || "Generation failed");
  return data;
  } catch (error) {
    if (error instanceof Error && /^(TimeoutError|AbortError)$/.test(error.name)) {
      throw new Error('Generation took too long. Please try again; your current practice is unchanged.');
    }
    throw error;
  }
}

export default function Home() {
  const [state, setState] = useState<StudyState>(emptyState);
  const latestState = useRef(state);
  const skillCarousel = useRef<HTMLDivElement>(null);
  const [skillSlide,setSkillSlide] = useState(0);
  function moveSkillSlide(direction:number){
    const track=skillCarousel.current;
    if(!track)return;
    const next=Math.max(0,Math.min(5,skillSlide+direction));
    const card=track.children[next] as HTMLElement;
    track.scrollTo({left:card.offsetLeft-track.offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  latestState.current = state;
  const submittedReview = useRef('');
  const localStateKey = useRef(STORAGE_KEY);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [persianFont,setPersianFont]=useState('original');
  useEffect(()=>{try{const saved=localStorage.getItem('cursos-persian-font');if(saved&&['original','tahoma','arial','serif'].includes(saved))setPersianFont(saved);}catch{}},[]);
  useEffect(()=>{document.documentElement.style.setProperty('--persian-font',({original:'"Cursos Persian Mono"',tahoma:'"Persian Tahoma"',arial:'"Persian Arial"',serif:'"Persian Times"'} as Record<string,string>)[persianFont]);},[persianFont]);
  const [showIntake, setShowIntake] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [courseBusy, setCourseBusy] = useState(false);
  const [planMode, setPlanMode] = useState<PlanMode>('visual');
  const [courseCatalog, setCourseCatalog] = useState<CourseVocabularyEntry[]>([]);
  useEffect(() => {
    if (!courseCatalog.length) return;
    setState(previous => {
      const words = restoreCourseDefinitions(previous.words, courseCatalog);
      return words.some((word,index)=>word!==previous.words[index]) ? {...previous,words} : previous;
    });
  }, [courseCatalog, state.words]);
  const [catalogWeek, setCatalogWeek] = useState(1);
  const [catalogLesson, setCatalogLesson] = useState("");
  const [courseTopic,setCourseTopic]=useState('All topics');
  const [practiceTopic,setPracticeTopic]=useState({reading:'Daily life',listening:'Daily life'});
  const [practiceSource,setPracticeSource]=useState<Record<'reading'|'listening',PracticeSource>>({reading:'selected',listening:'selected'});
  const [catalogUnit, setCatalogUnit] = useState("");
  const [catalogChapter, setCatalogChapter] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [selectedCourseEntries, setSelectedCourseEntries] = useState<Set<number>>(new Set());
  const [selectedCourseSections, setSelectedCourseSections] = useState<Set<string>>(new Set());
  const [newsQuery, setNewsQuery] = useState("");
  const [newsTopic, setNewsTopic] = useState<NewsTopic>("All topics");
  const [selectedNewsEntries, setSelectedNewsEntries] = useState<Set<string>>(new Set());
  const [generationBusy, setGenerationBusy] = useState<"reading" | "listening" | null>(null);
  const [practiceRegister,setPracticeRegister]=useState<Record<'reading'|'listening','formal'|'colloquial'>>({reading:'formal',listening:'formal'});
  const [audioBusy, setAudioBusy] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudUsername, setCloudUsername] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [reviewModality, setReviewModality] = useState<Extract<ReviewModality, "visual" | "audio" | "cloze">>("visual");
  const [lockedReviewForm,setLockedReviewForm]=useState<string|null>(null);
  const [revealed, setRevealed] = useState(false);
  const [playedReviewWord,setPlayedReviewWord]=useState('');
  const [responseMs, setResponseMs] = useState(0);
  const [patternPhase, setPatternPhase] = useState<"flash" | "answer" | "result">("flash");
  const [patternInput, setPatternInput] = useState("");
  const [patternMatched, setPatternMatched] = useState(false);
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null);
  const [readingDurationMs, setReadingDurationMs] = useState(0);
  const [readingQuestionsOpen, setReadingQuestionsOpen] = useState(false);
  const [readingMode, setReadingMode] = useState<"full" | "inference">("full");
  const [sentenceGists, setSentenceGists] = useState<string[]>([]);
  const [readingUnknown, setReadingUnknown] = useState(0);
  const [readingRereads, setReadingRereads] = useState(0);
  const [listensCount, setListensCount] = useState(0);
  const [listeningMode, setListeningMode] = useState<"full" | "gist" | "rapid">("full");
  const [listeningGists, setListeningGists] = useState<string[]>([]);
  const [gistSentenceListenCounts, setGistSentenceListenCounts] = useState<number[]>([]);
  const [gistAnsweredAfterListens, setGistAnsweredAfterListens] = useState<number[]>([]);
  const [gistHintedSentenceIndexes, setGistHintedSentenceIndexes] = useState<number[]>([]);
  const [rapidCaptionListens, setRapidCaptionListens] = useState(0);
  const [rapidCaptionWord, setRapidCaptionWord] = useState("");
  const [rapidPlaying, setRapidPlaying] = useState(false);
  const [transcriptRevealStep, setTranscriptRevealStep] = useState(0);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [activeListeningId, setActiveListeningId] = useState<string | null>(null);
  const startRef = useRef(Date.now());
  const patternInputRef = useRef<HTMLInputElement | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const rapidFrameRef = useRef<number | null>(null);
  const speechCacheRef = useRef(new Map<string, Blob>());
  const speechRequestsRef = useRef(new Map<string, Promise<Blob>>());
  const speechTimingsRef = useRef(new Map<string, TimedCaption[]>());
  const speechTimingRequestsRef = useRef(new Map<string, Promise<{ audio: Blob; timings: TimedCaption[] }>>());
  const practicePrefetchRef = useRef({
    reading: new LatestPracticePrefetch<PreparedPractice>(),
    listening: new LatestPracticePrefetch<PreparedPractice>(),
  });
  const eventOutboxRef = useRef<LearningEvent[]>([]);

  function saveEventOutbox(events:LearningEvent[]){
    eventOutboxRef.current=events.slice(-2000);
    localStorage.setItem(EVENT_OUTBOX_KEY,JSON.stringify(eventOutboxRef.current));
  }

  async function flushEventOutbox(user:User){
    const client=getSupabaseClient();
    const pending=[...eventOutboxRef.current];
    if(!client||!pending.length)return;
    try{
      const stored=await appendLearningEvents(client,user,pending);
      if(stored)saveEventOutbox(eventOutboxRef.current.filter(event=>!pending.some(item=>item.id===event.id)));
    }catch(error){console.error('Learning event sync failed',error);}
  }

  function recordSuiteEvent(input:Parameters<typeof makeLearningEvent>[0]){
    const event=makeLearningEvent(input);
    saveEventOutbox([...eventOutboxRef.current,event]);
    if(cloudUser)void flushEventOutbox(cloudUser);
    return event;
  }

  useEffect(() => {
    const needsTopicCatalog = (tab === "reading" || tab === "listening") && practiceSource[tab] === "topic";
    if ((tab !== "vocabulary" && !needsTopicCatalog) || courseCatalog.length) return;
    void loadCourseCatalog().then((catalog) => setCourseCatalog(catalog.entries));
  }, [tab, courseCatalog.length, practiceSource]);

  function releasePlayback() {
    if (rapidFrameRef.current !== null) window.cancelAnimationFrame(rapidFrameRef.current);
    rapidFrameRef.current = null;
    playbackRef.current?.pause();
    playbackRef.current = null;
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setRapidPlaying(false);
    setRapidCaptionWord("");
  }

  async function playAudioBlob(blob: Blob) {
    releasePlayback();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    playbackRef.current = audio;
    playbackUrlRef.current = url;
    audio.preload = "auto";
    audio.volume = 1;
    audio.onended = releasePlayback;
    await audio.play();
  }

  function speechCacheRequest(cacheKey: string) {
    return new Request(`${window.location.origin}/__speech-cache/${encodeURIComponent(cacheKey)}`);
  }

  async function readCachedSpeech(cacheKey: string) {
    const memory = speechCacheRef.current.get(cacheKey);
    if (memory) return memory;
    if (!("caches" in window)) return null;
    const stored = await caches.open("persian-audio-v2").then((cache) => cache.match(speechCacheRequest(`v2-${cacheKey}`)));
    if (!stored) return null;
    const blob = await stored.blob();
    if (blob.size < 500) return null;
    speechCacheRef.current.set(cacheKey, blob);
    return blob;
  }

  async function prepareSpeech(text: string, cacheKey: string) {
    const cached = await readCachedSpeech(cacheKey);
    if (cached) return cached;
    const pending = speechRequestsRef.current.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      const response = await fetch("/api/speech", {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sanitizePersianSpeechText(text) }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.startsWith("audio/")) {
        const message = contentType.includes("json") ? (await response.json()).error : "Persian audio could not be generated.";
        throw new Error(message || "Persian audio could not be generated.");
      }
      const blob = await response.blob();
      if (blob.size < 500) throw new Error("The generated audio file was empty.");
      speechCacheRef.current.set(cacheKey, blob);
      if ("caches" in window) {
        const cache = await caches.open("persian-audio-v2");
        await cache.put(speechCacheRequest(`v2-${cacheKey}`), new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
      }
      return blob;
    })().finally(() => speechRequestsRef.current.delete(cacheKey));

    speechRequestsRef.current.set(cacheKey, request);
    return request;
  }

  function speechTimingCacheRequest(cacheKey: string) {
    return new Request(`${window.location.origin}/__speech-timing-cache/${encodeURIComponent(cacheKey)}`);
  }

  async function readCachedSpeechTimings(cacheKey: string) {
    const memory = speechTimingsRef.current.get(cacheKey);
    if (memory) return memory;
    if (!("caches" in window)) return null;
    const stored = await caches.open("persian-speech-timings-v1").then((cache) => cache.match(speechTimingCacheRequest(cacheKey)));
    if (!stored) return null;
    const data = (await stored.json()) as { words?: TimedCaption[] };
    if (!data.words?.length) return null;
    speechTimingsRef.current.set(cacheKey, data.words);
    return data.words;
  }

  async function prepareAlignedSpeech(text: string, cacheKey: string) {
    const [cachedAudio, cachedTimings] = await Promise.all([readCachedSpeech(cacheKey), readCachedSpeechTimings(cacheKey)]);
    if (cachedAudio && cachedTimings && captionsCoverText(text,cachedTimings)) return { audio: cachedAudio, timings: cachedTimings };
    const pending = speechTimingRequestsRef.current.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      const response = await fetch("/api/speech-timings", {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "Exact word timing is unavailable.");
      }
      const payload = await response.arrayBuffer();
      if (payload.byteLength < 5) throw new Error("The aligned audio response was empty.");
      const metadataLength = new DataView(payload).getUint32(0);
      if (!metadataLength || metadataLength + 4 >= payload.byteLength) throw new Error("The aligned audio response was invalid.");
      const metadata = JSON.parse(new TextDecoder().decode(payload.slice(4, 4 + metadataLength))) as {
        mimeType?: string;
        words?: TimedCaption[];
      };
      if (!metadata.words?.length || !captionsCoverText(text,metadata.words)) throw new Error("The captions are incomplete. Please retry or use Full audio.");
      const audio = new Blob([payload.slice(4 + metadataLength)], { type: metadata.mimeType || "audio/mpeg" });
      speechCacheRef.current.set(cacheKey, audio);
      speechTimingsRef.current.set(cacheKey, metadata.words);
      if ("caches" in window) {
        const [audioCache, timingCache] = await Promise.all([
          caches.open("persian-audio-v2"),
          caches.open("persian-speech-timings-v1"),
        ]);
        await Promise.all([
          audioCache.put(speechCacheRequest(`v2-${cacheKey}`), new Response(audio, { headers: { "Content-Type": audio.type } })),
          timingCache.put(speechTimingCacheRequest(cacheKey), new Response(JSON.stringify({ words: metadata.words }), {
            headers: { "Content-Type": "application/json" },
          })),
        ]);
      }
      return { audio, timings: metadata.words };
    })().finally(() => speechTimingRequestsRef.current.delete(cacheKey));

    speechTimingRequestsRef.current.set(cacheKey, request);
    return request;
  }

  function playWithDeviceVoice(text: string) {
    if (typeof speechSynthesis === "undefined") return false;
    const persianVoice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("fa"));
    if (!persianVoice) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = persianVoice.lang;
    utterance.voice = persianVoice;
    utterance.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    return true;
  }

  useEffect(() => {
    try{
      const saved=JSON.parse(localStorage.getItem(EVENT_OUTBOX_KEY)??'[]');
      eventOutboxRef.current=Array.isArray(saved)?saved.slice(-2000):[];
    }catch{eventOutboxRef.current=[];}
    const previousOwner=localStorage.getItem(`${STORAGE_KEY}:owner`);
    localStateKey.current=previousOwner?`${STORAGE_KEY}:guest`:STORAGE_KEY;
    const saved = readStudyState(localStorage, localStateKey.current, previousOwner?[]:LEGACY_KEYS);
    const local = hydrateState(saved.state ?? emptyState);
    setState(local);
    latestState.current = local;
    if (saved.recovered) setStatus("Cursos repaired damaged browser storage and reopened with a clean local copy.");
    setShowOnboarding(localStorage.getItem(ONBOARDING_KEY) !== "complete");
    setLoaded(true);

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;
    let connectionVersion = 0;
    let connectingUser = '';
    async function connect(user: User) {
      if (connectingUser === user.id) return;
      connectingUser = user.id;
      const version = ++connectionVersion;
      setCloudReady(false);
      setCloudUser(user);
      try {
        const cloud = await loadCloudState(supabase!, user);
        if (!active || version !== connectionVersion) return;
        const sharedWords = await loadPlatformVocabulary(supabase!, user);
        if (!active || version !== connectionVersion) return;
        const userKey = `${STORAGE_KEY}:user:${user.id}`;
        const previousOwner=localStorage.getItem(`${STORAGE_KEY}:owner`);
        const cachedUser=hydrateState(readStudyState(localStorage,userKey,previousOwner===user.id?[STORAGE_KEY]:[]).state);
        const isGuest=localStateKey.current===STORAGE_KEY||localStateKey.current===`${STORAGE_KEY}:guest`;
        const currentLocal = localStateKey.current===userKey?latestState.current:isGuest?mergeStudyStates(cachedUser,latestState.current):cachedUser;
        if(isGuest)writeStudyState(localStorage,`${STORAGE_KEY}:guest`,latestState.current);
        localStateKey.current=userKey;
        localStorage.setItem(`${STORAGE_KEY}:owner`,user.id);
        if (cloud) {
          const merged = hydrateState(mergePlatformVocabulary(mergeStudyStates(hydrateState(cloud), currentLocal), sharedWords));
          setState(merged);
          await saveCloudState(supabase!, user, merged);
        } else {
          const merged = hydrateState(mergePlatformVocabulary(currentLocal, sharedWords));
          setState(merged);
          await saveCloudState(supabase!, user, merged);
        }
        const username=await loadUsername(supabase!, user);
        if(!active||version!==connectionVersion)return;
        setCloudUsername(username);
        setCloudReady(true);
        await flushEventOutbox(user);
      } catch (error) {
        console.error(error);
        setStatus("Cloud sync setup needs attention; local history is still safe on this device.");
      } finally {
        if (version === connectionVersion) connectingUser = '';
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void connect(data.session.user);
      else setCloudReady(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && event !== 'TOKEN_REFRESHED') setTimeout(() => { if(active) void connect(session.user); },0);
      else {
        if (session?.user) return;
        connectionVersion++;
        connectingUser = '';
        if(localStateKey.current.includes(':user:')){
          localStateKey.current=`${STORAGE_KEY}:guest`;
          const guest=hydrateState(readStudyState(localStorage,localStateKey.current,[]).state);
          latestState.current=guest;
          setState(guest);
        }
        setCloudUser(null);
        setCloudUsername(null);
        setCloudReady(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => () => releasePlayback(), []);

  useEffect(() => {
    if (!cloudUser) return;
    const client = getSupabaseClient();
    if (!client) return;
    const channel = client
      .channel(`platform-vocabulary-${cloudUser.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "platform_vocabulary",
        filter: `user_id=eq.${cloudUser.id}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setState((current) => ({
            ...current,
            words: removeDeletedSharedWord(current.words, payload.old),
          }));
          return;
        }
        void loadPlatformVocabulary(client, cloudUser)
          .then((sharedWords) => setState((current) => {
            const merged=mergePlatformVocabulary(current, sharedWords);
            return merged===current?current:hydrateState(merged);
          }))
          .catch((error) => console.error("Shared vocabulary refresh failed", error));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [cloudUser]);

  useEffect(() => {
    if (!loaded) return;
    if (!writeStudyState(localStorage, localStateKey.current, state)) {
      setStatus("This vocabulary bank is too large for browser storage. Your open session is safe; sign in to keep the complete bank in cloud storage.");
    }
    if (!cloudUser || !cloudReady) return;
    const client = getSupabaseClient();
    if (!client) return;
    const timer = window.setTimeout(() => {
      void Promise.allSettled([saveCloudState(client, cloudUser, compactStudyState(state)), syncPlatformVocabulary(client, cloudUser, state.words)]).then((results) => {
        const failures = results.flatMap((result, index) => {
          if (result.status === 'fulfilled') return [];
          const code = String(result.reason?.code || 'network');
          console.error('Cloud sync failed', {area:index === 0 ? 'history' : 'vocabulary',code});
          return [`${index === 0 ? 'History' : 'Shared vocabulary'} sync failed (${code}).`];
        });
        if (failures.length) setStatus(`${failures.join(' ')} This session is unchanged; cloud sync will retry on your next change.`);
        else setStatus(current => /^(History|Shared vocabulary) sync failed/.test(current) ? '' : current);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, loaded, cloudUser, cloudReady]);

  useEffect(() => {
    if (!loaded) return;
    const openAccount=()=>{if(inviteCodeFromHash(window.location.hash)||window.location.hash==='#account'){setTab('analytics');setShowOnboarding(false);setTimeout(()=>document.getElementById('account')?.scrollIntoView({block:'start'}),100);}};
    openAccount();window.addEventListener('hashchange',openAccount);return()=>window.removeEventListener('hashchange',openAccount);
  },[loaded]);

  useEffect(() => {
    if (!loaded) return;
    const params = new URLSearchParams(window.location.search);
    const displayForm = params.get("add_word")?.trim();
    if (!displayForm) return;
    const normalizedForm = normalizePersian(displayForm);
    const incomingKey = courseWordKey(displayForm);
    const definition = params.get("definition")?.trim() || undefined;
    const romanization = params.get("romanization")?.trim() || undefined;
    const interventionId = params.get("intervention_id")?.trim().slice(0,200) || undefined;
    if(interventionId){
      try{
        const stored=JSON.parse(localStorage.getItem(INTERVENTION_MAP_KEY)??'{}') as Record<string,{id:string;at:string;type:string}>;
        stored[normalizedForm]={id:interventionId,at:new Date().toISOString(),type:params.get('source')==='asl'?'asl_root_family':'cross_product'};
        localStorage.setItem(INTERVENTION_MAP_KEY,JSON.stringify(Object.fromEntries(Object.entries(stored).slice(-500))));
      }catch{}
      recordSuiteEvent({product:'cursos',eventType:'cursos_intervention_received',targetLanguage:'fa',skill:'vocabulary',sourceItemId:normalizedForm,linguisticConcept:normalizedForm,interventionType:params.get('source')==='asl'?'asl_root_family':'cross_product',interventionId,metadata:{source:params.get('source')||'unknown'}});
    }
    setState((currentState) => {
      const existingIndex = currentState.words.findIndex((word) => courseWordKey(word.displayForm) === incomingKey);
      if (existingIndex >= 0) {
        const existing = currentState.words[existingIndex];
        if ((!definition || existing.definition === definition) && (!romanization || existing.romanization === romanization)) return currentState;
        const words = [...currentState.words];
        words[existingIndex] = {
          ...existing,
          definition: definition || existing.definition,
          romanization: romanization || existing.romanization,
        };
        return { ...currentState, words };
      }
      const now = new Date();
      const fsrsCard = createSerializedCard(now);
      const word: LexicalItem = {
        id: id(), displayForm, normalizedForm, definition, romanization,
        sourceType: "user", sourceWeek: currentState.weekNumber, tier: "B",
        knowledgeState: "learning", topic: "Cognis derivation",
        introducedAt: now.toISOString(), reviews: 0, correct: 0, lapses: 0,
        dueAt: fsrsCard.due, fsrsCard,
        modalityCards: { visual: fsrsCard, audio: createSerializedCard(), cloze: createSerializedCard() },
      };
      return { ...currentState, words: [...currentState.words, word] };
    });
    setTab("vocabulary");
    setStatus(`${displayForm} is in your Cursos vocabulary bank and can now appear in reviews, readings, and listenings.`);
    window.history.replaceState({}, "", window.location.pathname);
  }, [loaded]);

  const [clockNow,setClockNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClockNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
  const due=useMemo(()=>dueWords(state,reviewModality,new Date(clockNow)),[state,reviewModality,clockNow]);
  function sharedSelection(mode:PlanMode,plan:StudyPlan){return Object.fromEntries((['visual','audio','cloze'].includes(mode)?['visual','audio','cloze']:[mode]).map(skill=>[skill,{...plan,wordIds:[...plan.wordIds]}]));}
  function updatePlan(mode:PlanMode,plan:StudyPlan){setState(current=>({...current,studyPlans:{...current.studyPlans,...sharedSelection(mode,plan)}}));if(['visual','audio','cloze'].includes(mode))setLockedReviewForm(null);}
  function refreshTodayQueue(){setClockNow(Date.now());setStatus("Today refreshed. Completed reviews and today’s progress were kept.");}
  function planPicker(mode:PlanMode){const plan=state.studyPlans?.[mode];return <div className="plan-shortcut span-12"><span>{planLabels[mode]} · {plan?.enabled?`${plannedWords(state,mode).length} active words`:(mode==='reading'||mode==='listening'?'Choose vocabulary':'All due words')}</span><button onClick={()=>{setPlanMode(mode);setTab('vocabulary');window.scrollTo({top:0,behavior:'smooth'});}}>Edit plan in Vocabulary →</button></div>;}
  const current = reviewWord(state.words,due,lockedReviewForm);
  const allocation = useMemo(() => adaptiveAllocation(state), [state]);
  const trainingPhase = useMemo(() => currentTrainingPhase(state.weekNumber), [state.weekNumber]);
  const bottleneck = useMemo(() => dominantBottleneck(state), [state]);
  const mature = state.words.filter(word=>(["visual","audio","cloze"] as const).every(mode=>{const skill=word.modalityMastery?.[mode];return skill&&skill.reviews>=4&&skill.correct/skill.reviews>=0.9;})).length;
  const retention = state.reviews.length ? Math.round(100 * state.reviews.filter((review) => review.correct).length / state.reviews.length) : 0;
  const medianRecall = median(state.reviews.slice(-250).map((review) => review.responseMs));
  const latestPassage = state.passages.find((item) => item.id === activePassageId) ?? state.passages[0];
  const latestListening = state.listeningItems.find((item) => item.id === activeListeningId) ?? state.listeningItems[0];
  const focusedReadingQuestions = useMemo(() => latestPassage?.questions.filter((question) => question.type !== "detail") ?? [], [latestPassage?.questions]);
  const focusedListeningQuestions = useMemo(() => latestListening?.questions.filter((question) => question.type !== "detail") ?? [], [latestListening?.questions]);
  const transcriptRevealPercent = Math.min(100, transcriptRevealStep * 30);
  const transcriptVisible = transcriptRevealStep > 0;
  const listeningReveal = useMemo(
    () => latestListening ? progressiveListeningText(latestListening.transcriptFa, state.words, transcriptRevealPercent) : null,
    [latestListening, state.words, transcriptRevealPercent],
  );

  useEffect(() => {
    if(current&&current.normalizedForm!==lockedReviewForm)setLockedReviewForm(current.normalizedForm);
    setRevealed(false);
    setPlayedReviewWord('');
    setResponseMs(0);
    setPatternInput("");
    setPatternMatched(false);
    setPatternPhase("flash");
    startRef.current = Date.now();
    if (reviewModality !== "cloze" || !current) return;
    const timer = window.setTimeout(() => {
      startRef.current = Date.now();
      setPatternPhase("answer");
      window.requestAnimationFrame(() => patternInputRef.current?.focus());
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [current?.id, reviewModality, lockedReviewForm]);

  useEffect(() => {
    if (!latestListening || !isMeaningfulPersianText(latestListening.transcriptFa)) return;
    const speechText = sanitizePersianSpeechText(latestListening.transcriptFa);
    const alignedKey = `aligned-${latestListening.id}`;
    const listeningKey = `listening-${latestListening.id}`;

    // Start exact alignment as soon as the lesson exists, not when the learner
    // presses Start. The same narration can also satisfy normal listening.
    void prepareAlignedSpeech(speechText, alignedKey).then(async ({ audio }) => {
      speechCacheRef.current.set(listeningKey, audio);
      if ("caches" in window) {
        const cache = await caches.open("persian-audio-v2");
        await cache.put(speechCacheRequest(`v2-${listeningKey}`), new Response(audio, { headers: { "Content-Type": audio.type } }));
      }
    }).catch(() => {
      if (!latestListening.mediaUrl) {
        void prepareSpeech(speechText, listeningKey).catch(() => {
          // Device speech remains available when background audio cannot be prepared.
        });
      }
    });
  }, [latestListening?.id]);

  async function signIn(email: string, password: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? friendlyAccountError(error) : "Signed in. Your course is syncing now.");
  }

  async function signUp(username: string, email: string, password: string, classCode?:string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if(classCode&&!validClassCode(classCode)){setStatus('Check the class invite code before creating your account.');return;}
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, ...(classCode?{pending_class_code:normalizeClassCode(classCode)}:{}) } },
    });
    if (error) {
      setStatus(friendlyAccountError(error));
      return;
    }
    if (data.session && data.user) {
      try {
        await updateUsername(supabase, data.user, username);
      } catch (profileError) {
        setStatus(friendlyAccountError(profileError));
        return;
      }
    }
    if(data.session&&classCode){const {error:joinError}=await supabase.rpc('join_learning_class',{code:normalizeClassCode(classCode),learner_name:username});if(joinError){setStatus('Account created, but the class code could not be used. Check it with your teacher and retry in My classes.');return;}await supabase.auth.updateUser({data:{pending_class_code:null}});window.dispatchEvent(new Event('cursos-class-membership-change'));setStatus('Account created and class joined. Enable reading/listening sharing in classroom settings if you want those results included.');return;}
    setStatus(data.session ? "Account created. Your course is syncing now." : classCode?"Account created. Confirm your email, sign in, then complete Join class under My classes; your code will be filled in.":"Account created. Check your email once to confirm it, then sign in.");
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
  }

  async function resetPassword(email: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setStatus(error ? friendlyAccountError(error) : "Password reset link sent. Check your email.");
  }

  async function changePassword(password: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password });
    setStatus(error ? friendlyAccountError(error) : "Password updated.");
  }

  async function changeUsername(username: string) {
    const supabase = getSupabaseClient();
    if (!supabase || !cloudUser) return;
    try {
      await updateUsername(supabase, cloudUser, username);
      setCloudUsername(username);
      setStatus("Username updated.");
    } catch (error) {
      setStatus(friendlyAccountError(error));
    }
  }

  async function importWeek() {
    const parsed = parseWeeklyInput(input);
    if (!parsed.length) return;
    setStatus("Preparing weekly vocabulary…");
    const existing = new Set(state.words.map((word) => word.normalizedForm));
    const incoming = parsed.filter((word) => !existing.has(normalizePersian(word.displayForm)));

    let enriched = incoming;
    const missing = incoming.filter((word) => !word.definition || !word.romanization);
    if (missing.length) {
      try {
        const data = await generateJson({ kind: "define_words", words: missing.map((word) => word.displayForm) });
        const lookup = new Map<string, { definition?: string; romanization?: string }>(
          (data.words ?? []).map((word: { displayForm: string; definition: string; romanization: string }) => [normalizePersian(word.displayForm), word] as const),
        );
        enriched = incoming.map((word) => ({
          ...word,
          definition: word.definition ?? lookup.get(normalizePersian(word.displayForm))?.definition,
          romanization: word.romanization ?? lookup.get(normalizePersian(word.displayForm))?.romanization,
        }));
      } catch {
        // User-supplied definitions remain usable when AI is not configured.
      }
    }

    const makeWord = (
      displayForm: string,
      definition: string | undefined,
      romanization: string | undefined,
      sourceType: LexicalItem["sourceType"],
      topic?: string,
    ): LexicalItem => {
      const now = new Date();
      const fsrsCard = createSerializedCard(now);
      return {
        id: id(),
        displayForm,
        normalizedForm: normalizePersian(displayForm),
        definition,
        romanization,
        sourceType,
        sourceWeek: state.weekNumber,
        tier: sourceType === "system_advanced" ? "A" : "B",
        topic,
        introducedAt: now.toISOString(),
        reviews: 0,
        correct: 0,
        lapses: 0,
        dueAt: fsrsCard.due,
        fsrsCard,
        modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
      };
    };

    const newWords = [
      ...enriched.map((word) => makeWord(word.displayForm, word.definition, word.romanization, "course")),
    ];
    setState((currentState) => ({ ...currentState, words: [...currentState.words, ...newWords] }));
    setInput("");
    setShowIntake(false);
    setStatus(`Added ${enriched.length} words you supplied for Week ${state.weekNumber}.`);
  }

  async function importCourseWeek(targetWeek = state.weekNumber) {
    if (state.course.importedWeeks.includes(targetWeek)) return;
    setCourseBusy(true);
    setStatus(`Preparing Week ${targetWeek} course vocabulary…`);
    try {
      const entries = await loadCourseWeek(targetWeek);
      const existing = new Set(state.words.map((word) => courseWordKey(word.displayForm)));
      const incoming = entries.filter((entry) => {
        const key = courseWordKey(entry.fa);
        if (!key || existing.has(key)) return false;
        existing.add(key);
        return true;
      }).map((entry): LexicalItem => {
        const now = new Date();
        const fsrsCard = createSerializedCard(now);
        return {
          id: id(),
          displayForm: entry.fa,
          normalizedForm: normalizePersian(entry.fa),
          definition: entry.en,
          sourceType: "course",
          sourceWeek: targetWeek,
          tier: "B",
          knowledgeState: targetWeek < state.weekNumber ? "known" : "learning",
          courseEntryId: entry.id,
          courseListNumber: entry.list,
          courseLesson: entry.lesson,
          topic: entry.lesson,
          introducedAt: now.toISOString(),
          reviews: 0,
          correct: 0,
          lapses: 0,
          dueAt: fsrsCard.due,
          fsrsCard,
          modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
        };
      });

      setState((currentState) => ({
        ...currentState,
        course: {
          ...currentState.course,
          importedWeeks: [...new Set([...currentState.course.importedWeeks, targetWeek])].sort((a, b) => a - b),
        },
        words: [...currentState.words, ...incoming],
      }));
      const duplicates = entries.length - incoming.length;
      setStatus(`Week ${targetWeek} ready · all ${incoming.length} new words available today${duplicates ? ` · ${duplicates} repeats skipped` : ""}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Course vocabulary could not be loaded.");
    } finally {
      setCourseBusy(false);
    }
  }

  function addCourseEntries(chosen: CourseVocabularyEntry[], sourceLabel: string, targetPlan?:{mode:PlanMode;plan:StudyPlan;action:'replace'|'add'|'remove'}) {
    if (!chosen.length) return;
    const existingKeys = new Set(state.words.map((word) => courseWordKey(word.displayForm)));
    const addable = chosen.filter((entry) => {
      const key = courseWordKey(entry.fa);
      if (!key || existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    setState((currentState) => {
      const existing = new Set(currentState.words.map((word) => courseWordKey(word.displayForm)));
      const incoming = (targetPlan?.action==='remove'?[]:chosen).filter((entry) => {
        const key = courseWordKey(entry.fa);
        if (!key || existing.has(key)) return false;
        existing.add(key);
        return true;
      }).map((entry): LexicalItem => {
        const now = new Date();
        const fsrsCard = createSerializedCard(now);
        return {
          id: id(),
          displayForm: entry.fa,
          normalizedForm: normalizePersian(entry.fa),
          definition: entry.en,
          sourceType: "course",
          sourceWeek: entry.week,
          tier: "B",
          knowledgeState: entry.week < currentState.weekNumber ? "known" : "learning",
          courseEntryId: entry.id,
          courseListNumber: entry.list,
          courseLesson: entry.lesson,
          topic: entry.lesson,
          introducedAt: now.toISOString(),
          reviews: 0,
          correct: 0,
          lapses: 0,
          dueAt: fsrsCard.due,
          fsrsCard,
          modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
        };
      });
      const words=[...currentState.words,...incoming];
      if(targetPlan){
        const keys=new Set(chosen.map(entry=>courseWordKey(entry.fa)));
        const currentPlan=currentState.studyPlans?.[targetPlan.mode]??targetPlan.plan;
        const ids=new Set(targetPlan.action==='replace'?[]:currentPlan.wordIds);
        for(const word of words)if(keys.has(courseWordKey(word.displayForm))){if(targetPlan.action==='remove')ids.delete(word.id);else ids.add(word.id);}
        return {...currentState,words,studyPlans:{...currentState.studyPlans,...sharedSelection(targetPlan.mode,{...currentPlan,enabled:true,startedAt:new Date().toISOString(),wordIds:[...ids]})}};
      }
      return { ...currentState, words };
    });
    setStatus(targetPlan?`${planLabels[targetPlan.mode]} session ${targetPlan.action==='replace'?'started':targetPlan.action==='add'?'expanded':'updated'}. ${targetPlan.action==='remove'?'The words remain saved in your bank.':'It is ready on Today now.'}`:`${addable.length} ${sourceLabel} ${addable.length === 1 ? "word" : "words"} added${addable.length < chosen.length ? ` · ${chosen.length - addable.length} already in your bank` : ""}.`);
  }

  function addSelectedCourseWords(action:'add'|'replace'='add') {
    const chosen = courseCatalog.filter((entry) => selectedCourseEntries.has(entry.id));
    addCourseEntries(chosen, "course", { mode: planMode, plan: state.studyPlans?.[planMode] ?? { wordIds: [], enabled: false }, action });
    setSelectedCourseEntries(new Set());
  }

  function addSelectedCourseSections() {
    const chosen = courseCatalog.filter((entry) => selectedCourseSections.has(courseSectionLabel(entry.lesson)));
    addCourseEntries(chosen, "chapter", { mode: planMode, plan: state.studyPlans?.[planMode] ?? { wordIds: [], enabled: false }, action: "add" });
    setSelectedCourseSections(new Set());
  }

  function addSelectedNewsWords() {
    const chosen = NEWS_CATALOG.filter((word) => selectedNewsEntries.has(word.id));
    const existing = new Set(state.words.map((word) => courseWordKey(word.displayForm)));
    const addable = chosen.filter((word) => {
      const key = courseWordKey(word.displayForm);
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    setState((currentState) => {
      const currentKeys = new Set(currentState.words.map((word) => courseWordKey(word.displayForm)));
      const now = new Date();
      const incoming = addable.filter((word) => !currentKeys.has(courseWordKey(word.displayForm))).map((word): LexicalItem => {
        const fsrsCard = createSerializedCard(now);
        return {
          ...word,
          id: id(),
          introducedAt: now.toISOString(),
          dueAt: fsrsCard.due,
          fsrsCard,
          modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
        };
      });
      const words = [...currentState.words, ...incoming];
      const keys = new Set(chosen.map((word) => courseWordKey(word.displayForm)));
      const currentPlan = currentState.studyPlans?.[planMode] ?? { wordIds: [], enabled: false };
      const planIds = new Set(currentPlan.wordIds);
      for (const word of words) if (keys.has(courseWordKey(word.displayForm))) planIds.add(word.id);
      return { ...currentState, words, studyPlans: { ...currentState.studyPlans, ...sharedSelection(planMode,{ ...currentPlan, enabled: true, startedAt: currentPlan.startedAt ?? now.toISOString(), wordIds: [...planIds] }) } };
    });
    setSelectedNewsEntries(new Set());
    setStatus(`${chosen.length} news ${chosen.length === 1 ? "word" : "words"} added to the ${planLabels[planMode]} session${addable.length < chosen.length ? ` · ${chosen.length - addable.length} already in your bank` : ""}.`);
  }

  function removeWord(normalizedForm: string) {
    const removed = state.words.find((word) => word.normalizedForm === normalizedForm);
    if (!removed) return;
    setState((currentState) => ({
      ...currentState,
      words: currentState.words.filter((word) => word.normalizedForm !== normalizedForm),
    }));
    const client = getSupabaseClient();
    if (removed.sourceType === "user" && client && cloudUser) {
      void deletePlatformVocabulary(client, cloudUser, normalizedForm).catch((error) => {
        console.error(error);
        setStatus("The word was removed here, but cloud removal needs another try.");
      });
    }
    setStatus(`${removed.displayForm} removed from your vocabulary bank.`);
  }

  function removeWordsFromBank(normalizedForms:Set<string>,label:string) {
    if (!normalizedForms.size) return;
    let removedCount=0;
    setState((currentState) => {
      const removedIds=new Set(currentState.words.filter(word=>normalizedForms.has(word.normalizedForm)).map(word=>word.id));
      removedCount=removedIds.size;
      const studyPlans=Object.fromEntries(Object.entries(currentState.studyPlans??{}).map(([mode,plan])=>[mode,plan?{...plan,wordIds:plan.wordIds.filter(id=>!removedIds.has(id))}:plan]));
      return {...currentState,words:currentState.words.filter(word=>!removedIds.has(word.id)),studyPlans};
    });
    setStatus(`${label} removed from your bank and active sessions. Completed review history was kept.`);
  }

  function removeSelectedCourseWords() {
    const chosen=courseCatalog.filter(entry=>selectedCourseEntries.has(entry.id));
    addCourseEntries(chosen,'course',{mode:planMode,plan:state.studyPlans?.[planMode]??{wordIds:[],enabled:false},action:'remove'});
    setSelectedCourseEntries(new Set());
  }

  function removeSelectedNewsWords() {
    const keys=new Set(NEWS_CATALOG.filter(word=>selectedNewsEntries.has(word.id)).map(word=>courseWordKey(word.displayForm)));
    const forms=new Set(state.words.filter(word=>keys.has(courseWordKey(word.displayForm))).map(word=>word.normalizedForm));
    removeWordsFromBank(forms,`${forms.size} news ${forms.size===1?'word':'words'}`);
    setSelectedNewsEntries(new Set());
  }

  function reveal() {
    if(reviewModality==='audio'&&playedReviewWord!==current?.id)return;
    setResponseMs(Date.now() - startRef.current);
    setRevealed(true);
  }

  function submitPatternAnswer() {
    if (!current || !patternInput.trim()) return;
    setResponseMs(Date.now() - startRef.current);
    setPatternMatched(answerMatchesDefinition(patternInput, patternHints(current.displayForm)[0]?.rule??current.definition));
    setPatternPhase("result");
  }

  async function playCurrentWord() {
    if (!current) return;
    try {
      const cacheKey = `word-${current.id}`;
      const cached = await readCachedSpeech(cacheKey);
      if (!cached && playWithDeviceVoice(current.displayForm)) {
        setPlayedReviewWord(current.id);
        setStatus("Playing with the device’s Persian voice.");
        return;
      }
      const blob = cached ?? await prepareSpeech(current.displayForm, cacheKey);
      await playAudioBlob(blob);
      setPlayedReviewWord(current.id);
      setStatus("Playing word audio.");
    } catch (error) {
      if (!playWithDeviceVoice(current.displayForm)) {
        setStatus(error instanceof Error ? error.message : "Word audio is unavailable on this device.");
        return;
      }
      setStatus("Playing with the device’s Persian voice.");
      setPlayedReviewWord(current.id);
    }
  }

  async function rateKnown(correct: boolean) {
    if (!current) return;
    if(reviewModality==='audio'&&playedReviewWord!==current.id)return;
    const submissionKey = [current.id, reviewModality, current.modalityCards?.[reviewModality]?.reps ?? 0, current.modalityCards?.[reviewModality]?.due ?? 'new'].join(':');
    if (submittedReview.current === submissionKey) return;
    submittedReview.current = submissionKey;
    const measured = responseMs || Date.now() - startRef.current;
    // A learner's explicit correctness judgment should determine the schedule.
    // Response time remains useful analytics, but must not turn a correct answer
    // into a short-term "hard" card that reappears during the same session.
    const rating: ReviewRating = correct ? "good" : "again";
    const { before, after } = reviewFsrs(current.modalityCards?.[reviewModality], rating, new Date());
    const event: ReviewEvent = {
      id: id(),
      lexicalItemId: current.id,
      reviewedAt: new Date().toISOString(),
      correct,
      responseMs: measured,
      rating,
      modality: reviewModality,
      schedulerBefore: before,
      schedulerAfter: after,
      timerWindowMs: reviewModality === "cloze" ? 3_000 : 15_000,
      hintUsed: false,
      context: reviewModality === "cloze" ? "pattern-recall" : "timed-recall",
    };
    setState((currentState) => ({
      ...currentState,
      reviews: [...currentState.reviews, event],
      words: currentState.words.map((word) => word.id !== current.id ? word : {
        ...word,
        modalityMastery: {
          ...word.modalityMastery,
          [reviewModality]: {
            reviews: (word.modalityMastery?.[reviewModality]?.reviews ?? 0) + 1,
            correct: (word.modalityMastery?.[reviewModality]?.correct ?? 0) + (correct ? 1 : 0),
            medianResponseMs: median([
              ...currentState.reviews.filter((review) => review.lexicalItemId === word.id && review.modality === reviewModality).map((review) => review.responseMs),
              measured,
            ]),
          },
        },
        modalityCards: { ...word.modalityCards, [reviewModality]: after },
        knowledgeState: !correct
          ? "new"
          : (["visual","audio","cloze"] as const).every(mode=>{const attempts=[...currentState.reviews,event].filter(item=>item.lexicalItemId===word.id&&item.modality===mode).slice(-5);return attempts.length===5&&attempts.every(item=>item.correct&&item.responseMs<=3000);})
            ? "automatic"
            : (["visual","audio","cloze"] as const).every(mode=>{const attempts=[...currentState.reviews,event].filter(item=>item.lexicalItemId===word.id&&item.modality===mode).slice(-1);return attempts.length===1&&attempts.every(item=>item.correct&&item.responseMs<15000);})
              ? "known"
              : "learning",
        reviews: word.reviews + 1,
        correct: word.correct + (correct ? 1 : 0),
        lapses: after.lapses,
        medianResponseMs: median([...currentState.reviews.filter((review) => review.lexicalItemId === word.id).map((review) => review.responseMs), measured]),
        dueAt: after.due,
        stability: after.stability,
        difficulty: after.difficulty,
        fsrsCard: after,
      }),
    }));
    const client = getSupabaseClient();
    if (client && cloudUser) appendCloudReview(client, cloudUser, event).catch(console.error);
    let linkedIntervention:{id:string;type:string}|undefined;
    try{const stored=JSON.parse(localStorage.getItem(INTERVENTION_MAP_KEY)??'{}') as Record<string,{id:string;type:string}>;linkedIntervention=stored[current.normalizedForm];}catch{}
    recordSuiteEvent({
      product:'cursos',eventType:'vocabulary_review',targetLanguage:'fa',skill:'vocabulary',
      sourceItemId:current.id,linguisticConcept:current.normalizedForm,correctness:correct,responseMs:measured,
      interventionType:linkedIntervention?.type,interventionId:linkedIntervention?.id,
      attemptNumber:current.reviews+1,courseWeek:state.weekNumber,topic:current.topic,
      metadata:{modality:reviewModality,rating,knowledgeState:current.knowledgeState},
    });
    setLockedReviewForm(nextReviewWord(due,current.id)?.normalizedForm??null);
  }

  function changeReviewModality(mode:Extract<ReviewModality,"visual"|"audio"|"cloze">){
    setLockedReviewForm(null);
    setReviewModality(mode);
  }

  function practiceGenerationContext(kind: "reading" | "listening", source: PracticeSource, currentState = latestState.current): PracticeGenerationContext {
    const planned = plannedWords(currentState, kind);
    const bank = source === "selected"
      ? focusedSelectedPracticeWords(planned)
      : topicPracticeWords(practiceTopic[kind], courseCatalog, NEWS_CATALOG);
    const words = bank.map((entry) => entry.word);
    const targetIlr = currentState.skillLevels[kind];
    const knownKeys = new Set(currentState.words
      .filter((word) => word.knowledgeState === "known" || word.knowledgeState === "automatic")
      .map((word) => normalizePersian(word.displayForm)));
    const knownWords = words.filter((word) => knownKeys.has(normalizePersian(word)));
    const practiceMode: PracticeMode = source === "selected" ? "controlled" : "transfer";
    const fingerprint = {
      kind,
      topic: practiceTopic[kind],
      weekNumber: currentState.weekNumber,
      targetIlr,
      practiceMode,
      practiceSource: source,
      register: practiceRegister[kind],
      targetWords: words,
      wordDefinitions: bank,
      knownWords,
    };
    return {
      key: practicePrefetchKey(fingerprint),
      kind,
      targetIlr,
      practiceMode,
      practiceSource: source,
      words,
      request: {
        ...fingerprint,
        previousTitles: (kind === "reading" ? currentState.passages : currentState.listeningItems)
          .slice(-10)
          .map((item) => item.title),
      },
    };
  }

  async function fetchPreparedPractice(context: PracticeGenerationContext, request = context.request): Promise<PreparedPractice> {
    const startedAt=performance.now();
    let data:GeneratedPractice;
    try{data=await generateJson(request) as GeneratedPractice;}
    catch(error){
      const latencyMs=Math.round(performance.now()-startedAt);
      recordSuiteEvent({product:'cursos',eventType:'generation_quality',targetLanguage:'fa',skill:context.kind,sourceItemId:context.key,sourceKind:context.practiceMode,register:practiceRegister[context.kind],courseWeek:latestState.current.weekNumber,topic:practiceTopic[context.kind],responseMs:latencyMs,metadata:{releaseStatus:'rejected',issueCode:error instanceof Error&&/time/i.test(error.message)?'timeout':'quality_or_service_failure'}});
      if(cloudUser){const client=getSupabaseClient();if(client)void client.from('generation_quality_runs').insert({user_id:cloudUser.id,product:'cursos',modality:context.kind,item_id:context.key,model:'server-configured',source_kind:context.practiceMode,register:practiceRegister[context.kind],latency_ms:latencyMs,schema_valid:false,release_status:'rejected',issue_codes:[error instanceof Error&&/time/i.test(error.message)?'timeout':'quality_or_service_failure']}).then(({error:saveError})=>{if(saveError&&!['42P01','PGRST205'].includes(saveError.code))console.error('Generation QA sync failed',saveError.code);});}
      throw error;
    }
    if (!isMeaningfulPersianText(data.textFa)) throw new Error(`The generated ${context.kind} item had no valid Persian text. Please try again.`);
    const latencyMs=Math.round(performance.now()-startedAt);
    const fingerprint=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${data.title}\n${data.textFa}`)).then(value=>Array.from(new Uint8Array(value)).map(byte=>byte.toString(16).padStart(2,'0')).join(''));
    recordSuiteEvent({product:'cursos',eventType:'generation_quality',targetLanguage:'fa',skill:context.kind,sourceItemId:context.key,sourceKind:context.practiceMode,register:data.register,courseWeek:latestState.current.weekNumber,topic:data.topic,responseMs:latencyMs,metadata:{releaseStatus:'learner_visible',schemaValid:true,vocabularyValid:true,grammarValid:true,registerValid:true,questionEvidenceValid:true,answerKeyValid:true,duplicateFree:true,contentHash:fingerprint}});
    if(cloudUser){const client=getSupabaseClient();if(client)void client.from('generation_quality_runs').insert({user_id:cloudUser.id,product:'cursos',modality:context.kind,item_id:context.key,content_hash:fingerprint,model:'server-configured',source_kind:context.practiceMode,register:data.register,latency_ms:latencyMs,schema_valid:true,vocabulary_valid:true,grammar_valid:true,register_valid:true,question_evidence_valid:true,answers_valid:true,duplicate_free:true,provenance_valid:true,release_status:'learner_visible',issue_codes:[],content_payload:{title:data.title,textFa:data.textFa,topic:data.topic,register:data.register,questions:data.questions}}).then(({error})=>{if(error&&!['42P01','PGRST205'].includes(error.code))console.error('Generation QA sync failed',error.code);});}
    const selectedContextKeys = new Set(context.words.map((word) => normalizePersian(word)));
    const reportedWords = Array.isArray(data.knownWordsUsed) ? data.knownWordsUsed : context.words.slice(0, 12);
    const reportedSelectedWords = reportedWords
      .filter((word): word is string => typeof word === "string")
      .filter((word) => selectedContextKeys.has(normalizePersian(word)));
    const generatedTargets = (reportedSelectedWords.length ? reportedSelectedWords : context.words.slice(0, 12)).slice(0, 16);
    const generatedWordCount = data.textFa.trim().split(/\s+/).filter(Boolean).length;
    const supportingWords = Array.isArray(data.newWordsIntroduced)
      ? data.newWordsIntroduced.filter((word): word is string => typeof word === "string")
      : [];
    return { data, targetIlr: context.targetIlr, practiceMode: context.practiceMode, words: context.words, generatedTargets, generatedWordCount, supportingWords };
  }

  async function fetchBackgroundPractice(context: PracticeGenerationContext, request = context.request) {
    // Background preparation can retry rejected drafts without extending the
    // learner's visible wait. Each attempt still passes the complete API gate.
    return loadPracticeWithRetries(() => fetchPreparedPractice(context, request));
  }

  function activatePreparedPractice(kind: "reading" | "listening", prepared: PreparedPractice) {
    const { data, targetIlr, practiceMode, generatedTargets, generatedWordCount, supportingWords } = prepared;
    const unknownCount = supportingWords.length;
    if (kind === "reading") {
      const passage: Passage = {
        id: id(),
        title: data.title,
        textFa: data.textFa,
        ilrEstimate: targetIlr,
        topic: data.topic,
        register: data.register,
        genre: practiceMode === "transfer" ? "fresh transfer" : "controlled coverage",
        sourceType: "generated",
        practiceMode,
        wordCount: generatedWordCount,
        unknownTokenRatio: generatedWordCount ? Number((unknownCount / generatedWordCount).toFixed(3)) : 0,
        targetWords: generatedTargets,
        supportingWords,
        questions: data.questions ?? [],
        createdAt: new Date().toISOString(),
      };
      setState((currentState) => ({ ...currentState, passages: [...currentState.passages, passage] }));
      setActivePassageId(passage.id);
      setReadingStartedAt(null);
      setReadingDurationMs(0);
      setReadingQuestionsOpen(false);
      setSentenceGists([]);
      setReadingUnknown(0);
      setReadingRereads(0);
    } else {
      const item: ListeningItem = {
        id: id(),
        title: data.title,
        transcriptFa: data.textFa,
        ilrEstimate: targetIlr,
        topic: data.topic,
        register: data.register,
        genre: practiceMode === "transfer" ? "fresh transfer" : "controlled coverage",
        sourceType: "generated",
        practiceMode,
        wordCount: generatedWordCount,
        unknownTokenRatio: generatedWordCount ? Number((unknownCount / generatedWordCount).toFixed(3)) : 0,
        targetWords: generatedTargets,
        supportingWords,
        questions: data.questions ?? [],
        createdAt: new Date().toISOString(),
      };
      setState((currentState) => ({ ...currentState, listeningItems: [...currentState.listeningItems, item] }));
      setActiveListeningId(item.id);
      setListensCount(0);
      setListeningGists([]);
      setGistSentenceListenCounts([]);
      setGistAnsweredAfterListens([]);
      setGistHintedSentenceIndexes([]);
      setRapidCaptionListens(0);
      setRapidCaptionWord("");
      setTranscriptRevealStep(0);
      void prepareSpeech(item.transcriptFa, `listening-${item.id}`).catch(() => {
        // The device voice is the no-wait fallback if this background request fails.
      });
    }
  }

  function prepareNextPractice(context: PracticeGenerationContext, currentTitle: string) {
    const previousTitles = [
      ...((context.request.previousTitles as string[] | undefined) ?? []),
      currentTitle,
    ].slice(-10);
    void practicePrefetchRef.current[context.kind].prepare(
      context.key,
      () => fetchBackgroundPractice(context, { ...context.request, previousTitles }),
    );
  }

  async function generatePractice(kind: "reading" | "listening") {
    if (generationBusy) return;
    const currentState = latestState.current;
    const source = practiceSource[kind];
    if (!currentState.words.length) {
      if (source === "selected") {
        setTab("vocabulary");
        setStatus("Choose some vocabulary first, or switch Generation source to Topic bank + news.");
        return;
      }
    }
    if (source === "topic" && !courseCatalog.length) {
      setStatus("The topic vocabulary bank is still loading. Try again in a moment.");
      return;
    }
    const context = practiceGenerationContext(kind, source, currentState);
    if (!context.words.length) {
      setStatus(source === "selected" ? "Choose an active vocabulary plan before generating practice." : "No verified vocabulary is available for that topic yet.");
      return;
    }
    setGenerationBusy(kind);
    setStatus(`Generating ${source === "topic" ? "topic" : "selected-word"} ${kind}…`);
    try {
      const cache = practicePrefetchRef.current[kind];
      let prepared = cache.take(context.key);
      if (!prepared) prepared = await cache.waitAndTake(context.key);
      if (!prepared) prepared = await fetchPreparedPractice(context);
      activatePreparedPractice(kind, prepared);
      prepareNextPractice(context, prepared.data.title);
      setStatus(`${source === "topic" ? "Topic" : "Selected-word"} ${kind} ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerationBusy(null);
    }
  }

  useEffect(() => {
    if (!loaded || generationBusy || (tab !== "reading" && tab !== "listening")) return;
    const kind = tab;
    const currentState = latestState.current;
    const source = practiceSource[kind];
    if ((source === "selected" && !currentState.words.length) || (source === "topic" && !courseCatalog.length)) return;
    const context = practiceGenerationContext(kind, source, currentState);
    if (!context.words.length) return;
    void practicePrefetchRef.current[kind].prepare(
      context.key,
      () => fetchBackgroundPractice(context),
    );
  }, [loaded, tab, generationBusy, practiceTopic, practiceRegister, practiceSource, courseCatalog, state.weekNumber, state.skillLevels, state.words, state.studyPlans]);

  function finishReading() {
    if (!readingStartedAt) return;
    setReadingDurationMs(Date.now() - readingStartedAt);
    setReadingQuestionsOpen(true);
  }

  function completeReading(result: GradingResult) {
    if (!latestPassage || !readingDurationMs) return;
    const attempt: PassageAttempt = {
      id: id(),
      passageId: latestPassage.id,
      questionTypes: activeReadingQuestions.map(question => question.type),
      attemptedAt: new Date().toISOString(),
      durationMs: readingDurationMs,
      comprehensionScore: result.grade.overallScore,
      inferenceScore: result.grade.inferenceScore,
      discourseScore: result.grade.discourseScore,
      unknownWordCount: readingUnknown,
      rereads: readingRereads,
      answers: result.answers,
      grade: result.grade,
      gradingMode: result.gradingMode,
      firstPass: true,
      errorCategories: result.grade.failureTypes,
      readingMode,
      maskedPercent: readingMode === "inference" ? 30 : 0,
      sentenceGists: readingMode === "inference" ? sentenceGists : undefined,
    };
    setState((currentState) => ({ ...currentState, passageAttempts: [...currentState.passageAttempts, attempt] }));
    activeReadingQuestions.forEach((question,index)=>{
      const graded=result.grade.answers?.find(answer=>answer.questionIndex===index);
      recordSuiteEvent({
        product:'cursos',eventType:'reading_answer',targetLanguage:'fa',skill:'reading',sourceItemId:latestPassage.id,
        linguisticConcept:question.type,correctness:graded?graded.score>=70:undefined,
        responseMs:Math.round(readingDurationMs/Math.max(1,activeReadingQuestions.length)),attemptNumber:1,
        supportsUsed:[readingMode==='inference'?'masked_text':'full_text',...(readingRereads?['reread']:[])],
        sourceKind:latestPassage.sourceType,register:latestPassage.register,difficulty:latestPassage.ilrEstimate,
        courseWeek:state.weekNumber,topic:latestPassage.topic,
        metadata:{questionType:question.type,score:graded?.score??result.grade.overallScore,gradingMode:result.gradingMode,unknownWordCount:readingUnknown},
      });
    });
    setReadingStartedAt(null);
    setReadingDurationMs(0);
    setSentenceGists([]);
    setStatus(`Reading saved · ${result.grade.overallScore}% comprehension. Adaptive allocation updated.`);
  }

  async function playListening() {
    if (!latestListening || audioBusy) return;
    if (!isMeaningfulPersianText(latestListening.transcriptFa)) {
      setStatus("That saved Listening item has an invalid transcript. Creating a clean replacement…");
      await generatePractice("listening");
      return;
    }
    const speechText = sanitizePersianSpeechText(latestListening.transcriptFa);
    setAudioBusy(true);
    setStatus("Starting Persian audio…");
    try {
      if (latestListening.mediaUrl) {
        releasePlayback();
        const audio = new Audio(latestListening.mediaUrl);
        playbackRef.current = audio;
        audio.preload = "auto";
        audio.volume = 1;
        await audio.play();
        setListensCount((count) => count + 1);
        setStatus("Playing source audio.");
        return;
      }
      const cacheKey = `listening-${latestListening.id}`;
      const cached = await readCachedSpeech(cacheKey);
      if (!cached && playWithDeviceVoice(speechText)) {
        setListensCount((count) => count + 1);
        setStatus("Playing with the device’s Persian voice. Studio audio is caching in the background.");
        return;
      }
      const blob = cached ?? await prepareSpeech(speechText, cacheKey);
      await playAudioBlob(blob);
      setListensCount((count) => count + 1);
      setStatus("Playing Persian audio.");
    } catch (error) {
      if (playWithDeviceVoice(speechText)) {
        setListensCount((count) => count + 1);
        setStatus("Playing with the device’s Persian voice.");
      } else {
        setStatus(error instanceof Error ? error.message : "Persian audio is unavailable. Try again in a moment.");
      }
    } finally {
      setAudioBusy(false);
    }
  }

  async function playGistSentence(index: number) {
    if (!latestListening || audioBusy || (gistSentenceListenCounts[index] ?? 0) >= 2) return;
    const sentence = persianSentences(latestListening.transcriptFa)[index];
    if (!sentence) return;
    const speechText = sanitizePersianSpeechText(sentence);
    const cacheKey = `gist-${latestListening.id}-${index}`;
    setAudioBusy(true);
    setStatus(`Starting sentence ${index + 1}…`);
    try {
      const cached = await readCachedSpeech(cacheKey);
      if (cached) await playAudioBlob(cached);
      else if (playWithDeviceVoice(speechText)) {
        void prepareSpeech(speechText, cacheKey).catch(() => {
          // The device voice keeps the first play immediate if studio audio is slow.
        });
      } else {
        await playAudioBlob(await prepareSpeech(speechText, cacheKey));
      }
      setGistSentenceListenCounts((current) => Array.from(
        { length: persianSentences(latestListening.transcriptFa).length },
        (_, sentenceIndex) => sentenceIndex === index ? (current[sentenceIndex] ?? 0) + 1 : (current[sentenceIndex] ?? 0),
      ));
      setListensCount((count) => count + 1);
      setStatus(`Sentence ${index + 1} played. Capture only its main idea.`);
    } catch (error) {
      if (playWithDeviceVoice(speechText)) {
        setGistSentenceListenCounts((current) => Array.from(
          { length: persianSentences(latestListening.transcriptFa).length },
          (_, sentenceIndex) => sentenceIndex === index ? (current[sentenceIndex] ?? 0) + 1 : (current[sentenceIndex] ?? 0),
        ));
        setListensCount((count) => count + 1);
        setStatus(`Sentence ${index + 1} played with the device voice.`);
      } else setStatus(error instanceof Error ? error.message : "Sentence audio is unavailable.");
    } finally {
      setAudioBusy(false);
    }
  }

  function finishRapidListen() {
    setListensCount((count) => count + 1);
    setRapidCaptionListens((count) => count + 1);
    setStatus("Rapid Captions complete.");
    releasePlayback();
  }

  async function playRapidAudioElement(audio: HTMLAudioElement, timings: TimedCaption[], objectUrl?: string) {
    releasePlayback();
    let finished = false;
    let lastWord = "";
    let timingIndex = -1;
    playbackRef.current = audio;
    playbackUrlRef.current = objectUrl ?? null;
    audio.preload = "auto";
    audio.volume = 1;
    audio.onended = () => {
      if (finished) return;
      finished = true;
      const remaining=nextCaption(timings,timingIndex,Infinity);
      if(remaining.word) setRapidCaptionWord(remaining.word);
      window.setTimeout(()=>{if(playbackRef.current===audio) finishRapidListen();},Math.max(400,(remaining.index-timingIndex)*200));
    };
    audio.onerror = () => {
      if (finished) return;
      finished = true;
      releasePlayback();
      setStatus("That audio could not be played. Try again.");
    };
    setRapidPlaying(true);
    const updateCaption = () => {
      const now = audio.currentTime;
      const next=nextCaption(timings,timingIndex,now);
      timingIndex=next.index;
      const word=next.word;
      if (word !== null) {
        lastWord = word;
        setRapidCaptionWord(word);
      }
      if (!audio.ended) rapidFrameRef.current = window.requestAnimationFrame(updateCaption);
    };
    rapidFrameRef.current = window.requestAnimationFrame(updateCaption);
    await audio.play();
    setStatus("Playing with one-word Persian captions.");
  }

  async function playRapidListening() {
    if (!latestListening || audioBusy || rapidPlaying) return;
    const speechText = sanitizePersianSpeechText(latestListening.transcriptFa);
    const cacheKey = `aligned-v2-${latestListening.id}-${speechText}`;
    setAudioBusy(true);
    setStatus("Aligning every word to the audio…");
    try {
      const { audio, timings } = await prepareAlignedSpeech(speechText, cacheKey);
      const url = URL.createObjectURL(audio);
      await playRapidAudioElement(new Audio(url), timings, url);
    } catch (error) {
      releasePlayback();
      setStatus(error instanceof Error ? error.message : "Exact word timing is unavailable.");
    } finally {
      setAudioBusy(false);
    }
  }

  function updateListeningGist(index: number, value: string) {
    setListeningGists((current) => {
      const next = Array.from({ length: persianSentences(latestListening?.transcriptFa ?? "").length }, (_, sentenceIndex) => (
        sentenceIndex === index ? value : (current[sentenceIndex] ?? "")
      ));
      if (!current[index]?.trim() && value.trim()) {
        setGistAnsweredAfterListens((counts) => Array.from(
          { length: next.length },
          (_, sentenceIndex) => sentenceIndex === index ? (gistSentenceListenCounts[index] ?? 0) : (counts[sentenceIndex] ?? 0),
        ));
      }
      return next;
    });
  }

  function completeListening(result: GradingResult) {
    if (!latestListening || listensCount === 0) return;
    const attempt: ListeningAttempt = {
      id: id(),
      listeningItemId: latestListening.id,
      questionTypes: activeListeningQuestions.map(question => question.type),
      attemptedAt: new Date().toISOString(),
      listensCount,
      comprehensionScore: result.grade.overallScore,
      detailScore: result.grade.detailScore,
      inferenceScore: result.grade.inferenceScore,
      transcriptRevealed: transcriptVisible,
      answers: result.answers,
      grade: result.grade,
      gradingMode: result.gradingMode,
      firstPass: listeningMode === "gist"
        ? gistAnsweredAfterListens.length > 0 && gistAnsweredAfterListens.every((count) => count === 1) && gistHintedSentenceIndexes.length === 0
        : !transcriptVisible,
      errorCategories: result.grade.failureTypes,
      listeningMode,
      sentenceGists: listeningMode === "gist" ? listeningGists : undefined,
      sentenceListenCounts: listeningMode === "gist" ? gistSentenceListenCounts : undefined,
      gistAnsweredAfterListens: listeningMode === "gist" ? gistAnsweredAfterListens : undefined,
      gistHintedSentenceIndexes: listeningMode === "gist" ? gistHintedSentenceIndexes : undefined,
    };
    setState((currentState) => ({ ...currentState, listeningAttempts: [...currentState.listeningAttempts, attempt] }));
    activeListeningQuestions.forEach((question,index)=>{
      const graded=result.grade.answers?.find(answer=>answer.questionIndex===index);
      recordSuiteEvent({
        product:'cursos',eventType:'listening_answer',targetLanguage:'fa',skill:'listening',sourceItemId:latestListening.id,
        linguisticConcept:question.type,correctness:graded?graded.score>=70:undefined,attemptNumber:1,
        supportsUsed:[...(transcriptVisible?['transcript']:[]),...(listensCount>1?['replay']:[]),...(gistHintedSentenceIndexes.length?['vocabulary_hint']:[])],
        sourceKind:latestListening.sourceType,register:latestListening.register,difficulty:latestListening.ilrEstimate,
        courseWeek:state.weekNumber,topic:latestListening.topic,
        metadata:{questionType:question.type,score:graded?.score??result.grade.overallScore,gradingMode:result.gradingMode,listensCount,listeningMode},
      });
    });
    setStatus(listeningMode === "gist"
      ? `Gist listening saved · ${result.grade.overallScore}% comprehension · ${gistAnsweredAfterListens.filter((count) => count === 1).length}/${listeningGists.length} captured after one listen · ${gistHintedSentenceIndexes.length} vocabulary aids.`
      : `Listening saved · ${result.grade.overallScore}% comprehension after ${listensCount} listen${listensCount === 1 ? "" : "s"}.`);
  }

  function addAnkiWords(rows: AnkiVocabularyRow[]) {
    const existing = new Set(state.words.map((word) => word.normalizedForm));
    const incoming = rows.filter((row) => {
      const normalized = normalizePersian(row.displayForm);
      if (!normalized || existing.has(normalized)) return false;
      existing.add(normalized);
      return true;
    }).map((row): LexicalItem => {
      const now = new Date();
      const fsrsCard = createSerializedCard(now);
      return {
        id: id(),
        displayForm: row.displayForm,
        normalizedForm: normalizePersian(row.displayForm),
        definition: row.definition,
        romanization: row.romanization,
        sourceType: "user",
        sourceWeek: state.weekNumber,
        tier: "B",
        topic: "anki",
        introducedAt: now.toISOString(),
        reviews: 0,
        correct: 0,
        lapses: 0,
        dueAt: fsrsCard.due,
        fsrsCard,
        modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
      };
    });
    if (incoming.length) setState((currentState) => ({ ...currentState, words: [...currentState.words, ...incoming] }));
    return incoming.length;
  }

  function addAnkiReviews(rows: AnkiReviewRow[]) {
    const wordByForm = new Map(state.words.map((word) => [word.normalizedForm, word]));
    const existing = new Set(state.reviews.map((review) => review.id));
    const events = rows.flatMap((row): ReviewEvent[] => {
      const word = wordByForm.get(normalizePersian(row.displayForm));
      const eventId = `anki-${row.externalId}`;
      if (!word || existing.has(eventId)) return [];
      existing.add(eventId);
      return [{
        id: eventId,
        lexicalItemId: word.id,
        reviewedAt: row.reviewedAt,
        correct: row.correct,
        responseMs: row.responseMs,
        rating: row.rating,
        modality: "visual",
      }];
    });
    if (!events.length) return 0;
    const byWord = new Map<string, ReviewEvent[]>();
    events.forEach((event) => byWord.set(event.lexicalItemId, [...(byWord.get(event.lexicalItemId) ?? []), event]));
    setState((currentState) => ({
      ...currentState,
      reviews: [...currentState.reviews, ...events],
      words: currentState.words.map((word) => {
        const imported = byWord.get(word.id);
        if (!imported?.length) return word;
        const latencies = [...currentState.reviews.filter((review) => review.lexicalItemId === word.id).map((review) => review.responseMs), ...imported.map((review) => review.responseMs)];
        return {
          ...word,
          reviews: word.reviews + imported.length,
          correct: word.correct + imported.filter((event) => event.correct).length,
          lapses: word.lapses + imported.filter((event) => !event.correct).length,
          medianResponseMs: median(latencies),
        };
      }),
    }));
    return events.length;
  }

  function addSpeakingPrompt(prompt: SpeakingPrompt) {
    setState((currentState) => ({ ...currentState, speakingPrompts: [...currentState.speakingPrompts, prompt] }));
  }

  function addSpeakingAttempt(attempt: SpeakingAttempt) {
    setState((currentState) => ({ ...currentState, speakingAttempts: [...currentState.speakingAttempts, attempt] }));
  }

  async function setWordKnowledge(displayForm: string, knowledgeState: WordKnowledgeState) {
    const normalizedForm = normalizePersian(displayForm);
    const existingBeforeUpdate = state.words.find((word) => word.normalizedForm === normalizedForm);
    const due = new Date();
    if (knowledgeState === "known") due.setDate(due.getDate() + 30);
    if (knowledgeState === "automatic") due.setDate(due.getDate() + 180);
    setState((currentState) => {
      const existing = currentState.words.find((word) => word.normalizedForm === normalizedForm);
      if (existing) {
        return {
          ...currentState,
          words: currentState.words.map((word) => word.id !== existing.id ? word : {
            ...word,
            knowledgeState,
            dueAt: due.toISOString(),
            fsrsCard: word.fsrsCard ? { ...word.fsrsCard, due: due.toISOString() } : createSerializedCard(due),
            modalityCards: { ...word.modalityCards, visual: { ...(word.modalityCards?.visual??createSerializedCard()), due: due.toISOString() } },
          }),
        };
      }
      const fsrsCard = createSerializedCard(due);
      const word: LexicalItem = {
        id: id(),
        displayForm,
        normalizedForm,
        sourceType: "user",
        sourceWeek: currentState.weekNumber,
        tier: "C",
        knowledgeState,
        introducedAt: new Date().toISOString(),
        reviews: 0,
        correct: 0,
        lapses: 0,
        dueAt: fsrsCard.due,
        fsrsCard,
        modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
      };
      return { ...currentState, words: [...currentState.words, word] };
    });
    setStatus(`${displayForm} marked ${knowledgeState}. Its text schedule was updated; audio and patterns are unchanged.`);
    if (!existingBeforeUpdate?.definition) {
      try {
        const data = await generateJson({ kind: "define_words", words: [displayForm] });
        const definition = data.words?.[0];
        if (definition) {
          setState((currentState) => ({
            ...currentState,
            words: currentState.words.map((word) => word.normalizedForm !== normalizedForm ? word : {
              ...word,
              definition: definition.definition || word.definition,
              romanization: definition.romanization || word.romanization,
            }),
          }));
        }
      } catch {
        // Status is still saved; definition enrichment can happen later.
      }
    }
  }

  function advanceWeek() {
    setState((currentState) => {
      const completedWeek = currentState.weekNumber;
      return {
        ...currentState,
        weekNumber: Math.min(COURSE_META.weeks, completedWeek + 1),
        words: currentState.words,
      };
    });
    setStatus("Advanced to the next course week. Earlier vocabulary keeps its actual mastery and review schedules.");
  }

  if (!loaded) return <main>Loading…</main>;

  const weakWords = [...state.words]
    .filter((word) => word.reviews >= 1 && weakestAccuracy(word) < 0.9)
    .sort((a, b) => weakestAccuracy(a) - weakestAccuracy(b) || (b.medianResponseMs ?? 0) - (a.medianResponseMs ?? 0))
    .slice(0, 50);
  const readingAverage = Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.comprehensionScore)));
  const listeningAverage = Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.comprehensionScore)));
  const speakingAverage = Math.round(average(state.speakingAttempts.slice(-5).map((attempt) => attempt.grade?.overallScore ?? attempt.selfScore ?? 0).filter(Boolean)));
  const speakingWords = selectContextWords(state, 8);
  const sourceAnalytics = sourceMetrics(state.passages, state.passageAttempts, state.listeningItems, state.listeningAttempts, "source");
  const genreAnalytics = sourceMetrics(state.passages, state.passageAttempts, state.listeningItems, state.listeningAttempts, "genre");
  const registerAnalytics = sourceMetrics(state.passages, state.passageAttempts, state.listeningItems, state.listeningAttempts, "register");
  const topicAnalytics = sourceMetrics(state.passages, state.passageAttempts, state.listeningItems, state.listeningAttempts, "topic");
  const difficultyAnalytics = sourceMetrics(state.passages, state.passageAttempts, state.listeningItems, state.listeningAttempts, "difficulty");
  const originAnalytics = sourceMetrics(state.passages, state.passageAttempts, state.listeningItems, state.listeningAttempts, "origin");
  const visualReviews = state.reviews.filter((review) => review.modality === "visual");
  const audioReviews = state.reviews.filter((review) => review.modality === "audio");
  const patternReviews = state.reviews.filter((review) => review.modality === "cloze");
  const visualRetention = Math.round(100 * visualReviews.filter((review) => review.correct).length / Math.max(1, visualReviews.length));
  const audioRetention = Math.round(100 * audioReviews.filter((review) => review.correct).length / Math.max(1, audioReviews.length));
  const patternRetention = Math.round(100 * patternReviews.filter((review) => review.correct).length / Math.max(1, patternReviews.length));
  const pacingSignals = ([['visual','Text'],['audio','Audio'],['cloze','Patterns']] as const).flatMap(([mode,label]) => {
    const attempts = state.reviews.filter(review=>review.modality===mode).slice(-40);
    if(attempts.length<40)return [];
    const before=attempts.slice(0,20).filter(review=>review.correct).length/20;
    const recent=attempts.slice(20).filter(review=>review.correct).length/20;
    return recent<0.9 && before-recent>=0.15 ? [`${label} accuracy fell from ${Math.round(before*100)}% to ${Math.round(recent*100)}% across the last two groups of 20 reviews. Consider fewer new words or a break, then check your next results.`] : [];
  });
  const workflowDue = {
    visual: dueWords(state, "visual", new Date(clockNow)).length,
    audio: dueWords(state, "audio", new Date(clockNow)).length,
    cloze: dueWords(state, "cloze", new Date(clockNow)).length,
  };
  const firstListenScore = Math.round(average(state.listeningAttempts.filter((attempt) => attempt.firstPass && attempt.listensCount === 1).slice(-5).map((attempt) => attempt.comprehensionScore)));
  const transcriptRate = Math.round(100 * state.listeningAttempts.filter((attempt) => attempt.transcriptRevealed).length / Math.max(1, state.listeningAttempts.length));
  const inferenceAttempts = state.passageAttempts.filter((attempt) => attempt.readingMode === "inference");
  const inferenceAverage = Math.round(average(inferenceAttempts.slice(-5).map((attempt) => attempt.comprehensionScore)));
  const gistListeningAttempts = state.listeningAttempts.filter((attempt) => attempt.listeningMode === "gist");
  const gistListeningAverage = Math.round(average(gistListeningAttempts.slice(-5).map((attempt) => attempt.comprehensionScore)));
  const recentGistAnswerCounts = gistListeningAttempts.slice(-5).flatMap((attempt) => attempt.gistAnsweredAfterListens ?? []);
  const firstListenGistRate = Math.round(100 * recentGistAnswerCounts.filter((count) => count === 1).length / Math.max(1, recentGistAnswerCounts.length));
  const currentCourseWeekImported = state.course.importedWeeks.includes(state.weekNumber);
  const currentCourseWordCount = COURSE_META.weekCounts[state.weekNumber - 1];
  const currentCourseLessonCount = COURSE_META.weekLessonCounts[state.weekNumber - 1];
  const courseSectionCounts = new Map<string, number>();
  for (const entry of courseCatalog) {
    const section = courseSectionLabel(entry.lesson);
    courseSectionCounts.set(section, (courseSectionCounts.get(section) ?? 0) + 1);
  }
  const courseSections = [...courseSectionCounts].map(([label, count]) => ({ label, count }));
  const selectedCourseSectionEntryCount = courseSections
    .filter((section) => selectedCourseSections.has(section.label))
    .reduce((total, section) => total + section.count, 0);
  const unitOf = (lesson:string) => lesson.split(' - ')[0];
  const catalogUnits = [...new Set(courseCatalog.map(entry=>unitOf(entry.lesson)))];
  const unitEntries = courseCatalog.filter(entry=>!catalogUnit || unitOf(entry.lesson)===catalogUnit);
  const catalogChapters = [...new Set(unitEntries.map(entry=>courseSectionLabel(entry.lesson)))];
  const catalogWeekEntries = unitEntries.filter(entry=>!catalogChapter || courseSectionLabel(entry.lesson)===catalogChapter);
  const catalogLessons = [...new Set(catalogWeekEntries.map((entry) => entry.lesson))];
  const activeCatalogLesson = catalogLessons.includes(catalogLesson) ? catalogLesson : "";
  const normalizedCatalogQuery = catalogQuery.trim().toLocaleLowerCase();
  const visibleCatalogEntries = catalogWeekEntries.filter((entry) => (
    (!activeCatalogLesson || entry.lesson === activeCatalogLesson)
    && (courseTopic==='All topics'||courseTopicFor(entry.en)===courseTopic)
    && (!normalizedCatalogQuery || `${entry.fa} ${entry.en}`.toLocaleLowerCase().includes(normalizedCatalogQuery))
  ));
  const bankCourseKeys = new Set(state.words.filter((word) => word.sourceType === "course").map((word) => courseWordKey(word.displayForm)));
  const allBankKeys = new Set(state.words.map((word) => courseWordKey(word.displayForm)));
  const normalizedNewsQuery = newsQuery.trim().toLocaleLowerCase();
  const visibleNewsEntries = NEWS_CATALOG.filter((word) => (
    (newsTopic === "All topics" || newsTopicFor(word) === newsTopic)
    && (!normalizedNewsQuery || `${word.displayForm} ${word.definition ?? ""} ${word.romanization ?? ""}`.toLocaleLowerCase().includes(normalizedNewsQuery))
  ));
  const inferenceSentenceCount = latestPassage ? persianSentences(latestPassage.textFa).length : 0;
  const inferenceReady = readingMode !== "inference"
    || (sentenceGists.length === inferenceSentenceCount && sentenceGists.every((gist) => gist.trim()));
  const activeReadingQuestions = readingMode === "inference" && focusedReadingQuestions.length
    ? focusedReadingQuestions
    : (latestPassage?.questions ?? []);
  const gistListeningSentences = latestListening ? persianSentences(latestListening.transcriptFa) : [];
  const gistListeningReady = listeningMode === "gist"
    && gistListeningSentences.length > 0
    && listeningGists.length === gistListeningSentences.length
    && listeningGists.every((gist) => gist.trim())
    && gistSentenceListenCounts.length === gistListeningSentences.length
    && gistSentenceListenCounts.every((count) => count >= 1);
  const activeListeningQuestions = listeningMode === "gist" && focusedListeningQuestions.length
    ? focusedListeningQuestions
    : (latestListening?.questions ?? []);

  function resetReadingLab(passageId: string) {
    setActivePassageId(passageId);
    setReadingStartedAt(null);
    setReadingDurationMs(0);
    setReadingQuestionsOpen(false);
    setSentenceGists([]);
    setReadingUnknown(0);
    setReadingRereads(0);
    setTab("reading");
  }

  function resetListeningLab(itemId: string) {
    setActiveListeningId(itemId);
    setListensCount(0);
    setListeningGists([]);
    setGistSentenceListenCounts([]);
    setGistAnsweredAfterListens([]);
    setGistHintedSentenceIndexes([]);
    setRapidCaptionListens(0);
    setRapidCaptionWord("");
    setTranscriptRevealStep(0);
    setTab("listening");
  }

  function changeReadingMode(mode:"full"|"inference") {
    setReadingMode(mode);
    setSentenceGists([]);
  }

  function changeListeningMode(mode:"full"|"gist"|"rapid") {
    releasePlayback();
    setListeningMode(mode);
    setListensCount(0);
    setTranscriptRevealStep(0);
    setListeningGists([]);
    setGistSentenceListenCounts([]);
    setGistAnsweredAfterListens([]);
    setGistHintedSentenceIndexes([]);
    setRapidCaptionListens(0);
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "complete");
    setShowOnboarding(false);
  }

  function setSkillLevel(skill: "reading" | "listening" | "speaking", level: IlrLevel) {
    setState((currentState) => ({
      ...currentState,
      skillLevels: { ...currentState.skillLevels, [skill]: level },
    }));
    setStatus(`${TAB_LABELS[skill]} set to internal difficulty ${level}. This is an ILR-oriented practice target, not an official rating.`);
  }

  function openAccount() {
    setTab("account");
    window.requestAnimationFrame(() => window.setTimeout(() => {
      document.querySelector(".account-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0));
  }

  if (!loaded) return <div className="onboarding-loading" />;
  if (showOnboarding) return <Onboarding onFinish={finishOnboarding} />;

  return <main>
    <header>
      <h1>{TAB_LABELS[tab]}</h1>
      <div className="row"><button className={`sync-indicator ${cloudUser && cloudReady ? "ready" : ""}`} onClick={openAccount} aria-label={cloudUser && cloudReady ? "Cloud sync active. Open account." : cloudUser ? "Cloud sync is connecting. Open account." : "Progress is local only. Open account to sign in."}>{cloudUser ? cloudReady ? "● Synced" : "○ Syncing" : "○ Local"}</button></div>
    </header>

    <nav className="tabs" aria-label="Cursos navigation">
      <div className="nav-section-heading"><span><i className="nav-flower">✺</i> Cursos <small>by Synaptx</small></span></div>
      <div className="nav-dash" />
      <div className="nav-items nav-home"><button className={tab==='home'?'tab active':'tab'} onClick={()=>setTab('home')}><span className="nav-bullet">⌂</span>Home</button></div>
      <div className="nav-path-label">Train in order</div>
      <div className="nav-items learning-path">
        <button className={tab==='today'?'tab active':'tab'} onClick={()=>setTab('today')}>Flashcards</button>
        <button className={tab==='reading'?'tab active':'tab'} onClick={()=>setTab('reading')}><span className="path-step">4</span>Reading</button>
        <button className={tab==='listening'?'tab active':'tab'} onClick={()=>setTab('listening')}><span className="path-step">5</span>Listening</button>
        <button className={tab==='speaking'?'tab active':'tab'} onClick={()=>setTab('speaking')}><span className="path-step">6</span>Speaking</button>
      </div>
      <div className="nav-path-label">Your workspace</div>
      <div className="nav-items">
        {(["vocabulary","analytics"] as Tab[]).map((name)=><button key={name} className={tab===name?'tab active':'tab'} onClick={()=>setTab(name)}><span className="nav-bullet">{tab===name?'●':'·'}</span>{name==='vocabulary'?'Words':TAB_LABELS[name]}</button>)}
      </div>
      <div className="nav-course">
        <div className="platform-switcher"><a href={ASL_URL}>Cognis</a><a href={SYNAPTX_URL}>Synaptx</a></div>
        {canManageClasses(cloudUser)&&<a href="/classroom">Classroom ↗</a>}
        <span>{state.words.length} saved words</span>
      </div>
      <button className="guide-button" onClick={() => setShowOnboarding(true)} aria-label="Open getting started guide">?</button>
    </nav>

    {status && tab==='account' && <p className="account-status" role="status">{status}</p>}
    {status && tab!=='account' && /failed|error|incomplete|did not pass|not configured|unavailable|could not|invalid|choose.*first|up to 250|choose an active/i.test(status) && <div className="action-error" role="alert"><span>{status}</span><button aria-label="Dismiss message" onClick={()=>setStatus('')}>×</button></div>}

    {showIntake && <section className="card intake">
      <h2>Week {state.weekNumber} intake</h2>
      <div className="muted">Paste your weekly course words. Missing definitions and romanization can be filled automatically. Only the words you supply are added.</div>
      <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={"کارمند — employee — kārmand\nبازداشت کردن — to arrest — bāzdāsht kardan\nآینده — future — āyande"} />
      <div className="row"><button className="primary" onClick={importWeek}>Import selected words</button><button className="secondary" onClick={() => setShowIntake(false)}>Cancel</button></div>
    </section>}

    {tab === "home" && !showIntake && <section className="workflow-home">
      <div className="workflow-intro"><span className="workflow-kicker">Today&apos;s path</span><h2>Your study space.</h2><p>Pick up where you left off.</p></div>
      <div className="workflow-start">
        <div><small>Start here</small><h3>{state.words.length ? "Continue studying" : "Choose your vocabulary"}</h3><p>{state.words.length ? "Work at your own pace. Your progress carries across sessions." : "Pick a course chapter or add-on news topic to create your first session."}</p></div>
        <button className="primary" onClick={()=>state.words.length?(setReviewModality("visual"),setTab("today")):setTab("vocabulary")}>{state.words.length ? "Begin text recall →" : "Choose words →"}</button>
      </div>
      <button className="workflow-choose" onClick={()=>setTab("vocabulary")}><span>SET</span><div><strong>Choose words</strong><small>{state.words.length} in your bank</small></div><i>Prepare →</i></button>
      <section className="skill-carousel" aria-label="Learning skills carousel"><div className="skill-carousel-controls"><span>Explore your skills · {skillSlide+1} / 6</span><div><button aria-label="Previous skill" disabled={skillSlide===0} onClick={()=>moveSkillSlide(-1)}>←</button><button aria-label="Next skill" disabled={skillSlide===5} onClick={()=>moveSkillSlide(1)}>→</button></div></div>
      <div ref={skillCarousel} className="workflow-steps" aria-label="Learning workflow" onScroll={event=>{const track=event.currentTarget;const width=(track.children[1] as HTMLElement).offsetLeft-(track.children[0] as HTMLElement).offsetLeft;setSkillSlide(Math.max(0,Math.min(5,Math.round(track.scrollLeft/width))));}}>
        <button onClick={()=>{setReviewModality("visual");setTab("today");}}><span>01</span><div><strong>Text recall</strong></div><i>See it</i></button>
        <button onClick={()=>{setReviewModality("audio");setTab("today");}}><span>02</span><div><strong>Audio recall</strong></div><i>Hear it</i></button>
        <button onClick={()=>{setReviewModality("cloze");setTab("today");}}><span>03</span><div><strong>Patterns</strong></div><i>Notice it</i></button>
        <button onClick={()=>setTab("reading")}><span>04</span><div><strong>Reading</strong><small>{state.passageAttempts.length} completed</small></div><i>Use it</i></button>
        <button onClick={()=>setTab("listening")}><span>05</span><div><strong>Listening</strong><small>{state.listeningAttempts.length} completed</small></div><i>Understand it</i></button>
        <button onClick={()=>setTab("speaking")}><span>06</span><div><strong>Speaking</strong><small>{state.speakingAttempts.length} completed</small></div><i>Produce it</i></button>
      </div>
      </section>
      <div className="workflow-footer"><span className="workflow-kicker">Your progress</span><h3>{state.reviews.length.toLocaleString()} reviews completed</h3><p>See recall, comprehension, and the words that need another look.</p><button onClick={()=>setTab("analytics")}>Explore progress →</button></div>
    </section>}

    {tab === "today" && !showIntake && <section className="grid today-grid">
      {planPicker(reviewModality)}
      <div className="card span-12 today-controls"><div className="row spread"><span>Study at your pace · All selected due words are available</span><button className="secondary" onClick={refreshTodayQueue}>Refresh Today</button></div><p className="muted">Due reviews come first. Text, audio, and patterns advance independently.</p></div>
      <Metric label="Due now" value={String(due.length)} />
      <Metric label="Total words" value={String(state.words.length)} />
      <Metric label="Review accuracy" value={`${retention}%`} />
      <Metric label="Median recall" value={medianRecall ? `${(medianRecall / 1000).toFixed(1)}s` : "—"} />

      <div className="card span-7 dashboard-primary">
        <div className="row spread"><h2>{state.words.length ? "Review" : "Start here"}</h2>{state.words.length > 0 && <div className="row"><button className={reviewModality === "visual" ? "mode-button active" : "mode-button"} onClick={() => changeReviewModality("visual")}>Text</button><button className={reviewModality === "audio" ? "mode-button active" : "mode-button"} onClick={() => changeReviewModality("audio")}>Audio</button><button className={reviewModality === "cloze" ? "mode-button active" : "mode-button"} onClick={() => changeReviewModality("cloze")}>Patterns</button><span className="pill">{reviewModality === "cloze" ? "1s flash · type" : "3s · 8s · 15s"}</span></div>}</div>
        {current ? <>
          {(revealed||patternPhase==="result")&&patternHints(current.displayForm).map(hint=><aside className="pattern-hint" key={hint.form}><b lang="fa">{hint.form}</b><span>{hint.rule}</span><small>{hint.example}</small></aside>)}
          {reviewModality === "cloze" ? <div className="pattern-recall" aria-live="polite">
            {patternPhase === "flash" && <div className="pattern-flash">
              <span>{isPatternItem(current) ? "Phrase / compound" : "Word"} · memorize</span>
              <div className="fa hero-fa" lang="fa">{current.displayForm.replace(/[\u00ad\u200b]/g, "")}</div>
              <div className="pattern-flash-meter" aria-hidden="true"><i /></div>
            </div>}
            {patternPhase === "answer" && <form className="pattern-answer" onSubmit={(event) => { event.preventDefault(); submitPatternAnswer(); }}>
              <label htmlFor="pattern-answer">{patternHints(current.displayForm)[0]?<>In <span lang="fa">{current.displayForm}</span>, what does <span lang="fa">{patternHints(current.displayForm)[0].form}</span> contribute?</>:"The phrase is hidden. Type its English meaning."}</label>
              <input ref={patternInputRef} id="pattern-answer" value={patternInput} onChange={(event) => setPatternInput(event.target.value)} placeholder="Type the meaning…" autoComplete="off" />
              <button className="primary" type="submit" disabled={!patternInput.trim()}>Check answer</button>
            </form>}
            {patternPhase === "result" && <div className="pattern-result">
              <span className={patternMatched ? "pattern-signal match" : "pattern-signal"}>{patternMatched ? "Likely match" : "Check your meaning"}</span>
              <div className="answer-block">
                <span className="muted">You typed</span><strong>{patternInput}</strong>
                <span className="muted">Expected</span><strong>{patternHints(current.displayForm)[0]?.rule??current.definition??"Definition missing"}</strong>
                {current.romanization && <span className="muted">{current.romanization}</span>}
                <span className="muted">Answer time {(responseMs / 1000).toFixed(1)}s</span>
              </div>
              <div className="row"><button className="danger" onClick={() => rateKnown(false)}>Needs work</button><button className="primary" onClick={() => rateKnown(true)}>Got it</button></div>
            </div>}
          </div> : <>
            {reviewModality === "visual" ? <div className="fa hero-fa" lang="fa">{current.displayForm.replace(/[\u00ad\u200b]/g, "")}</div> : <div className="audio-recall"><button className="primary" onClick={() => void playCurrentWord()}>Play word</button><span className="muted">Identify it by sound before revealing.</span></div>}
            {!revealed ? <button className="primary" onClick={reveal} disabled={reviewModality==="audio"&&playedReviewWord!==current.id}>{reviewModality==="audio"&&playedReviewWord!==current.id?"Play audio first":"Reveal meaning"}</button> : <>
              <div className="answer-block">
                <strong>{current.definition || "Definition missing — add it during intake or enable AI enrichment."}</strong>
                {current.romanization && <span className="muted">{current.romanization}</span>}
                <span className="muted">Recall time {(responseMs / 1000).toFixed(1)}s · correct answers move to the next review</span>
              </div>
              <div className="row"><button className="danger" onClick={() => rateKnown(false)}>I was wrong</button><button className="primary" onClick={() => rateKnown(true)}>I was right</button></div>
            </>}
          </>}
        </> : state.words.length ? <div className="next-action"><h3>No reviews due right now.</h3><p>Your vocabulary session and completed work are safe. Refresh the queue, choose a different learning-path step, or edit the active words.</p><div className="row"><button onClick={refreshTodayQueue}>Refresh Today</button><button onClick={()=>{setPlanMode(reviewModality);setTab("vocabulary");}}>Edit session</button></div></div> : !currentCourseWeekImported ? <div className="next-action course-ready"><span className="next-number">01</span><h3>Start Week {state.weekNumber}.</h3><p>This week contains {currentCourseWordCount} entries from {currentCourseLessonCount} original ChiMishe lesson lists. Choose the words you want; new reviews follow your daily limit.</p><div className="course-ready-meta"><span>{COURSE_META.entries.toLocaleString()} course entries</span><span>{COURSE_META.lessonLists} lesson lists</span><span>{COURSE_META.weeks} weeks</span></div><button className="primary" onClick={() => void importCourseWeek()} disabled={courseBusy}>{courseBusy ? "Preparing…" : `Start Week ${state.weekNumber}`}</button></div> : state.words.length ? <div className="next-action"><h3>You&apos;re caught up.</h3><p>Choose Reading or Listening from the menu for your next session.</p></div> : <div className="next-action"><span className="next-number">01</span><h3>Add your first words.</h3><p>Add vocabulary manually to create your review schedule.</p><button className="primary" onClick={() => setShowIntake(true)}>Add words</button></div>}
      </div>

      <div className="card span-5 dashboard-secondary">
        <h2>Adaptive allocation</h2>
        <p className="muted">{trainingPhase.label} · {trainingPhase.focus}. Bottleneck: {bottleneck.label} ({bottleneck.evidence}).</p>
        {Object.entries(allocation).map(([name, value]) => <div key={name} className="allocation"><div className="row spread"><span>{name}</span><span className="muted">{value}%</span></div><div className="progress"><div style={{ width: `${value}%` }} /></div></div>)}
      </div>

      <div className="card span-8 dashboard-secondary">
        <div className="row spread"><h2>Current vocabulary</h2><span className="muted">{mature} mature</span></div>
        <div className="word-list">{state.words.slice(-14).reverse().map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><WordPatternHint word={word.displayForm}/><span>{word.romanization ? `${word.romanization} · ` : ""}{word.definition || "definition pending"}</span><span>W{word.sourceWeek} · {word.knowledgeState ?? "learning"} · {word.reviews} reviews · {word.sourceType === "system_advanced" ? "advanced" : word.sourceType === "course" || word.sourceType === "dli" ? "course" : "personal / Anki"}</span></div>)}</div>
      </div>

    </section>}

    {tab === "reading" && <section className={`grid reading-workspace${readingQuestionsOpen ? ' answering' : ''}`}>
      <label className="difficulty-control span-12">Sentence difficulty <select aria-label="Reading sentence difficulty" value={state.skillLevels.reading} onChange={event=>setSkillLevel('reading',Number(event.target.value) as IlrLevel)}>{['Simple','Everyday','Complex','Advanced'].map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select><small>Applies to your next generated passage.</small></label>
      <label className="difficulty-control span-12">Language style <select aria-label="reading language style" value={practiceRegister.reading} onChange={event=>setPracticeRegister(current=>({...current,reading:event.target.value as 'formal'|'colloquial'}))}><option value="formal">Formal</option><option value="colloquial">Colloquial</option></select><small>Applies to the next generated item.</small></label>
      {practiceSource.reading === "selected" && planPicker("reading")}
      <div className="card span-12 lab-header"><div><h2>Reading</h2><span className="muted">Practice your selected words, or generate freely from a vocabulary and news topic.</span></div><div className="row"><button disabled={Boolean(generationBusy || (practiceSource.reading === "topic" && !courseCatalog.length))} onClick={()=>{if((readingStartedAt||readingQuestionsOpen)&&!window.confirm("Generate a new passage? Unsaved answers for this passage will be replaced."))return;void generatePractice("reading");}}>{generationBusy==="reading"?"Generating…":practiceSource.reading === "topic" && !courseCatalog.length?"Loading topic bank…":"Generate new"}</button><label className="lab-select"><span>Generation source</span><select aria-label="reading generation source" value={practiceSource.reading} disabled={Boolean(generationBusy)} onChange={event=>setPracticeSource(current=>({...current,reading:event.target.value as PracticeSource}))}><option value="selected">Selected words</option><option value="topic">Topic bank + news</option></select></label><label className="lab-select"><span>Topic</span><select aria-label="reading topic" value={practiceTopic.reading} disabled={Boolean(generationBusy)} onChange={event=>setPracticeTopic(current=>({...current,reading:event.target.value}))}>{PRACTICE_TOPICS.map(topic=><option key={topic}>{topic}</option>)}</select></label><details className="lab-select"><summary>Exercise history</summary><label className="lab-select"><span>Open a previous exercise</span><select aria-label="Choose reading report" value={latestPassage?.id ?? ""} disabled={Boolean(readingStartedAt || readingQuestionsOpen)} onChange={(event) => resetReadingLab(event.target.value)}>{state.passages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></details><label className="lab-select"><span>Practice mode</span><select aria-label="Reading practice mode" value={readingMode} disabled={Boolean(readingStartedAt || readingQuestionsOpen)} onChange={event=>changeReadingMode(event.target.value as "full"|"inference")}><option value="full">Full text</option><option value="inference">Inference</option></select></label>{latestPassage && <><a className="secondary button-link" href={`/print/reading/${latestPassage.id}`} target="_blank" rel="noreferrer">Print report</a></>}</div></div>
      {latestPassage ? <>
        <div className="card span-7">
          <div className="row spread"><div><div className="muted">Internal difficulty ~{latestPassage.ilrEstimate} · ILR-oriented, not an official rating · {latestPassage.topic} · {latestPassage.genre} · {latestPassage.register}</div><h2>{latestPassage.title}</h2><SourceLine item={latestPassage} />{!!latestPassage.supportingWords?.length && <p className="muted">Includes {latestPassage.supportingWords.length} supporting words beyond the generation bank.</p>}</div>{!readingStartedAt && !readingQuestionsOpen && <button className="primary" onClick={() => { setReadingStartedAt(Date.now()); setReadingDurationMs(0); }}>1 · Start reading</button>}</div>
          {!readingQuestionsOpen && (readingMode === "inference" ? <InferenceReadingText text={latestPassage.textFa} words={state.words} targetWords={latestPassage.targetWords} gists={sentenceGists} onGistsChange={setSentenceGists} disabled={!readingStartedAt} /> : <InteractivePersianText text={latestPassage.textFa} words={state.words} onStatus={setWordKnowledge} disabled={!readingStartedAt} className={readingStartedAt ? "fa passage" : "fa passage blurred"} />)}
          {readingMode === "full" && !!latestPassage.targetWords.length && <div className="target-strip"><span className="muted">Extracted targets</span>{latestPassage.targetWords.map((word) => <span className="pill fa-inline" key={word}>{word}</span>)}</div>}
          {readingStartedAt && !readingQuestionsOpen && <div className="row"><button className="primary" disabled={!inferenceReady} onClick={finishReading}>2 · Answer questions →</button>{readingMode === "inference" && !inferenceReady && <span className="muted">Capture the gist of each sentence first.</span>}<label>Unknown words <input className="small-input" type="number" min="0" value={readingUnknown} onChange={(event) => setReadingUnknown(Number(event.target.value))}/></label><label>Rereads <input className="small-input" type="number" min="0" value={readingRereads} onChange={(event) => setReadingRereads(Number(event.target.value))}/></label></div>}
          {readingQuestionsOpen && <div className="locked-source"><strong>{readingMode === "inference" ? "Sentence gists saved. Passage locked for recall." : "Passage locked for recall."}</strong><span className="muted">Reading time: {(readingDurationMs / 1000).toFixed(0)}s · unknown words: {readingUnknown} · rereads: {readingRereads}</span></div>}
        </div>
        <div className="card span-5">
          {readingQuestionsOpen ? <ComprehensionGrader
            key={`${latestPassage.id}-${readingMode}`}
            kind="reading"
            sourceText={latestPassage.textFa}
            questions={activeReadingQuestions}
            ilrEstimate={latestPassage.ilrEstimate}
            onComplete={completeReading}
          /> : <div className="empty">Start reading, then choose “Answer questions” below the passage. Your comprehension check opens here.</div>}
        </div>
      </> : <div className="card span-12 empty">No passage. Generate one to begin.</div>}
    </section>}

    {tab === "listening" && <section className={`grid listening-workspace${(listeningMode==='gist'?gistListeningReady:listensCount>0)&&listeningMode!=='rapid'?' answering':''}${transcriptVisible?' with-transcript':''}`}>
      <label className="difficulty-control span-12">Sentence difficulty <select aria-label="Listening sentence difficulty" value={state.skillLevels.listening} onChange={event=>setSkillLevel('listening',Number(event.target.value) as IlrLevel)}>{['Simple','Everyday','Complex','Advanced'].map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select><small>Applies to your next generated audio.</small></label>
      <label className="difficulty-control span-12">Language style <select aria-label="listening language style" value={practiceRegister.listening} onChange={event=>setPracticeRegister(current=>({...current,listening:event.target.value as 'formal'|'colloquial'}))}><option value="formal">Formal</option><option value="colloquial">Colloquial</option></select><small>Applies to the next generated item.</small></label>
      {practiceSource.listening === "selected" && planPicker("listening")}
      <div className="card span-12 lab-header"><div><h2>Listening</h2><span className="muted">Practice your selected words, or generate freely from a vocabulary and news topic.</span></div><div className="row"><button disabled={Boolean(generationBusy || audioBusy || (practiceSource.listening === "topic" && !courseCatalog.length))} onClick={()=>void generatePractice("listening")}>{generationBusy==="listening"?"Generating…":practiceSource.listening === "topic" && !courseCatalog.length?"Loading topic bank…":"Generate new"}</button><label className="lab-select"><span>Generation source</span><select aria-label="listening generation source" value={practiceSource.listening} disabled={Boolean(generationBusy)} onChange={event=>setPracticeSource(current=>({...current,listening:event.target.value as PracticeSource}))}><option value="selected">Selected words</option><option value="topic">Topic bank + news</option></select></label><label className="lab-select"><span>Topic</span><select aria-label="listening topic" value={practiceTopic.listening} disabled={Boolean(generationBusy)} onChange={event=>setPracticeTopic(current=>({...current,listening:event.target.value}))}>{PRACTICE_TOPICS.map(topic=><option key={topic}>{topic}</option>)}</select></label><details className="lab-select"><summary>Exercise history</summary><label className="lab-select"><span>Open a previous exercise</span><select aria-label="Choose listening report" value={latestListening?.id ?? ""} onChange={(event) => resetListeningLab(event.target.value)}>{state.listeningItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></details><label className="lab-select"><span>Practice mode</span><select aria-label="Listening practice mode" value={listeningMode} onChange={event=>changeListeningMode(event.target.value as "full"|"gist"|"rapid")}><option value="full">Full audio</option><option value="gist">Gist</option><option value="rapid">Rapid captions</option></select></label>{latestListening && <><a className="secondary button-link" href={`/print/listening/${latestListening.id}`} target="_blank" rel="noreferrer">Print transcript</a></>}</div></div>
      {latestListening ? <>
        <div className="card span-7">
          <div className="muted">Internal difficulty ~{latestListening.ilrEstimate} · ILR-oriented, not an official rating · {latestListening.topic} · {latestListening.genre} · {latestListening.register}</div><h2>{latestListening.title}</h2><SourceLine item={latestListening} />{!!latestListening.supportingWords?.length && <p className="muted">Includes {latestListening.supportingWords.length} supporting words beyond the generation bank.</p>}
          {listeningMode === "gist" ? <GistListening sentences={gistListeningSentences} words={state.words} gists={listeningGists} listenCounts={gistSentenceListenCounts} hintedSentenceIndexes={gistHintedSentenceIndexes} busy={audioBusy} onPlay={(index) => void playGistSentence(index)} onGistChange={updateListeningGist} onHint={(index) => setGistHintedSentenceIndexes((current) => [...new Set([...current, index])])} /> : listeningMode === "rapid" ? <RapidCaptions currentWord={rapidCaptionWord} captionListens={rapidCaptionListens} playing={rapidPlaying} preparing={audioBusy} onPlay={() => void playRapidListening()} onExit={() => changeListeningMode("full")} /> : <>
            <div className="audio-stage"><button className="primary big-button" disabled={audioBusy} onClick={playListening}>{audioBusy ? "Starting…" : "▶ Play Persian audio"}</button><span className="muted">listens: {listensCount}</span></div>
            {transcriptVisible && listeningReveal ? <InteractivePersianText text={listeningReveal.text} words={state.words} onStatus={setWordKnowledge} className="fa passage progressive-transcript" /> : <div className="transcript-hidden">Transcript hidden</div>}
            <div className="row">
              <button className="secondary" disabled={transcriptRevealPercent >= 100 || listeningReveal?.unknownCount === 0} onClick={() => setTranscriptRevealStep((step) => Math.min(4, step + 1))}>{transcriptRevealPercent === 0 ? "Reveal first 30% · weakest words" : transcriptRevealPercent < 90 ? "Reveal 30% more" : transcriptRevealPercent < 100 ? "Reveal final 10%" : "Full transcript revealed"}</button>
              {transcriptVisible && listeningReveal && <span className="pill">{listeningReveal.revealedCount}/{listeningReveal.unknownCount} words revealed</span>}
            </div>
          </>}
        </div>
        {listeningMode !== "rapid" && <div className="card span-5">
          {(listeningMode === "gist" ? gistListeningReady : listensCount > 0) ? <ComprehensionGrader
            key={`${latestListening.id}-${listeningMode}`}
            kind="listening"
            sourceText={latestListening.transcriptFa}
            questions={activeListeningQuestions}
            ilrEstimate={latestListening.ilrEstimate}
            listensCount={listensCount}
            transcriptRevealed={listeningMode === "full" && transcriptVisible}
            onComplete={completeListening}
          /> : <div className="empty">{listeningMode === "gist" ? "Listen and capture all six sentence gists to unlock the focused check." : "Play the audio at least once before answering."}</div>}
        </div>}
      </> : <div className="card span-12 empty">No audio. Generate one to begin.</div>}
    </section>}

    {tab === "speaking" && <SpeakingLab
      level={state.skillLevels.speaking}
      prompts={state.speakingPrompts}
      onAttempt={addSpeakingAttempt}
      makeId={id}
    />}

    {tab === "vocabulary" && <section className="grid">
      <StudyPlanPicker state={state} mode={planMode} onModeChange={setPlanMode} onChange={plan=>updatePlan(planMode,plan)}/>
      <div className="card span-12 course-catalog">
        <div className="row spread catalog-heading"><div><h2>{COURSE_META.title}</h2><p className="muted">Choose a unit, chapter, or lesson. Selection stays checked while you browse.</p></div></div>
        <details className="chapter-picker">
          <summary>Choose whole chapters or modules</summary>
          <p>Select several sections, then add their vocabulary in one step.</p>
          <div className="chapter-options">{courseSections.map((section) => <label key={section.label}><input type="checkbox" checked={selectedCourseSections.has(section.label)} onChange={() => setSelectedCourseSections((current) => { const next = new Set(current); if (next.has(section.label)) next.delete(section.label); else next.add(section.label); return next; })} /><span>{section.label}</span><small>{section.count} words</small></label>)}</div>
          <div className="chapter-actions"><button className="text-button" disabled={!selectedCourseSections.size} onClick={() => setSelectedCourseSections(new Set())}>Clear</button><button className="primary" disabled={!selectedCourseSections.size} onClick={addSelectedCourseSections}>Add {selectedCourseSections.size || "selected"} {selectedCourseSections.size === 1 ? "chapter" : "chapters"} to {planLabels[planMode]} · {selectedCourseSectionEntryCount.toLocaleString()} words</button></div>
        </details>
        <div className="catalog-controls">
          <label><span>Topic (suggested)</span><select value={courseTopic} onChange={event=>setCourseTopic(event.target.value)}>{COURSE_TOPICS.map(topic=><option key={topic}>{topic}</option>)}</select></label>
          <label><span>Unit / book</span><select value={catalogUnit} onChange={event=>{setCatalogUnit(event.target.value);setCatalogChapter("");setCatalogLesson("");}}><option value="">All units and books</option>{catalogUnits.map(unit=><option key={unit}>{unit}</option>)}</select></label><label><span>Chapter / module</span><select value={catalogChapter} onChange={event=>{setCatalogChapter(event.target.value);setCatalogLesson("");}}><option value="">All chapters</option>{catalogChapters.map(chapter=><option key={chapter}>{chapter}</option>)}</select></label>
          <label><span>Lesson</span><select value={activeCatalogLesson} onChange={event=>setCatalogLesson(event.target.value)}><option value="">All lessons</option>{catalogLessons.map(lesson=><option key={lesson}>{lesson}</option>)}</select></label>
          <label><span>Find a word</span><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Persian or English" /></label>
        </div>
        <div className="catalog-selection row spread"><span>{visibleCatalogEntries.length} shown · {selectedCourseEntries.size} selected</span><div className="row"><button className="text-button" onClick={() => setSelectedCourseEntries(current=>new Set([...current,...visibleCatalogEntries.map(entry=>entry.id)]))}>Select shown</button><button className="text-button" onClick={() => setSelectedCourseEntries(new Set())}>Deselect all</button><button className="primary" disabled={!selectedCourseEntries.size} onClick={()=>addSelectedCourseWords()}>Add to {planLabels[planMode]}</button><button className="secondary" disabled={!selectedCourseEntries.size} onClick={()=>addSelectedCourseWords("replace")}>Use only selected</button><button className="secondary" disabled={!selectedCourseEntries.size} onClick={removeSelectedCourseWords}>Remove from session</button></div></div>
        <div className="catalog-list">{visibleCatalogEntries.map((entry) => {
          const alreadyAdded = bankCourseKeys.has(courseWordKey(entry.fa));
          return <label className={`catalog-word${alreadyAdded ? " added" : ""}`} key={entry.id}><input type="checkbox" checked={selectedCourseEntries.has(entry.id)} onChange={() => setSelectedCourseEntries((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} /><strong>{entry.fa}</strong><span>{entry.en}</span><small>{alreadyAdded ? "In your bank" : `List ${entry.list}`}</small></label>;
        })}</div>
        {!courseCatalog.length && <div className="empty">Loading the course catalog…</div>}
        {courseCatalog.length > 0 && !visibleCatalogEntries.length && <div className="empty">No words match this search.</div>}
      </div>
      <div className="card span-12 news-catalog"><h2>News Vocabulary · {NEWS_META.entries.toLocaleString()}</h2><p className="muted">Optional vocabulary for building current-events reading and listening. Filter by topic, then add only what you want.</p><div className="news-catalog-controls"><label className="catalog-search"><span>Topic</span><select value={newsTopic} onChange={(event) => { setNewsTopic(event.target.value as NewsTopic); setSelectedNewsEntries(new Set()); }}>{NEWS_TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label><label className="catalog-search"><span>Find a news word</span><input value={newsQuery} onChange={(event) => setNewsQuery(event.target.value)} placeholder="Persian, English, or transliteration" /></label></div><div className="catalog-selection row spread"><span>{visibleNewsEntries.length} shown · {selectedNewsEntries.size} selected</span><div className="row"><button className="text-button" onClick={() => setSelectedNewsEntries(new Set(visibleNewsEntries.map((word) => word.id)))}>Select shown</button><button className="text-button" onClick={() => setSelectedNewsEntries(new Set())}>Deselect all</button><button className="primary" disabled={!selectedNewsEntries.size} onClick={addSelectedNewsWords}>Add to {planLabels[planMode]}</button><button className="secondary" disabled={!selectedNewsEntries.size} onClick={removeSelectedNewsWords}>Remove selected</button></div></div><div className="catalog-list news-list">{visibleNewsEntries.map((word) => { const alreadyAdded = allBankKeys.has(courseWordKey(word.displayForm)); return <label className={`catalog-word${alreadyAdded ? " added" : ""}`} key={word.id}><input type="checkbox" checked={selectedNewsEntries.has(word.id)} onChange={() => setSelectedNewsEntries((current) => { const next = new Set(current); if (next.has(word.id)) next.delete(word.id); else next.add(word.id); return next; })} /><strong>{word.displayForm}</strong><WordPatternHint word={word.displayForm}/><span>{word.romanization ? `${word.romanization} · ` : ""}{word.definition}</span><small>{alreadyAdded ? "In your bank" : newsTopicFor(word)}</small></label>; })}</div></div>
      <div className="card span-12"><h2>My words · {state.words.filter((word) => word.sourceType === "user").length}</h2><div className="word-list single">{state.words.filter((word) => word.sourceType === "user").map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><WordPatternHint word={word.displayForm}/><span>{word.romanization ? `${word.romanization} · ` : ""}{word.definition}</span><span>{word.topic || "Personal vocabulary"}</span><div className="word-actions"><a className="inspect-word" href={morphologyUrl(word.displayForm, word.definition, word.romanization)} target="_blank" rel="noreferrer">Inspect morphology in Synaptx ↗</a><button className="text-button remove-word" onClick={() => removeWord(word.normalizedForm)}>Remove</button></div></div>)}</div>{!state.words.some((word) => word.sourceType === "user") && <div className="empty">Words researched in Cognis will appear here after you choose them.</div>}</div>
    </section>}

    {tab === "analytics" && <><div className="progress-navigation"><a href="#progress-overview">Overview</a><a href="#progress-practice">Practice priorities</a><a href="#progress-skills">Skills</a><a href="#progress-coverage">Coverage</a><button onClick={openAccount}>Account →</button></div><section id="progress-overview" className="grid analytics-grid">
      <Metric label="Saved vocabulary" value={String(state.words.length)} />
      <Metric label="Reviews logged" value={String(state.reviews.length)} />
      <Metric label="Reading avg (5)" value={readingAverage ? `${readingAverage}%` : "—"} />
      <Metric label="Listening avg (5)" value={listeningAverage ? `${listeningAverage}%` : "—"} />
      <div id="progress-practice" className="progress-section-heading span-12"><h2>Practice priorities</h2><p>{pacingSignals.length ? pacingSignals.join(' ') : 'Study as much as you choose. Pacing suggestions appear when enough recent reviews show a decline in accuracy.'}</p></div>
      <div className="card span-12"><h2>Current training phase</h2><div className="queue"><div className="queue-item"><span>{trainingPhase.label}<small>{trainingPhase.focus}</small></span><strong>{trainingPhase.authenticTarget}% authentic target</strong></div><div className="queue-item"><span>Adaptive bottleneck<small>{bottleneck.evidence}</small></span><strong>{bottleneck.label}</strong></div></div></div>
      <div className="card span-7"><h2>Up to 50 words needing practice</h2><div className="word-list single">{weakWords.map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><WordPatternHint word={word.displayForm}/><span>{word.definition}</span><span>{Math.round(100 * weakestAccuracy(word))}% in weakest tested skill · {word.medianResponseMs ? `${(word.medianResponseMs / 1000).toFixed(1)}s median` : "no latency"} · {word.lapses} lapses</span></div>)}</div>{!weakWords.length && <div className="empty">Not enough review history yet.</div>}</div>
      <div className="card span-5"><h2>Performance history</h2><div className="queue"><div className="queue-item"><span>Reading attempts</span><strong>{state.passageAttempts.length}</strong></div><div className="queue-item"><span>Inference-mode attempts</span><strong>{inferenceAttempts.length}</strong></div><div className="queue-item"><span>Listening attempts</span><strong>{state.listeningAttempts.length}</strong></div><div className="queue-item"><span>Gist-listening attempts</span><strong>{gistListeningAttempts.length}</strong></div><div className="queue-item"><span>Speaking attempts</span><strong>{state.speakingAttempts.length}</strong></div><div className="queue-item"><span>Speaking avg (5)</span><strong>{speakingAverage ? `${speakingAverage}%` : "—"}</strong></div><div className="queue-item"><span>Mature vocabulary</span><strong>{mature}</strong></div><div className="queue-item"><span>Current week</span><strong>{state.weekNumber}/{COURSE_META.weeks}</strong></div></div></div>
<div id="progress-skills" className="card span-12"><h2>Skills at a glance</h2><div className="diagnostic-grid"><Diagnostic label="Text retention" value={visualRetention} /><Diagnostic label="Audio retention" value={audioReviews.length ? audioRetention : 0} /><Diagnostic label="Pattern retention" value={patternReviews.length ? patternRetention : 0} /><Diagnostic label="Inference-mode avg" value={inferenceAttempts.length ? inferenceAverage : 0} /><Diagnostic label="Gist-listening avg" value={gistListeningAttempts.length ? gistListeningAverage : 0} /><Diagnostic label="First-listen gists" value={recentGistAnswerCounts.length ? firstListenGistRate : 0} /><Diagnostic label="First-listen score" value={firstListenScore} /><Diagnostic label="Transcript reveal" value={transcriptRate} /><Diagnostic label="Reading inference" value={Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.inferenceScore)))} /><Diagnostic label="Reading discourse" value={Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.discourseScore)))} /><Diagnostic label="Listening detail" value={Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.detailScore)))} /><Diagnostic label="Listening inference" value={Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.inferenceScore)))} /></div></div>
      <div id="progress-coverage" className="progress-section-heading span-12"><h2>Coverage</h2><p>Compare results across the material you practice.</p></div>
      <AnalyticsTable title="Attempts by source" rows={sourceAnalytics} />
      <AnalyticsTable title="Attempts by genre" rows={genreAnalytics} />
      <AnalyticsTable title="Attempts by register" rows={registerAnalytics} />
      <AnalyticsTable title="Attempts by topic" rows={topicAnalytics} />
      <AnalyticsTable title="Attempts by difficulty" rows={difficultyAnalytics} />
      <AnalyticsTable title="Authentic vs generated" rows={originAnalytics} />
    </section></>}

    {tab === "account" && <AccountWorkspace
      user={cloudUser}
      username={cloudUsername}
      cloudReady={cloudReady}
      status={status}
      onSignIn={signIn}
      onSignUp={signUp}
      onSignOut={signOut}
      onResetPassword={resetPassword}
      onChangePassword={changePassword}
      onChangeUsername={changeUsername}
    />}
    {tab === "account" && <section className="font-preferences"><h2>Account settings</h2><label>Persian font <select value={persianFont} onChange={event=>{setPersianFont(event.target.value);try{localStorage.setItem('cursos-persian-font',event.target.value);}catch{}}}><option value="original">Original · Cursos</option><option value="tahoma">Tahoma · system</option><option value="arial">Arial · system</option><option value="serif">Times New Roman · system</option></select></label><p className="fa">هر روز با خواندن و شنیدن، فارسی را بهتر یاد می‌گیریم.</p><small>Saved on this browser. System font availability varies by device.</small></section>}
  </main>;
}

function SourceLine({ item }: { item: Passage | ListeningItem }) {
  if (item.sourceType === "generated") return <div className="source-line"><span className="pill">{item.practiceMode === "transfer" ? "topic bank + news" : "selected words"}</span></div>;
  return <div className="source-line"><span className={`pill origin-${item.sourceType}`}>{item.sourceType}</span><span>{item.publisher}</span>{item.author && <span>{item.author}</span>}{item.publishedAt && <span>{item.publishedAt}</span>}{item.wordCount && <span>{item.wordCount} words</span>}{item.unknownTokenRatio !== undefined && <span>{Math.round(item.unknownTokenRatio * 100)}% unknown load</span>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original ↗</a>}</div>;
}

function HeaderLevelControls({
  levels,
  onChange,
}: {
  levels: StudyState["skillLevels"];
  onChange: (skill: "reading" | "listening" | "speaking", level: IlrLevel) => void;
}) {
  const labels = { reading: "R", listening: "L", speaking: "S" } as const;
  return <div className="header-level-controls" aria-label="Practice levels">
    {(["reading", "listening", "speaking"] as const).map((skill) => <label key={skill} title={`${TAB_LABELS[skill]} level`}>
      <span>{labels[skill]}</span>
      <select value={levels[skill]} onChange={(event) => onChange(skill, Number(event.target.value) as IlrLevel)} aria-label={`${TAB_LABELS[skill]} level`}>
        {([1, 2, 3, 4] as IlrLevel[]).map((level) => <option key={level} value={level}>{level}</option>)}
      </select>
    </label>)}
  </div>;
}

function AnalyticsTable({ title, rows }: { title: string; rows: ReturnType<typeof sourceMetrics> }) {
  return <div className="card span-4"><h2>{title}</h2>{rows.length ? <div className="queue">{rows.map((row) => <div className="queue-item" key={row.label}><span>{row.label}<small>{row.attempts} attempt{row.attempts === 1 ? "" : "s"}</small></span><strong>{row.average}%</strong></div>)}</div> : <div className="empty">Complete a source-based lab attempt to populate this view.</div>}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card span-3"><div className="muted">{label}</div><div className="stat">{value}</div></div>;
}

function Diagnostic({ label, value }: { label: string; value: number }) {
  return <div className="diagnostic"><span className="muted">{label}</span><strong>{value ? `${value}%` : "—"}</strong></div>;
}
