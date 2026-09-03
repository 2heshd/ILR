"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import AccountWorkspace from "@/components/AccountWorkspace";
import ComprehensionGrader from "@/components/ComprehensionGrader";
import GistListening from "@/components/GistListening";
import InferenceReadingText, { persianSentences } from "@/components/InferenceReadingText";
import InteractivePersianText from "@/components/InteractivePersianText";
import Onboarding from "@/components/Onboarding";
import RapidCaptions from "@/components/RapidCaptions";
import SpeakingLab from "@/components/SpeakingLab";
import { adaptiveAllocation, currentTrainingPhase, dominantBottleneck, selectContextWords } from "@/lib/adaptive";
import { fallbackAdvanced, type AdvancedWord } from "@/lib/advanced";
import type { AnkiReviewRow, AnkiVocabularyRow } from "@/lib/anki";
import { COURSE_META, loadCourseWeek } from "@/lib/course";
import { curatedListeningItems, curatedPassages, curatedSpeakingPrompts, curatedVocabulary } from "@/lib/curated-cycle";
import { createSerializedCard, reviewFsrs } from "@/lib/fsrs";
import { normalizePersian, parseWeeklyInput } from "@/lib/persian";
import { isMeaningfulPersianText, sanitizePersianSpeechText } from "@/lib/persian-speech";
import { sourceMetrics } from "@/lib/source-analytics";
import { appendCloudReview, getSupabaseClient, loadCloudState, loadUsername, mergeStudyStates, saveCloudState, updateUsername } from "@/lib/supabase";
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
const PERSIAN_WORD_PATTERN = /([\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+)/g;
const IS_PERSIAN_WORD = /^[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+$/;
const SYNAPTX_URL = process.env.NEXT_PUBLIC_SYNAPTX_URL ?? "http://localhost:3002";

function syntaxUrl(sentence: string) {
  const params = new URLSearchParams({ sentence, language: "fa" });
  return `${SYNAPTX_URL}/syntax.html?${params}`;
}

function morphologyUrl(word: string) {
  const params = new URLSearchParams({ word, language: "fa", focus: "etymology" });
  return `${SYNAPTX_URL}/morphology.html?${params}`;
}

type Tab = "today" | "reading" | "listening" | "speaking" | "vocabulary" | "analytics";

const TAB_LABELS: Record<Tab, string> = {
  today: "Today",
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

const emptyState: StudyState = {
  weekNumber: 1,
  currentIlr: 1,
  skillLevels: { reading: 1, listening: 1, speaking: 1 },
  course: { catalogId: COURSE_META.id, sourceFile: COURSE_META.sourceFile, importedWeeks: [1] },
  anki: { endpoint: "http://127.0.0.1:8765", deckName: "" },
  words: curatedVocabulary(),
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
  const seededWords = curatedVocabulary();
  const seededPassages = curatedPassages();
  const seededListening = curatedListeningItems();
  const seededSpeaking = curatedSpeakingPrompts();
  const savedWords = new Map((raw?.words ?? []).map((word) => [word.id, word]));
  const seededIds = new Set(seededWords.map((word) => word.id));
  const mergedWords = [
    ...seededWords.map((word) => ({ ...word, ...(savedWords.get(word.id) ?? {}), displayForm: word.displayForm, normalizedForm: word.normalizedForm, definition: word.definition, romanization: word.romanization, sourceType: word.sourceType, courseLesson: word.courseLesson, topic: word.topic })),
    ...(raw?.words ?? []).filter((word) => !seededIds.has(word.id)),
  ];
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
      importedWeeks: [1],
    },
    anki: { ...emptyState.anki, ...(raw?.anki ?? {}) },
    words: mergedWords,
    reviews: (raw?.reviews ?? []).filter((review) => wordIds.has(review.lexicalItemId)),
    passages: seededPassages,
    passageAttempts: (raw?.passageAttempts ?? []).filter((attempt) => passageIds.has(attempt.passageId)).map((attempt) => ({ ...attempt, firstPass: attempt.firstPass ?? true })),
    listeningItems: seededListening,
    listeningAttempts: (raw?.listeningAttempts ?? []).filter((attempt) => listeningIds.has(attempt.listeningItemId)).map((attempt) => ({ ...attempt, firstPass: attempt.firstPass ?? !attempt.transcriptRevealed })),
    speakingPrompts: seededSpeaking,
    speakingAttempts: (raw?.speakingAttempts ?? []).filter((attempt) => speakingIds.has(attempt.speakingPromptId)),
  };
  state.words = state.words.map((word) => {
    const savedCards = [word.fsrsCard, word.modalityCards?.visual, word.modalityCards?.audio, word.modalityCards?.cloze].flatMap((card) => card ? [card] : []);
    const savedCard = savedCards.length
      ? savedCards.reduce((latest, card) => (
        new Date(card.due).getTime() > new Date(latest.due).getTime() ? card : latest
      ))
      : createSerializedCard(new Date(word.introducedAt || Date.now()));
    const removeLegacyDailyCap = word.sourceType === "course" && word.sourceWeek === state.weekNumber && word.reviews === 0;
    const fsrsCard = removeLegacyDailyCap ? { ...savedCard, due: new Date().toISOString() } : savedCard;
    const knowledgeState = word.knowledgeState ?? (word.sourceWeek < state.weekNumber ? "known" : "learning");
    const tier = word.tier ?? (word.sourceType === "system_advanced" ? "A" : word.sourceType === "course" ? "B" : "C");
    return {
      ...word,
      tier,
      modalityMastery: word.modalityMastery ?? {},
      // Keep modality analytics separate while sharing one spacing schedule.
      modalityCards: { ...word.modalityCards, visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
      knowledgeState,
      fsrsCard,
      dueAt: word.dueAt || fsrsCard.due,
    };
  });
  return state;
}

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
    .map((part) => normalizePersian(part))
    .filter((part) => {
      const status = byWord.get(part)?.knowledgeState;
      return status !== "known" && status !== "automatic";
    }))];
  const revealCount = Math.ceil(unknownWords.length * revealPercent / 100);
  const revealed = new Set(unknownWords.slice(0, revealCount));
  return {
    text: parts.map((part) => {
      if (!IS_PERSIAN_WORD.test(part)) return part;
      const normalized = normalizePersian(part);
      const status = byWord.get(normalized)?.knowledgeState;
      return status !== "known" && status !== "automatic" && revealed.has(normalized) ? part : "•••";
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
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Generation failed");
  return data;
}

export default function Home() {
  const [state, setState] = useState<StudyState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [showIntake, setShowIntake] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [courseBusy, setCourseBusy] = useState(false);
  const [generationBusy, setGenerationBusy] = useState<"reading" | "listening" | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudUsername, setCloudUsername] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [reviewModality, setReviewModality] = useState<Extract<ReviewModality, "visual" | "audio" | "cloze">>("visual");
  const [revealed, setRevealed] = useState(false);
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
    if (cachedAudio && cachedTimings) return { audio: cachedAudio, timings: cachedTimings };
    const pending = speechTimingRequestsRef.current.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      const response = await fetch("/api/speech-timings", {
        method: "POST",
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
      if (!metadata.words?.length) throw new Error("Exact word timing is unavailable.");
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
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    const local = hydrateState(raw ? JSON.parse(raw) : emptyState);
    setState(local);
    setShowOnboarding(localStorage.getItem(ONBOARDING_KEY) !== "complete");
    setLoaded(true);

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;
    async function connect(user: User) {
      setCloudUser(user);
      try {
        const cloud = await loadCloudState(supabase!, user);
        if (!active) return;
        if (cloud) {
          const merged = hydrateState(mergeStudyStates(hydrateState(cloud), local));
          setState(merged);
          await saveCloudState(supabase!, user, merged);
        } else await saveCloudState(supabase!, user, local);
        setCloudUsername(await loadUsername(supabase!, user));
        setCloudReady(true);
      } catch (error) {
        console.error(error);
        setStatus("Cloud sync setup needs attention; local history is still safe on this device.");
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void connect(data.session.user);
      else setCloudReady(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void connect(session.user);
      else {
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
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!cloudUser || !cloudReady) return;
    const client = getSupabaseClient();
    if (!client) return;
    const timer = window.setTimeout(() => {
      saveCloudState(client, cloudUser, state).catch((error) => {
        console.error(error);
        setStatus("Cloud save failed; local history remains available.");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, loaded, cloudUser, cloudReady]);

  useEffect(() => {
    if (!loaded) return;
    const params = new URLSearchParams(window.location.search);
    const displayForm = params.get("add_word")?.trim();
    if (!displayForm) return;
    const normalizedForm = normalizePersian(displayForm);
    const definition = params.get("definition")?.trim() || undefined;
    const romanization = params.get("romanization")?.trim() || undefined;
    setState((currentState) => {
      if (currentState.words.some((word) => word.normalizedForm === normalizedForm)) return currentState;
      const now = new Date();
      const fsrsCard = createSerializedCard(now);
      const word: LexicalItem = {
        id: id(), displayForm, normalizedForm, definition, romanization,
        sourceType: "user", sourceWeek: currentState.weekNumber, tier: "B",
        knowledgeState: "learning", topic: "Asl derivation",
        introducedAt: now.toISOString(), reviews: 0, correct: 0, lapses: 0,
        dueAt: fsrsCard.due, fsrsCard,
        modalityCards: { visual: fsrsCard, audio: fsrsCard, cloze: fsrsCard },
      };
      return { ...currentState, words: [...currentState.words, word] };
    });
    setTab("vocabulary");
    setStatus(`${displayForm} is in your Cursos vocabulary bank and can now appear in reviews, readings, and listenings.`);
    window.history.replaceState({}, "", window.location.pathname);
  }, [loaded]);

  const successfullyReviewedToday = useMemo(() => {
    const today = new Date().toDateString();
    return new Set(state.reviews
      .filter((review) => review.correct && new Date(review.reviewedAt).toDateString() === today)
      .map((review) => review.lexicalItemId));
  }, [state.reviews]);

  const due = useMemo(() => {
    const scheduled = state.words
      // A successful card is complete for the day even if FSRS's initial
      // learning step becomes due again during a long review session.
      .filter((word) => !successfullyReviewedToday.has(word.id))
      .filter((word) => new Date(word.modalityCards?.[reviewModality]?.due ?? word.dueAt).getTime() <= Date.now())
      .sort((a, b) => new Date(a.modalityCards?.[reviewModality]?.due ?? a.dueAt).getTime() - new Date(b.modalityCards?.[reviewModality]?.due ?? b.dueAt).getTime());
    if (reviewModality !== "cloze") return scheduled;
    return [...scheduled.filter(isPatternItem), ...scheduled.filter((word) => !isPatternItem(word))];
  }, [state.words, reviewModality, successfullyReviewedToday]);
  const current = due[0];
  const allocation = useMemo(() => adaptiveAllocation(state), [state]);
  const trainingPhase = useMemo(() => currentTrainingPhase(state.weekNumber), [state.weekNumber]);
  const bottleneck = useMemo(() => dominantBottleneck(state), [state]);
  const mature = state.words.filter((word) => word.reviews >= 4 && word.correct / Math.max(1, word.reviews) >= 0.8).length;
  const retention = state.reviews.length ? Math.round(100 * state.reviews.filter((review) => review.correct).length / state.reviews.length) : 0;
  const medianRecall = median(state.reviews.slice(-250).map((review) => review.responseMs));
  const latestPassage = state.passages.find((item) => item.id === activePassageId) ?? state.passages[0];
  const latestListening = state.listeningItems.find((item) => item.id === activeListeningId) ?? state.listeningItems[0];
  const transcriptRevealPercent = Math.min(100, transcriptRevealStep * 30);
  const transcriptVisible = transcriptRevealStep > 0;
  const listeningReveal = useMemo(
    () => latestListening ? progressiveListeningText(latestListening.transcriptFa, state.words, transcriptRevealPercent) : null,
    [latestListening, state.words, transcriptRevealPercent],
  );

  useEffect(() => {
    setRevealed(false);
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
  }, [current?.id, reviewModality]);

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

  async function signUp(username: string, email: string, password: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
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
    setStatus(data.session ? "Account created. Your course is syncing now." : "Account created. Check your email once to confirm it, then sign in.");
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

    enriched.forEach((word) => existing.add(normalizePersian(word.displayForm)));
    let advanced: AdvancedWord[] = [];
    try {
      const data = await generateJson({ kind: "advanced_words", weekNumber: state.weekNumber, existing: [...existing] });
      advanced = (data.words ?? []).filter((word: AdvancedWord) => !existing.has(normalizePersian(word.displayForm))).slice(0, 5);
    } catch {
      advanced = fallbackAdvanced(existing, 5);
    }
    if (advanced.length < 5) {
      const blocked = new Set([...existing, ...advanced.map((word) => normalizePersian(word.displayForm))]);
      advanced = [...advanced, ...fallbackAdvanced(blocked, 5 - advanced.length)];
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
      ...advanced.map((word) => makeWord(word.displayForm, word.definition, word.romanization, "system_advanced", word.topic)),
    ];
    setState((currentState) => ({ ...currentState, words: [...currentState.words, ...newWords] }));
    setInput("");
    setShowIntake(false);
    setStatus(`Added ${enriched.length} required words + ${advanced.length} advanced words for Week ${state.weekNumber}.`);
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

  function reveal() {
    setResponseMs(Date.now() - startRef.current);
    setRevealed(true);
  }

  function submitPatternAnswer() {
    if (!current || !patternInput.trim()) return;
    setResponseMs(Date.now() - startRef.current);
    setPatternMatched(answerMatchesDefinition(patternInput, current.definition));
    setPatternPhase("result");
  }

  async function playCurrentWord() {
    if (!current) return;
    try {
      const cacheKey = `word-${current.id}`;
      const cached = await readCachedSpeech(cacheKey);
      if (!cached && playWithDeviceVoice(current.displayForm)) {
        setStatus("Playing with the device’s Persian voice.");
        return;
      }
      const blob = cached ?? await prepareSpeech(current.displayForm, cacheKey);
      await playAudioBlob(blob);
      setStatus("Playing word audio.");
    } catch (error) {
      if (!playWithDeviceVoice(current.displayForm)) {
        setStatus(error instanceof Error ? error.message : "Word audio is unavailable on this device.");
        return;
      }
      setStatus("Playing with the device’s Persian voice.");
    }
  }

  async function rateKnown(correct: boolean) {
    if (!current) return;
    const measured = responseMs || Date.now() - startRef.current;
    // A learner's explicit correctness judgment should determine the schedule.
    // Response time remains useful analytics, but must not turn a correct answer
    // into a short-term "hard" card that reappears during the same session.
    const rating: ReviewRating = correct ? "good" : "again";
    const { before, after } = reviewFsrs(current.fsrsCard ?? current.modalityCards?.[reviewModality], rating, new Date());
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
        modalityCards: { ...word.modalityCards, visual: after, audio: after, cloze: after },
        knowledgeState: !correct
          ? "new"
          : measured <= 3_000 && word.reviews + 1 >= 5 && (word.correct + 1) / (word.reviews + 1) >= 0.9
            ? "automatic"
            : word.reviews + 1 >= 2 && (word.correct + 1) / (word.reviews + 1) >= 0.75
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
  }

  async function generatePractice(kind: "reading" | "listening", practiceMode: PracticeMode = "controlled") {
    if (generationBusy) return;
    setGenerationBusy(kind);
    setStatus(`Generating ${practiceMode === "transfer" ? "fresh transfer" : "controlled"} ${kind}…`);
    try {
      const words = selectContextWords(state, 80);
      const targetIlr = state.skillLevels[kind];
      const data = await generateJson({ kind, weekNumber: state.weekNumber, targetWords: words, targetIlr, practiceMode });
      if (!isMeaningfulPersianText(data.textFa)) throw new Error(`The generated ${kind} item had no valid Persian text. Please try again.`);
      const generatedTargets = [
        ...(Array.isArray(data.knownWordsUsed) ? data.knownWordsUsed : words.slice(0, 12)),
        ...(Array.isArray(data.newWordsIntroduced) ? data.newWordsIntroduced : []),
      ].filter((word): word is string => typeof word === "string").slice(0, 16);
      const generatedWordCount = data.textFa.trim().split(/\s+/).filter(Boolean).length;
      const unknownCount = Array.isArray(data.newWordsIntroduced) ? data.newWordsIntroduced.length : 0;
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
      setStatus(`${practiceMode === "transfer" ? "Fresh transfer" : "Controlled coverage"} ${kind} ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerationBusy(null);
    }
  }

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
      finishRapidListen();
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
      while (timingIndex + 1 < timings.length && timings[timingIndex + 1].start <= now) timingIndex += 1;
      const activeTiming = timingIndex >= 0 && now <= timings[timingIndex].end ? timings[timingIndex] : null;
      const word = activeTiming?.word ?? "";
      if (word !== lastWord) {
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
    const cacheKey = `aligned-${latestListening.id}`;
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
            modalityCards: Object.fromEntries(Object.entries(word.modalityCards ?? {}).map(([modality, card]) => [modality, { ...card, due: due.toISOString() }])),
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
    setStatus(`${displayForm} marked ${knowledgeState}. Its recall schedule and future practice were updated.`);
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
        words: currentState.words.map((word) => word.sourceWeek <= completedWeek && word.knowledgeState !== "automatic" ? { ...word, knowledgeState: "known" as const } : word),
      };
    });
    setStatus("Advanced to the next course week. Earlier vocabulary is now marked known and remains active in reviews, Reading, and Listening.");
  }

  if (!loaded) return <main>Loading…</main>;

  const weakWords = [...state.words]
    .filter((word) => word.reviews >= 2)
    .sort((a, b) => (a.correct / a.reviews) - (b.correct / b.reviews) || (b.medianResponseMs ?? 0) - (a.medianResponseMs ?? 0))
    .slice(0, 10);
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
  const inferenceSentenceCount = latestPassage ? persianSentences(latestPassage.textFa).length : 0;
  const inferenceReady = readingMode !== "inference"
    || (sentenceGists.length === inferenceSentenceCount && sentenceGists.every((gist) => gist.trim()));
  const focusedReadingQuestions = latestPassage?.questions.filter((question) => question.type !== "detail") ?? [];
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
  const focusedListeningQuestions = latestListening?.questions.filter((question) => question.type !== "detail") ?? [];
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

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "complete");
    setShowOnboarding(false);
  }

  function setSkillLevel(skill: "reading" | "listening" | "speaking", level: IlrLevel) {
    setState((currentState) => ({
      ...currentState,
      skillLevels: { ...currentState.skillLevels, [skill]: level },
    }));
    setStatus(`${TAB_LABELS[skill]} set to ILR ${level}.`);
  }

  function openAccount() {
    setTab("analytics");
    setShowProgressDetails(false);
    window.requestAnimationFrame(() => window.setTimeout(() => {
      document.querySelector(".account-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0));
  }

  if (!loaded) return <div className="onboarding-loading" />;
  if (showOnboarding) return <Onboarding onFinish={finishOnboarding} />;

  return <main>
    <header>
      <h1>{TAB_LABELS[tab]}</h1>
      <div className="row"><button className={`sync-indicator ${cloudUser && cloudReady ? "ready" : ""}`} onClick={openAccount} aria-label={cloudUser && cloudReady ? "Cloud sync active. Open account." : cloudUser ? "Cloud sync is connecting. Open account." : "Progress is local only. Open account to sign in."}>{cloudUser ? cloudReady ? "● Synced" : "○ Syncing" : "○ Local"}</button><HeaderLevelControls levels={state.skillLevels} onChange={setSkillLevel} /></div>
    </header>

    <nav className="tabs" aria-label="Cursos navigation">
      <div className="nav-section-heading"><span><i className="nav-flower">✺</i> Cursos <small>by Synapt’x</small></span><span>+</span></div>
      <div className="nav-dash" />
      <div className="nav-section-heading"><span><i>▲</i> Study</span><span>−</span></div>
      <div className="nav-dash" />
      <div className="nav-items">
        {(["today", "reading", "listening", "speaking", "vocabulary", "analytics"] as Tab[]).map((name) => <button key={name} className={tab === name ? "tab active" : "tab"} onClick={() => setTab(name)}><span className="nav-bullet">{tab === name ? "●" : "·"}</span>{TAB_LABELS[name]}</button>)}
      </div>
      <div className="nav-course">
        <span>Week {state.weekNumber}/{COURSE_META.weeks}</span>
        <span>Reading {state.skillLevels.reading} · Listening {state.skillLevels.listening}</span>
        <span>Speaking {state.skillLevels.speaking}</span>
      </div>
      <button className="guide-button" onClick={() => setShowOnboarding(true)} aria-label="Open getting started guide">?</button>
    </nav>

    {status && <div className="notice">{status}</div>}

    {showIntake && <section className="card intake">
      <h2>Week {state.weekNumber} intake</h2>
      <div className="muted">Paste your weekly course words. Missing definitions and romanization can be filled automatically. Five advanced terms are added.</div>
      <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={"کارمند — employee — kārmand\nبازداشت کردن — to arrest — bāzdāsht kardan\nآینده — future — āyande"} />
      <div className="row"><button className="primary" onClick={importWeek}>Import week + 5 advanced</button><button className="secondary" onClick={() => setShowIntake(false)}>Cancel</button></div>
    </section>}

    {tab === "today" && !showIntake && <section className="grid today-grid">
      <Metric label="Due now" value={String(due.length)} />
      <Metric label="Total words" value={String(state.words.length)} />
      <Metric label="Retention" value={`${retention}%`} />
      <Metric label="Median recall" value={medianRecall ? `${(medianRecall / 1000).toFixed(1)}s` : "—"} />

      <div className="card span-7 dashboard-primary">
        <div className="row spread"><h2>{state.words.length ? "Review" : "Start here"}</h2>{state.words.length > 0 && <div className="row"><button className={reviewModality === "visual" ? "mode-button active" : "mode-button"} onClick={() => setReviewModality("visual")}>Text</button><button className={reviewModality === "audio" ? "mode-button active" : "mode-button"} onClick={() => setReviewModality("audio")}>Audio</button><button className={reviewModality === "cloze" ? "mode-button active" : "mode-button"} onClick={() => setReviewModality("cloze")}>Patterns</button><span className="pill">{reviewModality === "cloze" ? "1s flash · type" : "3s · 8s · 15s"}</span></div>}</div>
        {current ? <>
          {reviewModality === "cloze" ? <div className="pattern-recall" aria-live="polite">
            {patternPhase === "flash" && <div className="pattern-flash">
              <span>{isPatternItem(current) ? "Phrase / compound" : "Word"} · memorize</span>
              <div className="fa hero-fa">{current.displayForm}</div>
              <div className="pattern-flash-meter" aria-hidden="true"><i /></div>
            </div>}
            {patternPhase === "answer" && <form className="pattern-answer" onSubmit={(event) => { event.preventDefault(); submitPatternAnswer(); }}>
              <label htmlFor="pattern-answer">The phrase is hidden. Type its English meaning.</label>
              <input ref={patternInputRef} id="pattern-answer" value={patternInput} onChange={(event) => setPatternInput(event.target.value)} placeholder="Type the meaning…" autoComplete="off" />
              <button className="primary" type="submit" disabled={!patternInput.trim()}>Check answer</button>
            </form>}
            {patternPhase === "result" && <div className="pattern-result">
              <span className={patternMatched ? "pattern-signal match" : "pattern-signal"}>{patternMatched ? "Likely match" : "Check your meaning"}</span>
              <div className="answer-block">
                <span className="muted">You typed</span><strong>{patternInput}</strong>
                <span className="muted">Expected</span><strong>{current.definition || "Definition missing"}</strong>
                {current.romanization && <span className="muted">{current.romanization}</span>}
                <span className="muted">Answer time {(responseMs / 1000).toFixed(1)}s</span>
              </div>
              <div className="row"><button className="danger" onClick={() => rateKnown(false)}>Needs work</button><button className="primary" onClick={() => rateKnown(true)}>Got it</button></div>
            </div>}
          </div> : <>
            {reviewModality === "visual" ? <div className="fa hero-fa">{current.displayForm}</div> : <div className="audio-recall"><button className="primary" onClick={() => void playCurrentWord()}>Play word</button><span className="muted">Identify it by sound before revealing.</span></div>}
            {!revealed ? <button className="primary" onClick={reveal}>Reveal meaning</button> : <>
              <div className="answer-block">
                <strong>{current.definition || "Definition missing — add it during intake or enable AI enrichment."}</strong>
                {current.romanization && <span className="muted">{current.romanization}</span>}
                <span className="muted">Recall time {(responseMs / 1000).toFixed(1)}s · correct answers move to the next review</span>
              </div>
              <div className="row"><button className="danger" onClick={() => rateKnown(false)}>I was wrong</button><button className="primary" onClick={() => rateKnown(true)}>I was right</button></div>
            </>}
          </>}
        </> : !currentCourseWeekImported ? <div className="next-action course-ready"><span className="next-number">01</span><h3>Start Unit 1.</h3><p>Week {state.weekNumber} contains {currentCourseWordCount} entries from {currentCourseLessonCount} lesson lists. Introductory-unit vocabulary has been removed. Every word becomes available immediately, with no daily cap.</p><div className="course-ready-meta"><span>{COURSE_META.entries.toLocaleString()} course entries</span><span>{COURSE_META.lessonLists} lesson lists</span><span>{COURSE_META.weeks} weeks</span></div><button className="primary" onClick={() => void importCourseWeek()} disabled={courseBusy}>{courseBusy ? "Preparing…" : state.weekNumber === 1 ? "Start Unit 1" : `Start Week ${state.weekNumber}`}</button></div> : state.words.length ? <div className="next-action"><h3>You&apos;re caught up.</h3><p>Choose Reading or Listening from the menu for your next session.</p></div> : <div className="next-action"><span className="next-number">01</span><h3>Add your first words.</h3><p>Add vocabulary manually to create your review schedule.</p><button className="primary" onClick={() => setShowIntake(true)}>Add words</button></div>}
      </div>

      <div className="card span-5 dashboard-secondary">
        <h2>Adaptive allocation</h2>
        <p className="muted">{trainingPhase.label} · {trainingPhase.focus}. Bottleneck: {bottleneck.label} ({bottleneck.evidence}).</p>
        {Object.entries(allocation).map(([name, value]) => <div key={name} className="allocation"><div className="row spread"><span>{name}</span><span className="muted">{value}%</span></div><div className="progress"><div style={{ width: `${value}%` }} /></div></div>)}
      </div>

      <div className="card span-8 dashboard-secondary">
        <div className="row spread"><h2>Current vocabulary</h2><span className="muted">{mature} mature</span></div>
        <div className="word-list">{state.words.slice(-14).reverse().map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><span>{word.romanization ? `${word.romanization} · ` : ""}{word.definition || "definition pending"}</span><span>W{word.sourceWeek} · {word.knowledgeState ?? "learning"} · {word.reviews} reviews · {word.sourceType === "system_advanced" ? "advanced" : word.sourceType === "course" || word.sourceType === "dli" ? "course" : "personal / Anki"}</span></div>)}</div>
      </div>

      {state.words.length > 0 && <div className="card span-4 dashboard-control">
        <h2>Course control</h2>
        <div className="queue">
          <button className="queue-button" onClick={() => setTab("reading")}><span>Reading lab</span><strong>{readingAverage || "start"}</strong></button>
          <button className="queue-button" onClick={() => setTab("listening")}><span>Listening lab</span><strong>{listeningAverage || "start"}</strong></button>
          <button className="queue-button" onClick={() => setTab("speaking")}><span>Speaking</span><strong>{speakingAverage || `S${state.skillLevels.speaking}`}</strong></button>
          <button className="queue-button" onClick={() => setTab("analytics")}><span>Difficult items</span><strong>{weakWords.length}</strong></button>
          <div className="queue-button"><span>Current cycle</span><strong>30 reports · 194 words</strong></div>
        </div>
      </div>}

    </section>}

    {tab === "reading" && <section className="grid">
      <div className="card span-12 lab-header"><div><h2>Reading · 30-report cycle</h2><span className="muted">Use the same report for reading, listening, and speaking transfer.</span></div><div className="row"><select aria-label="Choose reading report" value={latestPassage?.id ?? ""} disabled={Boolean(readingStartedAt || readingQuestionsOpen)} onChange={(event) => resetReadingLab(event.target.value)}>{state.passages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{latestPassage && <><a className="secondary button-link" href={`/print/reading/${latestPassage.id}`} target="_blank" rel="noreferrer">Print report</a><a className="secondary button-link" href={syntaxUrl(latestPassage.textFa)} target="_blank" rel="noreferrer">Inspect syntax ↗</a></>}<button className={readingMode === "full" ? "mode-button active" : "mode-button"} disabled={Boolean(readingStartedAt || readingQuestionsOpen)} onClick={() => { setReadingMode("full"); setSentenceGists([]); }}>Full text</button><button className={readingMode === "inference" ? "mode-button active" : "mode-button"} disabled={Boolean(readingStartedAt || readingQuestionsOpen)} onClick={() => { setReadingMode("inference"); setSentenceGists([]); }}>Inference</button></div></div>
      {latestPassage ? <>
        <div className="card span-7">
          <div className="row spread"><div><div className="muted">ILR ~{latestPassage.ilrEstimate} · {latestPassage.topic} · {latestPassage.genre} · {latestPassage.register}</div><h2>{latestPassage.title}</h2><SourceLine item={latestPassage} /></div>{!readingStartedAt && !readingQuestionsOpen && <button className="primary" onClick={() => { setReadingStartedAt(Date.now()); setReadingDurationMs(0); }}>Start timer</button>}</div>
          {!readingQuestionsOpen && (readingMode === "inference" ? <InferenceReadingText text={latestPassage.textFa} words={state.words} targetWords={latestPassage.targetWords} gists={sentenceGists} onGistsChange={setSentenceGists} disabled={!readingStartedAt} /> : <InteractivePersianText text={latestPassage.textFa} words={state.words} onStatus={setWordKnowledge} disabled={!readingStartedAt} className={readingStartedAt ? "fa passage" : "fa passage blurred"} />)}
          {readingMode === "full" && !!latestPassage.targetWords.length && <div className="target-strip"><span className="muted">Extracted targets</span>{latestPassage.targetWords.map((word) => <span className="pill fa-inline" key={word}>{word}</span>)}</div>}
          {readingStartedAt && !readingQuestionsOpen && <div className="row"><button className="primary" disabled={!inferenceReady} onClick={finishReading}>Finish reading · hide passage next</button>{readingMode === "inference" && !inferenceReady && <span className="muted">Capture the gist of each sentence first.</span>}<label>Unknown words <input className="small-input" type="number" min="0" value={readingUnknown} onChange={(event) => setReadingUnknown(Number(event.target.value))}/></label><label>Rereads <input className="small-input" type="number" min="0" value={readingRereads} onChange={(event) => setReadingRereads(Number(event.target.value))}/></label></div>}
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
          /> : <div className="empty">Finish reading to unlock questions.</div>}
        </div>
      </> : <div className="card span-12 empty">No passage. Generate one to begin.</div>}
    </section>}

    {tab === "listening" && <section className="grid">
      <div className="card span-12 lab-header"><div><h2>Listening · 30-report cycle</h2><span className="muted">Full tests the report. Gist isolates meaning. Rapid Captions connects sound to Persian words.</span></div><div className="row"><select aria-label="Choose listening report" value={latestListening?.id ?? ""} onChange={(event) => resetListeningLab(event.target.value)}>{state.listeningItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{latestListening && <><a className="secondary button-link" href={`/print/listening/${latestListening.id}`} target="_blank" rel="noreferrer">Print transcript</a><a className="secondary button-link" href={syntaxUrl(latestListening.transcriptFa)} target="_blank" rel="noreferrer">Inspect syntax ↗</a></>}<button className={listeningMode === "full" ? "mode-button active" : "mode-button"} onClick={() => { releasePlayback(); setListeningMode("full"); setListensCount(0); setListeningGists([]); setGistSentenceListenCounts([]); setGistAnsweredAfterListens([]); setGistHintedSentenceIndexes([]); setRapidCaptionListens(0); }}>Full audio</button><button className={listeningMode === "gist" ? "mode-button active" : "mode-button"} onClick={() => { releasePlayback(); setListeningMode("gist"); setListensCount(0); setTranscriptRevealStep(0); setListeningGists([]); setGistSentenceListenCounts([]); setGistAnsweredAfterListens([]); setGistHintedSentenceIndexes([]); setRapidCaptionListens(0); }}>Gist</button><button className={listeningMode === "rapid" ? "mode-button active" : "mode-button"} onClick={() => { releasePlayback(); setListeningMode("rapid"); setListensCount(0); setTranscriptRevealStep(0); setRapidCaptionListens(0); }}>Rapid captions</button></div></div>
      {latestListening ? <>
        <div className="card span-7">
          <div className="muted">ILR ~{latestListening.ilrEstimate} · {latestListening.topic} · {latestListening.genre} · {latestListening.register}</div><h2>{latestListening.title}</h2><SourceLine item={latestListening} />
          {listeningMode === "gist" ? <GistListening sentences={gistListeningSentences} words={state.words} gists={listeningGists} listenCounts={gistSentenceListenCounts} hintedSentenceIndexes={gistHintedSentenceIndexes} busy={audioBusy} onPlay={(index) => void playGistSentence(index)} onGistChange={updateListeningGist} onHint={(index) => setGistHintedSentenceIndexes((current) => [...new Set([...current, index])])} /> : listeningMode === "rapid" ? <RapidCaptions currentWord={rapidCaptionWord} captionListens={rapidCaptionListens} playing={rapidPlaying} preparing={audioBusy} onPlay={() => void playRapidListening()} onExit={() => { releasePlayback(); setListeningMode("full"); setListensCount(0); setRapidCaptionListens(0); }} /> : <>
            <div className="audio-stage"><button className="primary big-button" disabled={audioBusy} onClick={playListening}>{audioBusy ? "Starting…" : "▶ Play Persian audio"}</button><span className="muted">listens: {listensCount}</span></div>
            {transcriptVisible && listeningReveal ? <InteractivePersianText text={listeningReveal.text} words={state.words} onStatus={setWordKnowledge} className="fa passage progressive-transcript" /> : <div className="transcript-hidden">Transcript hidden</div>}
            <div className="row">
              <button className="secondary" disabled={transcriptRevealPercent >= 100 || listeningReveal?.unknownCount === 0} onClick={() => setTranscriptRevealStep((step) => Math.min(4, step + 1))}>{transcriptRevealPercent === 0 ? "Reveal 30% of unknown words" : transcriptRevealPercent < 90 ? "Reveal 30% more" : transcriptRevealPercent < 100 ? "Reveal final 10%" : "All unknown words revealed"}</button>
              {transcriptVisible && listeningReveal && <span className="pill">{listeningReveal.revealedCount}/{listeningReveal.unknownCount} unknown words · reveal logged</span>}
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
      <div className="card span-12"><div className="row spread"><div><h2>Vocabulary bank</h2><p className="muted">Course, news-frequency, and personally researched words share one bank and feed reviews, readings, and listenings.</p></div><span className="pill">{state.words.length} total</span></div></div>
      <div className="card span-6"><h2>DLI Chapter 4–5.1 · 94</h2><div className="word-list">{state.words.filter((word) => word.sourceType === "course").map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><span>{word.definition}</span><span>{word.courseLesson}</span></div>)}</div></div>
      <div className="card span-6"><h2>News-frequency words · 100</h2><div className="word-list">{state.words.filter((word) => word.sourceType === "system_advanced").map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><span>{word.romanization ? `${word.romanization} · ` : ""}{word.definition}</span><span>BBC Persian + Iran International · 2,000-word sample</span></div>)}</div></div>
      <div className="card span-12"><h2>My words · {state.words.filter((word) => word.sourceType === "user").length}</h2><div className="word-list single">{state.words.filter((word) => word.sourceType === "user").map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><span>{word.romanization ? `${word.romanization} · ` : ""}{word.definition}</span><span>{word.topic || "Personal vocabulary"}</span><a className="inspect-word" href={morphologyUrl(word.displayForm)} target="_blank" rel="noreferrer">Inspect morphology in Synaptx ↗</a></div>)}</div>{!state.words.some((word) => word.sourceType === "user") && <div className="empty">Words researched in Asl will appear here.</div>}</div>
    </section>}

    {tab === "analytics" && !showProgressDetails && <section className="guided-workspace"><div className="guided-overview">
      <span className="next-number">01</span><h2>Know why you&apos;re improving.</h2>
      <p>Progress is based on evidence from practice—not a streak or time spent in the app. The system looks for faster recall, stronger comprehension, and reliable performance across different material.</p>
      <div className="guided-capabilities"><div><span>Recall</span><p>Separate text, audio, and rapid-pattern accuracy, response time, lapses, and difficult vocabulary.</p></div><div><span>Comprehension</span><p>Main idea, detail, inference, discourse, first-pass listening, and transcript dependence.</p></div><div><span>Coverage</span><p>Performance by topic, source, genre, register, origin, and difficulty.</p></div><div><span>Readiness</span><p>Fresh target-level attempts—not familiar practice—control level-up decisions.</p></div></div>
      <div className="progress-snapshot"><span><small>Words</small><strong>{state.words.length}</strong></span><span><small>Reviews</small><strong>{state.reviews.length}</strong></span><span><small>Reading</small><strong>{readingAverage ? `${readingAverage}%` : "—"}</strong></span><span><small>Listening</small><strong>{listeningAverage ? `${listeningAverage}%` : "—"}</strong></span></div>
      <button className="primary" onClick={() => setShowProgressDetails(true)}>View detailed progress</button>
    </div></section>}

    {tab === "analytics" && showProgressDetails && <><button className="back-link progress-back" onClick={() => setShowProgressDetails(false)}>← Back</button><section className="grid analytics-grid">
      <Metric label="Words learned" value={String(state.words.length)} />
      <Metric label="Reviews logged" value={String(state.reviews.length)} />
      <Metric label="Reading avg (5)" value={readingAverage ? `${readingAverage}%` : "—"} />
      <Metric label="Listening avg (5)" value={listeningAverage ? `${listeningAverage}%` : "—"} />
      <div className="card span-12"><h2>Current training phase</h2><div className="queue"><div className="queue-item"><span>{trainingPhase.label}<small>{trainingPhase.focus}</small></span><strong>{trainingPhase.authenticTarget}% authentic target</strong></div><div className="queue-item"><span>Adaptive bottleneck<small>{bottleneck.evidence}</small></span><strong>{bottleneck.label}</strong></div></div></div>
      <div className="card span-7"><h2>Weak / slow lexical items</h2><div className="word-list single">{weakWords.map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><span>{word.definition}</span><span>{Math.round(100 * word.correct / word.reviews)}% correct · {word.medianResponseMs ? `${(word.medianResponseMs / 1000).toFixed(1)}s median` : "no latency"} · {word.lapses} lapses</span></div>)}</div>{!weakWords.length && <div className="empty">Not enough review history yet.</div>}</div>
      <div className="card span-5"><h2>Performance history</h2><div className="queue"><div className="queue-item"><span>Reading attempts</span><strong>{state.passageAttempts.length}</strong></div><div className="queue-item"><span>Inference-mode attempts</span><strong>{inferenceAttempts.length}</strong></div><div className="queue-item"><span>Listening attempts</span><strong>{state.listeningAttempts.length}</strong></div><div className="queue-item"><span>Gist-listening attempts</span><strong>{gistListeningAttempts.length}</strong></div><div className="queue-item"><span>Speaking attempts</span><strong>{state.speakingAttempts.length}</strong></div><div className="queue-item"><span>Speaking avg (5)</span><strong>{speakingAverage ? `${speakingAverage}%` : "—"}</strong></div><div className="queue-item"><span>Mature vocabulary</span><strong>{mature}</strong></div><div className="queue-item"><span>Current week</span><strong>{state.weekNumber}/{COURSE_META.weeks}</strong></div></div></div>
      <div className="card span-12"><h2>Recent diagnostics</h2><div className="diagnostic-grid"><Diagnostic label="Text retention" value={visualRetention} /><Diagnostic label="Audio retention" value={audioReviews.length ? audioRetention : 0} /><Diagnostic label="Pattern retention" value={patternReviews.length ? patternRetention : 0} /><Diagnostic label="Inference-mode avg" value={inferenceAttempts.length ? inferenceAverage : 0} /><Diagnostic label="Gist-listening avg" value={gistListeningAttempts.length ? gistListeningAverage : 0} /><Diagnostic label="First-listen gists" value={recentGistAnswerCounts.length ? firstListenGistRate : 0} /><Diagnostic label="First-listen score" value={firstListenScore} /><Diagnostic label="Transcript reveal" value={transcriptRate} /><Diagnostic label="Reading inference" value={Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.inferenceScore)))} /><Diagnostic label="Reading discourse" value={Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.discourseScore)))} /><Diagnostic label="Listening detail" value={Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.detailScore)))} /><Diagnostic label="Listening inference" value={Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.inferenceScore)))} /></div></div>
      <AnalyticsTable title="Attempts by source" rows={sourceAnalytics} />
      <AnalyticsTable title="Attempts by genre" rows={genreAnalytics} />
      <AnalyticsTable title="Attempts by register" rows={registerAnalytics} />
      <AnalyticsTable title="Attempts by topic" rows={topicAnalytics} />
      <AnalyticsTable title="Attempts by difficulty" rows={difficultyAnalytics} />
      <AnalyticsTable title="Authentic vs generated" rows={originAnalytics} />
    </section></>}

    {tab === "analytics" && <AccountWorkspace
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
  </main>;
}

function SourceLine({ item }: { item: Passage | ListeningItem }) {
  if (item.sourceType === "generated") return <div className="source-line"><span className="pill">{item.practiceMode === "transfer" ? "fresh transfer" : "controlled"}</span></div>;
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
