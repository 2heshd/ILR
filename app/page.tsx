"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { adaptiveAllocation, selectContextWords, targetIlrForWeek } from "@/lib/adaptive";
import { fallbackAdvanced, type AdvancedWord } from "@/lib/advanced";
import { autoRatingForKnown, createSerializedCard, reviewFsrs } from "@/lib/fsrs";
import { normalizePersian, parseWeeklyInput } from "@/lib/persian";
import { appendCloudReview, getSupabaseClient, loadCloudState, saveCloudState } from "@/lib/supabase";
import type {
  LexicalItem,
  ListeningAttempt,
  ListeningItem,
  Passage,
  PassageAttempt,
  ReviewEvent,
  ReviewRating,
  StudyState,
} from "@/lib/types";

const STORAGE_KEY = "ilr-persian-v2";
const LEGACY_KEY = "ilr-persian-v1";

type Tab = "today" | "reading" | "listening" | "analytics";

const emptyState: StudyState = {
  weekNumber: 1,
  words: [],
  reviews: [],
  passages: [],
  passageAttempts: [],
  listeningItems: [],
  listeningAttempts: [],
};

function id() {
  return crypto.randomUUID();
}

function hydrateState(raw: Partial<StudyState> | null | undefined): StudyState {
  const state: StudyState = {
    ...emptyState,
    ...raw,
    words: raw?.words ?? [],
    reviews: raw?.reviews ?? [],
    passages: raw?.passages ?? [],
    passageAttempts: raw?.passageAttempts ?? [],
    listeningItems: raw?.listeningItems ?? [],
    listeningAttempts: raw?.listeningAttempts ?? [],
  };
  state.words = state.words.map((word) => {
    const fsrsCard = word.fsrsCard ?? createSerializedCard(new Date(word.introducedAt || Date.now()));
    return { ...word, fsrsCard, dueAt: word.dueAt || fsrsCard.due };
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

async function generateJson(body: Record<string, unknown>) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Generation failed");
  return response.json();
}

export default function Home() {
  const [state, setState] = useState<StudyState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [showIntake, setShowIntake] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [email, setEmail] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [responseMs, setResponseMs] = useState(0);
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null);
  const [readingScoring, setReadingScoring] = useState(false);
  const [readingScores, setReadingScores] = useState({ comprehension: 75, inference: 50, discourse: 50, unknown: 0, rereads: 0 });
  const [listensCount, setListensCount] = useState(0);
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [listeningScores, setListeningScores] = useState({ comprehension: 75, detail: 50, inference: 50 });
  const startRef = useRef(Date.now());

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    const local = hydrateState(raw ? JSON.parse(raw) : emptyState);
    setState(local);
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
    () => state.words.filter((w) => new Date(w.dueAt).getTime() <= Date.now()),
    [state.words],
  );
  const current = due[reviewIndex % Math.max(1, due.length)];
  const allocation = useMemo(() => adaptiveAllocation(state), [state]);
  const mature = state.words.filter((w) => w.reviews >= 4 && w.correct / Math.max(1, w.reviews) >= 0.8).length;
  const retention = state.reviews.length ? Math.round(100 * state.reviews.filter((r) => r.correct).length / state.reviews.length) : 0;
  const medianRecall = median(state.reviews.slice(-250).map((r) => r.responseMs));
  const latestPassage = state.passages.at(-1);
  const latestListening = state.listeningItems.at(-1);

  useEffect(() => {
    setRevealed(false);
    setResponseMs(0);
    startRef.current = Date.now();
  }, [current?.id]);

  async function signIn() {
    const supabase = getSupabaseClient();
    if (!supabase || !email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? error.message : "Magic link sent. Open it on any device to sync this course.");
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
  }

  async function importWeek() {
    const parsed = parseWeeklyInput(input);
    if (!parsed.length) return;
    setStatus("Preparing weekly vocabulary…");
    const existing = new Set(state.words.map((w) => w.normalizedForm));
    const incoming = parsed.filter((w) => !existing.has(normalizePersian(w.displayForm)));

    let enriched = incoming;
    const missing = incoming.filter((w) => !w.definition || !w.romanization);
    if (missing.length) {
      try {
        const data = await generateJson({ kind: "define_words", words: missing.map((w) => w.displayForm) });
        const lookup = new Map<string, { definition?: string; romanization?: string }>(
          (data.words ?? []).map((w: { displayForm: string; definition: string; romanization: string }) => [normalizePersian(w.displayForm), w] as const),
        );
        enriched = incoming.map((w) => ({
          ...w,
          definition: w.definition ?? lookup.get(normalizePersian(w.displayForm))?.definition,
          romanization: w.romanization ?? lookup.get(normalizePersian(w.displayForm))?.romanization,
        }));
      } catch {
        // User-supplied definitions remain usable when the AI endpoint is not configured.
      }
    }

    enriched.forEach((w) => existing.add(normalizePersian(w.displayForm)));
    let advanced: AdvancedWord[] = [];
    try {
      const data = await generateJson({ kind: "advanced_words", weekNumber: state.weekNumber, existing: [...existing] });
      advanced = (data.words ?? []).filter((w: AdvancedWord) => !existing.has(normalizePersian(w.displayForm))).slice(0, 5);
    } catch {
      advanced = fallbackAdvanced(existing, 5);
    }
    if (advanced.length < 5) {
      const blocked = new Set([...existing, ...advanced.map((w) => normalizePersian(w.displayForm))]);
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
        id: id(), displayForm, normalizedForm: normalizePersian(displayForm), definition, romanization,
        sourceType, sourceWeek: state.weekNumber, topic, introducedAt: now.toISOString(), reviews: 0,
        correct: 0, lapses: 0, dueAt: fsrsCard.due, fsrsCard,
      };
    };

    const newWords = [
      ...enriched.map((w) => makeWord(w.displayForm, w.definition, w.romanization, "dli")),
      ...advanced.map((w) => makeWord(w.displayForm, w.definition, w.romanization, "system_advanced", w.topic)),
    ];
    setState((s) => ({ ...s, words: [...s.words, ...newWords] }));
    setInput("");
    setShowIntake(false);
    setReviewIndex(0);
    setStatus(`Added ${enriched.length} required words + ${advanced.length} advanced words for Week ${state.weekNumber}.`);
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
      id: id(), lexicalItemId: current.id, reviewedAt: new Date().toISOString(), correct, responseMs: measured,
      rating, modality: "visual", schedulerBefore: before, schedulerAfter: after,
    };
    setState((s) => ({
      ...s,
      reviews: [...s.reviews, event],
      words: s.words.map((w) => w.id !== current.id ? w : {
        ...w,
        reviews: w.reviews + 1,
        correct: w.correct + (correct ? 1 : 0),
        lapses: after.lapses,
        medianResponseMs: median([...s.reviews.filter((r) => r.lexicalItemId === w.id).map((r) => r.responseMs), measured]),
        dueAt: after.due,
        stability: after.stability,
        difficulty: after.difficulty,
        fsrsCard: after,
      }),
    }));
    const client = getSupabaseClient();
    if (client && cloudUser) appendCloudReview(client, cloudUser, event).catch(console.error);
    setReviewIndex((i) => i + 1);
  }

  async function generatePractice(kind: "reading" | "listening") {
    setStatus(`Generating adaptive ${kind}…`);
    try {
      const words = selectContextWords(state, 12);
      const targetIlr = targetIlrForWeek(state.weekNumber, kind);
      const data = await generateJson({ kind, weekNumber: state.weekNumber, targetWords: words, targetIlr });
      if (kind === "reading") {
        const passage: Passage = {
          id: id(), title: data.title, textFa: data.textFa, ilrEstimate: targetIlr,
          topic: data.topic, register: data.register, targetWords: words,
          questions: data.questions ?? [], createdAt: new Date().toISOString(),
        };
        setState((s) => ({ ...s, passages: [...s.passages, passage] }));
        setReadingStartedAt(null);
        setReadingScoring(false);
      } else {
        const item: ListeningItem = {
          id: id(), title: data.title, transcriptFa: data.textFa, ilrEstimate: targetIlr,
          topic: data.topic, register: data.register, targetWords: words,
          questions: data.questions ?? [], createdAt: new Date().toISOString(),
        };
        setState((s) => ({ ...s, listeningItems: [...s.listeningItems, item] }));
        setListensCount(0);
        setTranscriptVisible(false);
      }
      setStatus(`Adaptive ${kind} ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    }
  }

  function saveReadingAttempt() {
    if (!latestPassage || !readingStartedAt) return;
    const attempt: PassageAttempt = {
      id: id(), passageId: latestPassage.id, attemptedAt: new Date().toISOString(),
      durationMs: Date.now() - readingStartedAt, comprehensionScore: readingScores.comprehension,
      inferenceScore: readingScores.inference, discourseScore: readingScores.discourse,
      unknownWordCount: readingScores.unknown, rereads: readingScores.rereads,
    };
    setState((s) => ({ ...s, passageAttempts: [...s.passageAttempts, attempt] }));
    setReadingStartedAt(null);
    setReadingScoring(false);
    setStatus("Reading attempt saved. The allocation will adapt from this result.");
  }

  async function playListening() {
    if (!latestListening) return;
    setListensCount((n) => n + 1);
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: latestListening.transcriptFa }),
      });
      if (!response.ok) throw new Error("TTS unavailable");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      const utterance = new SpeechSynthesisUtterance(latestListening.transcriptFa);
      utterance.lang = "fa-IR";
      utterance.rate = 1;
      speechSynthesis.speak(utterance);
    }
  }

  function saveListeningAttempt() {
    if (!latestListening || listensCount === 0) return;
    const attempt: ListeningAttempt = {
      id: id(), listeningItemId: latestListening.id, attemptedAt: new Date().toISOString(),
      listensCount, comprehensionScore: listeningScores.comprehension, detailScore: listeningScores.detail,
      inferenceScore: listeningScores.inference, transcriptRevealed: transcriptVisible,
    };
    setState((s) => ({ ...s, listeningAttempts: [...s.listeningAttempts, attempt] }));
    setListensCount(0);
    setTranscriptVisible(false);
    setStatus("Listening attempt saved. First-listen performance now affects the adaptive plan.");
  }

  function advanceWeek() {
    setState((s) => ({ ...s, weekNumber: Math.min(36, s.weekNumber + 1) }));
    setStatus("Advanced to the next course week. Add the new required vocabulary when ready.");
  }

  if (!loaded) return <main>Loading…</main>;

  const weakWords = [...state.words]
    .filter((w) => w.reviews >= 2)
    .sort((a, b) => (a.correct / a.reviews) - (b.correct / b.reviews) || (b.medianResponseMs ?? 0) - (a.medianResponseMs ?? 0))
    .slice(0, 10);
  const readingAverage = Math.round(average(state.passageAttempts.slice(-5).map((a) => a.comprehensionScore)));
  const listeningAverage = Math.round(average(state.listeningAttempts.slice(-5).map((a) => a.comprehensionScore)));

  return <main>
    <header>
      <div><div className="muted">Week {state.weekNumber}/36 · adaptive Persian system</div><h1>ILR // {tab[0].toUpperCase() + tab.slice(1)}</h1></div>
      <div className="row"><span className="pill">R4</span><span className="pill">L3+</span><span className="pill">S2</span><button className="primary" onClick={() => setShowIntake((v) => !v)}>+ Weekly words</button></div>
    </header>

    <nav className="tabs">
      {(["today", "reading", "listening", "analytics"] as Tab[]).map((name) => <button key={name} className={tab === name ? "tab active" : "tab"} onClick={() => setTab(name)}>{name}</button>)}
    </nav>

    {status && <div className="notice">{status}</div>}

    {showIntake && <section className="card intake">
      <h2>Week {state.weekNumber} intake</h2>
      <div className="muted">Paste every required DLI word. Missing definitions/romanization are auto-filled when AI is configured. Exactly 5 advanced terms are added.</div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"کارمند — employee — kārmand\nبازداشت کردن — to arrest — bāzdāsht kardan\nآینده — future — āyande"} />
      <div className="row"><button className="primary" onClick={importWeek}>Import week + 5 advanced</button><button className="secondary" onClick={() => setShowIntake(false)}>Cancel</button></div>
    </section>}

    {tab === "today" && <section className="grid">
      <Metric label="Due now" value={String(due.length)} />
      <Metric label="Total words" value={String(state.words.length)} />
      <Metric label="Retention" value={`${retention}%`} />
      <Metric label="Median recall" value={medianRecall ? `${(medianRecall / 1000).toFixed(1)}s` : "—"} />

      <div className="card span-7">
        <div className="row spread"><h2>Timed recognition</h2><span className="pill">3s automatic · 8s solid · 15s ceiling</span></div>
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
        </> : <div className="empty">No vocabulary due. Context practice stays active even on a zero-review day.</div>}
      </div>

      <div className="card span-5">
        <h2>Adaptive allocation</h2>
        <p className="muted">Context work has a hard floor so flashcards cannot crowd out R4/L3+ development.</p>
        {Object.entries(allocation).map(([name, value]) => <div key={name} className="allocation"><div className="row spread"><span>{name}</span><span className="muted">{value}%</span></div><div className="progress"><div style={{ width: `${value}%` }} /></div></div>)}
      </div>

      <div className="card span-8">
        <div className="row spread"><h2>Current vocabulary</h2><span className="muted">{mature} mature</span></div>
        <div className="word-list">{state.words.slice(-14).reverse().map((w) => <div className="word" key={w.id}><strong>{w.displayForm}</strong><span>{w.romanization ? `${w.romanization} · ` : ""}{w.definition || "definition pending"}</span><span>W{w.sourceWeek} · {w.reviews} reviews · {w.sourceType === "system_advanced" ? "advanced" : "DLI"}</span></div>)}</div>
      </div>

      <div className="card span-4">
        <h2>Course control</h2>
        <div className="queue">
          <button className="queue-button" onClick={() => setTab("reading")}><span>Reading lab</span><strong>{readingAverage || "start"}</strong></button>
          <button className="queue-button" onClick={() => setTab("listening")}><span>Listening lab</span><strong>{listeningAverage || "start"}</strong></button>
          <button className="queue-button" onClick={() => setTab("analytics")}><span>Difficult items</span><strong>{weakWords.length}</strong></button>
          <button className="queue-button" onClick={advanceWeek} disabled={state.weekNumber >= 36}><span>Advance course week</span><strong>W{Math.min(36, state.weekNumber + 1)}</strong></button>
        </div>
      </div>

      <div className="card span-12 sync-card">
        <div><h2>36-week persistence</h2><div className="muted">Local history is automatic. Add Supabase to sync across your Mac, phone, and other devices.</div></div>
        {getSupabaseClient() ? cloudUser ? <div className="row"><span className="pill">cloud synced</span><span className="muted">{cloudUser.email}</span><button className="secondary" onClick={signOut}>Sign out</button></div> : <div className="row auth-row"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for magic-link sync"/><button className="primary" onClick={signIn}>Send magic link</button></div> : <span className="pill">local mode · add Supabase env vars for cloud</span>}
      </div>
    </section>}

    {tab === "reading" && <section className="grid">
      <div className="card span-12 lab-header"><div><h2>Reading Lab</h2><p className="muted">One coherent passage. Timed comprehension, inference, discourse, and unknown-word burden are tracked separately.</p></div><button className="primary" onClick={() => generatePractice("reading")}>Generate adaptive passage</button></div>
      {latestPassage ? <>
        <div className="card span-8">
          <div className="row spread"><div><div className="muted">ILR ~{latestPassage.ilrEstimate} · {latestPassage.topic}</div><h2>{latestPassage.title}</h2></div>{!readingStartedAt && !readingScoring && <button className="primary" onClick={() => setReadingStartedAt(Date.now())}>Start timer</button>}</div>
          <div className={readingStartedAt || readingScoring ? "fa passage" : "fa passage blurred"}>{latestPassage.textFa}</div>
          {readingStartedAt && !readingScoring && <button className="primary" onClick={() => setReadingScoring(true)}>Finish reading</button>}
          {readingScoring && <div className="score-panel">
            <Score label="Overall comprehension" value={readingScores.comprehension} onChange={(v) => setReadingScores((s) => ({ ...s, comprehension: v }))}/>
            <Score label="Inference" value={readingScores.inference} onChange={(v) => setReadingScores((s) => ({ ...s, inference: v }))}/>
            <Score label="Discourse / argument tracking" value={readingScores.discourse} onChange={(v) => setReadingScores((s) => ({ ...s, discourse: v }))}/>
            <div className="row"><label>Unknown words <input className="small-input" type="number" min="0" value={readingScores.unknown} onChange={(e) => setReadingScores((s) => ({ ...s, unknown: Number(e.target.value) }))}/></label><label>Rereads <input className="small-input" type="number" min="0" value={readingScores.rereads} onChange={(e) => setReadingScores((s) => ({ ...s, rereads: Number(e.target.value) }))}/></label></div>
            <button className="primary" onClick={saveReadingAttempt}>Save attempt</button>
          </div>}
        </div>
        <div className="card span-4"><h2>Comprehension prompts</h2><ol className="questions">{latestPassage.questions.map((q, i) => <li key={i}><span className="muted">{q.type}</span>{q.question}</li>)}</ol></div>
      </> : <div className="card span-12 empty">Generate the first passage after importing vocabulary. It will recycle weak/current terms at the week-adjusted difficulty.</div>}
    </section>}

    {tab === "listening" && <section className="grid">
      <div className="card span-12 lab-header"><div><h2>Listening Lab</h2><p className="muted">Audio first. Transcript stays hidden; first-listen performance carries more diagnostic value than repeated listening.</p></div><button className="primary" onClick={() => generatePractice("listening")}>Generate adaptive listening</button></div>
      {latestListening ? <>
        <div className="card span-7">
          <div className="muted">ILR ~{latestListening.ilrEstimate} · {latestListening.topic}</div><h2>{latestListening.title}</h2>
          <div className="audio-stage"><button className="primary big-button" onClick={playListening}>▶ Play Persian audio</button><span className="muted">listens: {listensCount}</span></div>
          <div className={transcriptVisible ? "fa passage" : "transcript-hidden"}>{transcriptVisible ? latestListening.transcriptFa : "Transcript hidden until you choose to reveal it."}</div>
          <div className="row"><button className="secondary" onClick={() => setTranscriptVisible(true)}>Reveal transcript</button></div>
          <div className="score-panel">
            <Score label="Overall comprehension" value={listeningScores.comprehension} onChange={(v) => setListeningScores((s) => ({ ...s, comprehension: v }))}/>
            <Score label="Detail" value={listeningScores.detail} onChange={(v) => setListeningScores((s) => ({ ...s, detail: v }))}/>
            <Score label="Inference" value={listeningScores.inference} onChange={(v) => setListeningScores((s) => ({ ...s, inference: v }))}/>
            <button className="primary" onClick={saveListeningAttempt} disabled={listensCount === 0}>Save attempt</button>
          </div>
        </div>
        <div className="card span-5"><h2>Questions</h2><ol className="questions">{latestListening.questions.map((q, i) => <li key={i}><span className="muted">{q.type}</span>{q.question}</li>)}</ol></div>
      </> : <div className="card span-12 empty">Generate an item. OpenAI TTS is used when configured; otherwise the browser's Persian voice is the fallback.</div>}
    </section>}

    {tab === "analytics" && <section className="grid">
      <Metric label="Words learned" value={String(state.words.length)} />
      <Metric label="Reviews logged" value={String(state.reviews.length)} />
      <Metric label="Reading avg (5)" value={readingAverage ? `${readingAverage}%` : "—"} />
      <Metric label="Listening avg (5)" value={listeningAverage ? `${listeningAverage}%` : "—"} />
      <div className="card span-7"><h2>Weak / slow lexical items</h2><div className="word-list single">{weakWords.map((w) => <div className="word" key={w.id}><strong>{w.displayForm}</strong><span>{w.definition}</span><span>{Math.round(100 * w.correct / w.reviews)}% correct · {w.medianResponseMs ? `${(w.medianResponseMs / 1000).toFixed(1)}s median` : "no latency"} · {w.lapses} lapses</span></div>)}</div>{!weakWords.length && <div className="empty">Not enough review history yet.</div>}</div>
      <div className="card span-5"><h2>Performance history</h2><div className="queue"><div className="queue-item"><span>Reading attempts</span><strong>{state.passageAttempts.length}</strong></div><div className="queue-item"><span>Listening attempts</span><strong>{state.listeningAttempts.length}</strong></div><div className="queue-item"><span>Mature vocabulary</span><strong>{mature}</strong></div><div className="queue-item"><span>Current week</span><strong>{state.weekNumber}/36</strong></div></div></div>
    </section>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card span-3"><div className="muted">{label}</div><div className="stat">{value}</div></div>;
}

function Score({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="score"><div className="row spread"><span>{label}</span><strong>{value}%</strong></div><input type="range" min="0" max="100" step="5" value={value} onChange={(e) => onChange(Number(e.target.value))}/></label>;
}
