"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import AccountWorkspace from "@/components/AccountWorkspace";
import AnkiWorkspace from "@/components/AnkiWorkspace";
import ComprehensionGrader from "@/components/ComprehensionGrader";
import InteractivePersianText from "@/components/InteractivePersianText";
import Onboarding from "@/components/Onboarding";
import SourceIngestion from "@/components/SourceIngestion";
import SpeakingLab from "@/components/SpeakingLab";
import { adaptiveAllocation, selectContextWords } from "@/lib/adaptive";
import { fallbackAdvanced, type AdvancedWord } from "@/lib/advanced";
import type { AnkiReviewRow, AnkiVocabularyRow } from "@/lib/anki";
import { COURSE_META, loadCourseWeek } from "@/lib/course";
import { autoRatingForKnown, createSerializedCard, reviewFsrs } from "@/lib/fsrs";
import { normalizePersian, parseWeeklyInput } from "@/lib/persian";
import { isMeaningfulPersianText, sanitizePersianSpeechText } from "@/lib/persian-speech";
import { sourceMetrics } from "@/lib/source-analytics";
import { appendCloudReview, getSupabaseClient, loadCloudState, loadUsername, saveCloudState } from "@/lib/supabase";
import type {
  ComprehensionGrade,
  LexicalItem,
  ListeningAttempt,
  ListeningItem,
  IlrLevel,
  Passage,
  PassageAttempt,
  ReviewEvent,
  ReviewRating,
  SpeakingAttempt,
  SpeakingPrompt,
  StudyState,
  WordKnowledgeState,
} from "@/lib/types";

const STORAGE_KEY = "ilr-persian-v3";
const ONBOARDING_KEY = "ilr-persian-onboarding-v1";
const LEGACY_KEYS = ["ilr-persian-v2", "ilr-persian-v1"];

type Tab = "today" | "sources" | "reading" | "listening" | "speaking" | "anki" | "analytics";

const TAB_LABELS: Record<Tab, string> = {
  today: "Today",
  sources: "Sources",
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  anki: "Anki",
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
  course: { catalogId: COURSE_META.id, sourceFile: COURSE_META.sourceFile, importedWeeks: [] },
  anki: { endpoint: "http://127.0.0.1:8765", deckName: "" },
  words: [],
  reviews: [],
  passages: [],
  passageAttempts: [],
  listeningItems: [],
  listeningAttempts: [],
  speakingPrompts: [],
  speakingAttempts: [],
};

function id() {
  return crypto.randomUUID();
}

function hydrateState(raw: Partial<StudyState> | null | undefined): StudyState {
  const catalogChanged = Boolean(raw?.course?.catalogId && raw.course.catalogId !== COURSE_META.id);
  const importedWeeks = catalogChanged
    ? (raw?.course?.importedWeeks ?? []).filter((week) => week > 1).map((week) => week - 1)
    : (raw?.course?.importedWeeks ?? []);
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
      ...(raw?.course ?? {}),
      catalogId: COURSE_META.id,
      importedWeeks,
    },
    anki: { ...emptyState.anki, ...(raw?.anki ?? {}) },
    words: (raw?.words ?? [])
      .filter((word) => !word.courseLesson?.startsWith("Introductory Unit"))
      .map((word) => catalogChanged && word.courseLesson && word.sourceWeek > 1 ? { ...word, sourceWeek: word.sourceWeek - 1 } : word),
    reviews: raw?.reviews ?? [],
    passages: (raw?.passages ?? []).map((item) => ({ ...item, genre: item.genre ?? "generated practice", sourceType: item.sourceType ?? "generated" })),
    passageAttempts: raw?.passageAttempts ?? [],
    listeningItems: (raw?.listeningItems ?? []).map((item) => ({ ...item, genre: item.genre ?? "generated practice", sourceType: item.sourceType ?? "generated" })),
    listeningAttempts: raw?.listeningAttempts ?? [],
    speakingPrompts: raw?.speakingPrompts ?? [],
    speakingAttempts: raw?.speakingAttempts ?? [],
  };
  state.words = state.words.map((word) => {
    const fsrsCard = word.fsrsCard ?? createSerializedCard(new Date(word.introducedAt || Date.now()));
    const knowledgeState = word.knowledgeState ?? (word.sourceWeek < state.weekNumber ? "known" : "learning");
    return { ...word, knowledgeState, fsrsCard, dueAt: word.dueAt || fsrsCard.due };
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
  const [sourceView, setSourceView] = useState<"reading" | "listening" | "library" | null>(null);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [courseBusy, setCourseBusy] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudUsername, setCloudUsername] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [responseMs, setResponseMs] = useState(0);
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null);
  const [readingDurationMs, setReadingDurationMs] = useState(0);
  const [readingQuestionsOpen, setReadingQuestionsOpen] = useState(false);
  const [readingUnknown, setReadingUnknown] = useState(0);
  const [readingRereads, setReadingRereads] = useState(0);
  const [listensCount, setListensCount] = useState(0);
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [activeListeningId, setActiveListeningId] = useState<string | null>(null);
  const startRef = useRef(Date.now());

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
        if (cloud) setState(hydrateState(cloud));
        else await saveCloudState(supabase!, user, local);
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

  const due = useMemo(
    () => state.words.filter((word) => new Date(word.dueAt).getTime() <= Date.now()),
    [state.words],
  );
  const current = due[reviewIndex % Math.max(1, due.length)];
  const allocation = useMemo(() => adaptiveAllocation(state), [state]);
  const mature = state.words.filter((word) => word.reviews >= 4 && word.correct / Math.max(1, word.reviews) >= 0.8).length;
  const retention = state.reviews.length ? Math.round(100 * state.reviews.filter((review) => review.correct).length / state.reviews.length) : 0;
  const medianRecall = median(state.reviews.slice(-250).map((review) => review.responseMs));
  const latestPassage = state.passages.find((item) => item.id === activePassageId) ?? state.passages.at(-1);
  const latestListening = state.listeningItems.find((item) => item.id === activeListeningId) ?? state.listeningItems.at(-1);
  const latestSpeakingPrompt = state.speakingPrompts.at(-1);

  useEffect(() => {
    setRevealed(false);
    setResponseMs(0);
    startRef.current = Date.now();
  }, [current?.id]);

  async function signIn(email: string, password: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? error.message : "Signed in. Your course is syncing now.");
  }

  async function signUp(username: string, email: string, password: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    setStatus(error ? error.message : data.session ? "Account created. Your course is syncing now." : "Account created. Check your email once to confirm it, then sign in.");
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
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
        topic,
        introducedAt: now.toISOString(),
        reviews: 0,
        correct: 0,
        lapses: 0,
        dueAt: fsrsCard.due,
        fsrsCard,
      };
    };

    const newWords = [
      ...enriched.map((word) => makeWord(word.displayForm, word.definition, word.romanization, "course")),
      ...advanced.map((word) => makeWord(word.displayForm, word.definition, word.romanization, "system_advanced", word.topic)),
    ];
    setState((currentState) => ({ ...currentState, words: [...currentState.words, ...newWords] }));
    setInput("");
    setShowIntake(false);
    setReviewIndex(0);
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
      }).map((entry, index): LexicalItem => {
        const now = new Date();
        const scheduledAt = new Date(now);
        scheduledAt.setDate(now.getDate() + Math.min(6, Math.floor(index / 25)));
        const fsrsCard = createSerializedCard(scheduledAt);
        return {
          id: id(),
          displayForm: entry.fa,
          normalizedForm: normalizePersian(entry.fa),
          definition: entry.en,
          sourceType: "course",
          sourceWeek: targetWeek,
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
      setReviewIndex(0);
      const duplicates = entries.length - incoming.length;
      setStatus(`Week ${targetWeek} ready · ${incoming.length} new words · ${Math.min(25, incoming.length)} due today${duplicates ? ` · ${duplicates} repeats skipped` : ""}.`);
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

  async function rateKnown(correct: boolean) {
    if (!current) return;
    const measured = responseMs || Date.now() - startRef.current;
    const rating: ReviewRating = correct ? autoRatingForKnown(measured) : "again";
    const { before, after } = reviewFsrs(current.fsrsCard, rating, new Date());
    const event: ReviewEvent = {
      id: id(),
      lexicalItemId: current.id,
      reviewedAt: new Date().toISOString(),
      correct,
      responseMs: measured,
      rating,
      modality: "visual",
      schedulerBefore: before,
      schedulerAfter: after,
    };
    setState((currentState) => ({
      ...currentState,
      reviews: [...currentState.reviews, event],
      words: currentState.words.map((word) => word.id !== current.id ? word : {
        ...word,
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
    setReviewIndex((index) => index + 1);
  }

  async function generatePractice(kind: "reading" | "listening") {
    setStatus(`Generating adaptive ${kind}…`);
    try {
      const words = selectContextWords(state, 80);
      const targetIlr = state.skillLevels[kind];
      const data = await generateJson({ kind, weekNumber: state.weekNumber, targetWords: words, targetIlr });
      if (!isMeaningfulPersianText(data.textFa)) throw new Error(`The generated ${kind} item had no valid Persian text. Please try again.`);
      const generatedTargets = [
        ...(Array.isArray(data.knownWordsUsed) ? data.knownWordsUsed : words.slice(0, 12)),
        ...(Array.isArray(data.newWordsIntroduced) ? data.newWordsIntroduced : []),
      ].filter((word): word is string => typeof word === "string").slice(0, 16);
      if (kind === "reading") {
        const passage: Passage = {
          id: id(),
          title: data.title,
          textFa: data.textFa,
          ilrEstimate: targetIlr,
          topic: data.topic,
          register: data.register,
          genre: "generated practice",
          sourceType: "generated",
          targetWords: generatedTargets,
          questions: data.questions ?? [],
          createdAt: new Date().toISOString(),
        };
        setState((currentState) => ({ ...currentState, passages: [...currentState.passages, passage] }));
        setActivePassageId(passage.id);
        setReadingStartedAt(null);
        setReadingDurationMs(0);
        setReadingQuestionsOpen(false);
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
          genre: "generated practice",
          sourceType: "generated",
          targetWords: generatedTargets,
          questions: data.questions ?? [],
          createdAt: new Date().toISOString(),
        };
        setState((currentState) => ({ ...currentState, listeningItems: [...currentState.listeningItems, item] }));
        setActiveListeningId(item.id);
        setListensCount(0);
        setTranscriptVisible(false);
      }
      setStatus(`Adaptive ${kind} ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
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
    };
    setState((currentState) => ({ ...currentState, passageAttempts: [...currentState.passageAttempts, attempt] }));
    setReadingStartedAt(null);
    setReadingDurationMs(0);
    setStatus(`Reading saved · ${result.grade.overallScore}% comprehension. Adaptive allocation updated.`);
  }

  async function playListening() {
    if (!latestListening) return;
    if (!isMeaningfulPersianText(latestListening.transcriptFa)) {
      setStatus("That saved Listening item has an invalid transcript. Creating a clean replacement…");
      await generatePractice("listening");
      return;
    }
    const speechText = sanitizePersianSpeechText(latestListening.transcriptFa);
    setStatus("Preparing Persian audio…");
    try {
      if (latestListening.mediaUrl) {
        await new Audio(latestListening.mediaUrl).play();
        setListensCount((count) => count + 1);
        setStatus("Playing source audio.");
        return;
      }
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speechText }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.startsWith("audio/")) {
        const message = contentType.includes("json") ? (await response.json()).error : "Persian audio could not be generated.";
        throw new Error(message || "Persian audio could not be generated.");
      }
      const blob = await response.blob();
      if (blob.size < 1000) throw new Error("The generated audio file was empty.");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setListensCount((count) => count + 1);
      setStatus("Playing Persian audio.");
    } catch (error) {
      const persianVoice = typeof speechSynthesis === "undefined" ? undefined : speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("fa"));
      if (persianVoice) {
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = persianVoice.lang;
        utterance.voice = persianVoice;
        utterance.rate = 0.95;
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
        setListensCount((count) => count + 1);
        setStatus("Playing with the device’s Persian voice.");
      } else {
        setStatus(error instanceof Error ? error.message : "Persian audio is unavailable. Try again in a moment.");
      }
    }
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
    };
    setState((currentState) => ({ ...currentState, listeningAttempts: [...currentState.listeningAttempts, attempt] }));
    setStatus(`Listening saved · ${result.grade.overallScore}% comprehension after ${listensCount} listen${listensCount === 1 ? "" : "s"}.`);
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
        topic: "anki",
        introducedAt: now.toISOString(),
        reviews: 0,
        correct: 0,
        lapses: 0,
        dueAt: fsrsCard.due,
        fsrsCard,
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
        knowledgeState,
        introducedAt: new Date().toISOString(),
        reviews: 0,
        correct: 0,
        lapses: 0,
        dueAt: fsrsCard.due,
        fsrsCard,
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
  const currentCourseWeekImported = state.course.importedWeeks.includes(state.weekNumber);
  const currentCourseWordCount = COURSE_META.weekCounts[state.weekNumber - 1];
  const currentCourseLessonCount = COURSE_META.weekLessonCounts[state.weekNumber - 1];

  function resetReadingLab(passageId: string) {
    setActivePassageId(passageId);
    setReadingStartedAt(null);
    setReadingDurationMs(0);
    setReadingQuestionsOpen(false);
    setReadingUnknown(0);
    setReadingRereads(0);
    setTab("reading");
  }

  function resetListeningLab(itemId: string) {
    setActiveListeningId(itemId);
    setListensCount(0);
    setTranscriptVisible(false);
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

  if (!loaded) return <div className="onboarding-loading" />;
  if (showOnboarding) return <Onboarding onFinish={finishOnboarding} />;

  return <main>
    <header>
      <h1>{TAB_LABELS[tab]}</h1>
      <div className="row"><HeaderLevelControls levels={state.skillLevels} onChange={setSkillLevel} />{(state.words.length > 0 || tab !== "today") && <button className="primary" onClick={() => { setTab("today"); setShowIntake((value) => !value); }}>Add words</button>}</div>
    </header>

    <nav className="tabs" aria-label="Study index">
      <div className="nav-section-heading"><span><i className="nav-flower">✺</i> Index</span><span>+</span></div>
      <div className="nav-dash" />
      <div className="nav-section-heading"><span><i>▲</i> Study</span><span>−</span></div>
      <div className="nav-dash" />
      <div className="nav-items">
        {(["today", "sources", "reading", "listening", "speaking", "anki", "analytics"] as Tab[]).map((name) => <button key={name} className={tab === name ? "tab active" : "tab"} onClick={() => setTab(name)}><span className="nav-bullet">{tab === name ? "●" : "·"}</span>{TAB_LABELS[name]}</button>)}
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
        <div className="row spread"><h2>{state.words.length ? "Review" : "Start here"}</h2>{state.words.length > 0 && <span className="pill">3s automatic · 8s solid · 15s ceiling</span>}</div>
        {current ? <>
          <div className="fa hero-fa">{current.displayForm}</div>
          {!revealed ? <button className="primary" onClick={reveal}>Reveal meaning</button> : <>
            <div className="answer-block">
              <strong>{current.definition || "Definition missing — add it during intake or enable AI enrichment."}</strong>
              {current.romanization && <span className="muted">{current.romanization}</span>}
              <span className="muted">Recall time {(responseMs / 1000).toFixed(1)}s · correct answers auto-grade {autoRatingForKnown(responseMs)}</span>
            </div>
            <div className="row"><button className="danger" onClick={() => rateKnown(false)}>I was wrong</button><button className="primary" onClick={() => rateKnown(true)}>I was right</button></div>
          </>}
        </> : !currentCourseWeekImported ? <div className="next-action course-ready"><span className="next-number">01</span><h3>Start Unit 1.</h3><p>Week {state.weekNumber} contains {currentCourseWordCount} entries from {currentCourseLessonCount} lesson lists. Introductory-unit vocabulary has been removed. The first 25 words become available today; the rest arrive gradually through the week.</p><div className="course-ready-meta"><span>{COURSE_META.entries.toLocaleString()} course entries</span><span>{COURSE_META.lessonLists} lesson lists</span><span>{COURSE_META.weeks} weeks</span></div><button className="primary" onClick={() => void importCourseWeek()} disabled={courseBusy}>{courseBusy ? "Preparing…" : state.weekNumber === 1 ? "Start Unit 1" : `Start Week ${state.weekNumber}`}</button></div> : state.words.length ? <div className="next-action"><h3>You&apos;re caught up.</h3><p>Choose Reading or Listening from the menu for your next session.</p></div> : <div className="next-action"><span className="next-number">01</span><h3>Add your first words.</h3><p>Add vocabulary manually to create your review schedule.</p><button className="primary" onClick={() => setShowIntake(true)}>Add words</button></div>}
      </div>

      <div className="card span-5 dashboard-secondary">
        <h2>Adaptive allocation</h2>
        <p className="muted">Reading, Listening, and Speaking all begin at Level 1. Change them from the compact controls in the top-right corner.</p>
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
          <button className="queue-button" onClick={advanceWeek} disabled={state.weekNumber >= COURSE_META.weeks}><span>Advance course week</span><strong>W{Math.min(COURSE_META.weeks, state.weekNumber + 1)}</strong></button>
        </div>
      </div>}

    </section>}

    {tab === "sources" && <section className="guided-workspace">
      {!sourceView && <div className="guided-overview">
        <span className="next-number">01</span><h2>Train with real Persian.</h2>
        <p>Add a short excerpt or transcript from a real source. The app turns it into level-appropriate practice while keeping its origin attached.</p>
        <div className="guided-capabilities"><div><span>Preserve</span><p>Keep title, publisher, date, link, and authentic or adapted status.</p></div><div><span>Analyze</span><p>Identify topic, genre, register, level, questions, and useful vocabulary.</p></div><div><span>Practice</span><p>Send the material directly into Reading or Listening.</p></div><div><span>Compare</span><p>See which sources, genres, and registers are improving or causing difficulty.</p></div></div>
        <div className="row guided-paths"><button className="primary" onClick={() => setSourceView("reading")}>Add reading source</button><button className="primary" onClick={() => setSourceView("listening")}>Add listening source</button><button className="secondary" onClick={() => setSourceView("library")}>View library</button></div>
      </div>}
      {(sourceView === "reading" || sourceView === "listening") && <><button className="back-link" onClick={() => setSourceView(null)}>← Back</button><SourceIngestion
        key={sourceView}
        initialModality={sourceView}
        knownWords={state.words.map((word) => word.displayForm)}
        makeId={id}
        onStatus={setStatus}
        onReading={(passage) => { setState((currentState) => ({ ...currentState, passages: [...currentState.passages, passage] })); resetReadingLab(passage.id); }}
        onListening={(item) => { setState((currentState) => ({ ...currentState, listeningItems: [...currentState.listeningItems, item] })); resetListeningLab(item.id); }}
      /></>}
      {sourceView === "library" && <><button className="back-link" onClick={() => setSourceView(null)}>← Back</button><section className="grid source-library">
        <div className="card span-6"><h2>Reading source library</h2><div className="queue">{state.passages.slice().reverse().map((item) => <button className="queue-button source-row" key={item.id} onClick={() => resetReadingLab(item.id)}><span><strong>{item.title}</strong><small>{item.publisher || "AI-generated"} · {item.genre} · {item.register} · ILR {item.ilrEstimate}</small></span><span className={`pill origin-${item.sourceType}`}>{item.sourceType}</span></button>)}</div>{!state.passages.length && <div className="empty">No reading sources yet.</div>}</div>
        <div className="card span-6"><h2>Listening source library</h2><div className="queue">{state.listeningItems.slice().reverse().map((item) => <button className="queue-button source-row" key={item.id} onClick={() => resetListeningLab(item.id)}><span><strong>{item.title}</strong><small>{item.publisher || "AI-generated"} · {item.genre} · {item.register} · ILR {item.ilrEstimate}</small></span><span className={`pill origin-${item.sourceType}`}>{item.sourceType}</span></button>)}</div>{!state.listeningItems.length && <div className="empty">No listening sources yet.</div>}</div>
      </section></>}
    </section>}

    {tab === "reading" && <section className="grid">
      <div className="card span-12 lab-header"><h2>Reading</h2><button className="primary" onClick={() => generatePractice("reading")}>New passage</button></div>
      {latestPassage ? <>
        <div className="card span-7">
          <div className="row spread"><div><div className="muted">ILR ~{latestPassage.ilrEstimate} · {latestPassage.topic} · {latestPassage.genre} · {latestPassage.register}</div><h2>{latestPassage.title}</h2><SourceLine item={latestPassage} /></div>{!readingStartedAt && !readingQuestionsOpen && <button className="primary" onClick={() => { setReadingStartedAt(Date.now()); setReadingDurationMs(0); }}>Start timer</button>}</div>
          <InteractivePersianText text={latestPassage.textFa} words={state.words} onStatus={setWordKnowledge} disabled={!readingStartedAt || readingQuestionsOpen} className={readingStartedAt || readingQuestionsOpen ? "fa passage" : "fa passage blurred"} />
          {!!latestPassage.targetWords.length && <div className="target-strip"><span className="muted">Extracted targets</span>{latestPassage.targetWords.map((word) => <span className="pill fa-inline" key={word}>{word}</span>)}</div>}
          {readingStartedAt && !readingQuestionsOpen && <div className="row"><button className="primary" onClick={finishReading}>Finish reading · hide passage next</button><label>Unknown words <input className="small-input" type="number" min="0" value={readingUnknown} onChange={(event) => setReadingUnknown(Number(event.target.value))}/></label><label>Rereads <input className="small-input" type="number" min="0" value={readingRereads} onChange={(event) => setReadingRereads(Number(event.target.value))}/></label></div>}
          {readingQuestionsOpen && <div className="locked-source"><strong>Passage locked for recall.</strong><span className="muted">Reading time: {(readingDurationMs / 1000).toFixed(0)}s · unknown words: {readingUnknown} · rereads: {readingRereads}</span></div>}
        </div>
        <div className="card span-5">
          {readingQuestionsOpen ? <ComprehensionGrader
            key={latestPassage.id}
            kind="reading"
            sourceText={latestPassage.textFa}
            questions={latestPassage.questions}
            ilrEstimate={latestPassage.ilrEstimate}
            onComplete={completeReading}
          /> : <div className="empty">Finish reading to unlock questions.</div>}
        </div>
      </> : <div className="card span-12 empty">No passage. Generate one to begin.</div>}
    </section>}

    {tab === "listening" && <section className="grid">
      <div className="card span-12 lab-header"><h2>Listening</h2><button className="primary" onClick={() => generatePractice("listening")}>New audio</button></div>
      {latestListening ? <>
        <div className="card span-7">
          <div className="muted">ILR ~{latestListening.ilrEstimate} · {latestListening.topic} · {latestListening.genre} · {latestListening.register}</div><h2>{latestListening.title}</h2><SourceLine item={latestListening} />
          <div className="audio-stage"><button className="primary big-button" onClick={playListening}>▶ Play Persian audio</button><span className="muted">listens: {listensCount}</span></div>
          {transcriptVisible ? <InteractivePersianText text={latestListening.transcriptFa} words={state.words} onStatus={setWordKnowledge} className="fa passage" /> : <div className="transcript-hidden">Transcript hidden</div>}
          {transcriptVisible && !!latestListening.targetWords.length && <div className="target-strip"><span className="muted">Extracted targets</span>{latestListening.targetWords.map((word) => <span className="pill fa-inline" key={word}>{word}</span>)}</div>}
          <div className="row"><button className="secondary" onClick={() => setTranscriptVisible(true)}>Reveal transcript</button>{transcriptVisible && <span className="pill">transcript reveal logged</span>}</div>
        </div>
        <div className="card span-5">
          {listensCount > 0 ? <ComprehensionGrader
            key={latestListening.id}
            kind="listening"
            sourceText={latestListening.transcriptFa}
            questions={latestListening.questions}
            ilrEstimate={latestListening.ilrEstimate}
            listensCount={listensCount}
            transcriptRevealed={transcriptVisible}
            onComplete={completeListening}
          /> : <div className="empty">Play the audio at least once before answering.</div>}
        </div>
      </> : <div className="card span-12 empty">No audio. Generate one to begin.</div>}
    </section>}

    {tab === "speaking" && <SpeakingLab
      weekNumber={state.weekNumber}
      level={state.skillLevels.speaking}
      targetWords={speakingWords}
      latestPrompt={latestSpeakingPrompt}
      onPrompt={addSpeakingPrompt}
      onAttempt={addSpeakingAttempt}
      makeId={id}
    />}

    {tab === "anki" && <AnkiWorkspace
      settings={state.anki ?? emptyState.anki}
      words={state.words}
      onSettings={(anki) => setState((currentState) => ({ ...currentState, anki }))}
      onWords={addAnkiWords}
      onReviews={addAnkiReviews}
    />}

    {tab === "analytics" && !showProgressDetails && <section className="guided-workspace"><div className="guided-overview">
      <span className="next-number">01</span><h2>Know why you&apos;re improving.</h2>
      <p>Progress is based on evidence from practice—not a streak or time spent in the app. The system looks for faster recall, stronger comprehension, and reliable performance across different material.</p>
      <div className="guided-capabilities"><div><span>Recall</span><p>Accuracy, response time, lapses, mature words, and difficult vocabulary.</p></div><div><span>Comprehension</span><p>Main idea, detail, inference, and discourse across Reading and Listening.</p></div><div><span>Coverage</span><p>Performance by source, genre, register, and skill—not only one average.</p></div><div><span>Readiness</span><p>A level-up signal after at least four recent attempts average 80% or better.</p></div></div>
      <div className="progress-snapshot"><span><small>Words</small><strong>{state.words.length}</strong></span><span><small>Reviews</small><strong>{state.reviews.length}</strong></span><span><small>Reading</small><strong>{readingAverage ? `${readingAverage}%` : "—"}</strong></span><span><small>Listening</small><strong>{listeningAverage ? `${listeningAverage}%` : "—"}</strong></span></div>
      <button className="primary" onClick={() => setShowProgressDetails(true)}>View detailed progress</button>
    </div></section>}

    {tab === "analytics" && showProgressDetails && <><button className="back-link progress-back" onClick={() => setShowProgressDetails(false)}>← Back</button><section className="grid analytics-grid">
      <Metric label="Words learned" value={String(state.words.length)} />
      <Metric label="Reviews logged" value={String(state.reviews.length)} />
      <Metric label="Reading avg (5)" value={readingAverage ? `${readingAverage}%` : "—"} />
      <Metric label="Listening avg (5)" value={listeningAverage ? `${listeningAverage}%` : "—"} />
      <div className="card span-7"><h2>Weak / slow lexical items</h2><div className="word-list single">{weakWords.map((word) => <div className="word" key={word.id}><strong>{word.displayForm}</strong><span>{word.definition}</span><span>{Math.round(100 * word.correct / word.reviews)}% correct · {word.medianResponseMs ? `${(word.medianResponseMs / 1000).toFixed(1)}s median` : "no latency"} · {word.lapses} lapses</span></div>)}</div>{!weakWords.length && <div className="empty">Not enough review history yet.</div>}</div>
      <div className="card span-5"><h2>Performance history</h2><div className="queue"><div className="queue-item"><span>Reading attempts</span><strong>{state.passageAttempts.length}</strong></div><div className="queue-item"><span>Listening attempts</span><strong>{state.listeningAttempts.length}</strong></div><div className="queue-item"><span>Speaking attempts</span><strong>{state.speakingAttempts.length}</strong></div><div className="queue-item"><span>Speaking avg (5)</span><strong>{speakingAverage ? `${speakingAverage}%` : "—"}</strong></div><div className="queue-item"><span>Mature vocabulary</span><strong>{mature}</strong></div><div className="queue-item"><span>Current week</span><strong>{state.weekNumber}/{COURSE_META.weeks}</strong></div></div></div>
      <div className="card span-12"><h2>Recent comprehension diagnostics</h2><div className="diagnostic-grid"><Diagnostic label="Reading inference" value={Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.inferenceScore)))} /><Diagnostic label="Reading discourse" value={Math.round(average(state.passageAttempts.slice(-5).map((attempt) => attempt.discourseScore)))} /><Diagnostic label="Listening detail" value={Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.detailScore)))} /><Diagnostic label="Listening inference" value={Math.round(average(state.listeningAttempts.slice(-5).map((attempt) => attempt.inferenceScore)))} /></div></div>
      <AnalyticsTable title="Attempts by source" rows={sourceAnalytics} />
      <AnalyticsTable title="Attempts by genre" rows={genreAnalytics} />
      <AnalyticsTable title="Attempts by register" rows={registerAnalytics} />
    </section></>}

    {tab === "analytics" && <AccountWorkspace
      user={cloudUser}
      username={cloudUsername}
      cloudReady={cloudReady}
      status={status}
      onSignIn={signIn}
      onSignUp={signUp}
      onSignOut={signOut}
    />}
  </main>;
}

function SourceLine({ item }: { item: Passage | ListeningItem }) {
  if (item.sourceType === "generated") return <div className="source-line"><span className="pill">generated</span></div>;
  return <div className="source-line"><span className={`pill origin-${item.sourceType}`}>{item.sourceType}</span><span>{item.publisher}</span>{item.publishedAt && <span>{item.publishedAt}</span>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original ↗</a>}</div>;
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
