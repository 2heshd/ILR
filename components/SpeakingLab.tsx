"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SpeakingAttempt, SpeakingGrade, SpeakingPrompt } from "@/lib/types";

type Props = {
  weekNumber: number;
  targetWords: string[];
  latestPrompt?: SpeakingPrompt;
  onPrompt: (prompt: SpeakingPrompt) => void;
  onAttempt: (attempt: SpeakingAttempt) => void;
  makeId: () => string;
};

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

const FALLBACKS = [
  "Describe a problem you had recently, explain what caused it, what you did, and what you will do differently next time.",
  "Compare living in two different places. Explain advantages, disadvantages, and which you would choose in the future.",
  "Explain a recent change in prices, work, school, or transportation and describe how it affects ordinary people.",
  "Narrate a trip or important day in the past, then explain your current situation and your plans for the near future.",
];

function fallbackPrompt(weekNumber: number, targetWords: string[], makeId: () => string): SpeakingPrompt {
  return {
    id: makeId(),
    promptEn: FALLBACKS[(weekNumber - 1) % FALLBACKS.length],
    topic: "daily-life / explanation",
    ilrTarget: 2,
    functions: ["narrate", "describe", "explain", "use connected discourse"],
    targetWords: targetWords.slice(0, 5),
    createdAt: new Date().toISOString(),
  };
}

export default function SpeakingLab({ weekNumber, targetWords, latestPrompt, onPrompt, onAttempt, makeId }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(180);
  const [transcript, setTranscript] = useState("");
  const [usedRecognition, setUsedRecognition] = useState(false);
  const [grade, setGrade] = useState<SpeakingGrade | null>(null);
  const [selfScore, setSelfScore] = useState(70);
  const recognitionRef = useRef<Recognition | null>(null);

  const recognitionAvailable = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as SpeechWindow;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          recognitionRef.current?.stop();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  async function generatePrompt() {
    setBusy(true);
    setStatus("Generating ILR-2 speaking task…");
    setGrade(null);
    setTranscript("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "speaking", weekNumber, targetWords }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Prompt generation failed.");
      const prompt: SpeakingPrompt = {
        id: makeId(),
        promptEn: data.promptEn,
        promptFa: data.promptFa,
        topic: data.topic || "general",
        ilrTarget: 2,
        functions: Array.isArray(data.functions) ? data.functions : [],
        targetWords: Array.isArray(data.targetWords) ? data.targetWords : targetWords.slice(0, 5),
        createdAt: new Date().toISOString(),
      };
      onPrompt(prompt);
      setStatus("Speaking task ready.");
    } catch {
      const prompt = fallbackPrompt(weekNumber, targetWords, makeId);
      onPrompt(prompt);
      setStatus("Using built-in ILR-2 task. AI generation is optional.");
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (!latestPrompt) return;
    setSeconds(180);
    setStartedAt(Date.now());
    setTranscript("");
    setGrade(null);
    setRunning(true);
    setStatus("Speak continuously. Aim for connected paragraph-length discourse.");

    const w = window as SpeechWindow;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const recognition = new Ctor();
      recognition.lang = "fa-IR";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const parts: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) parts.push(event.results[i][0].transcript);
        }
        if (parts.length) setTranscript((current) => `${current} ${parts.join(" ")}`.trim());
      };
      recognition.onend = () => setRunning(false);
      recognition.onerror = () => setStatus("Speech recognition stopped. You can still finish aloud and type/edit the transcript below.");
      recognitionRef.current = recognition;
      recognition.start();
      setUsedRecognition(true);
    } catch {
      setUsedRecognition(false);
    }
  }

  function stop() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRunning(false);
    setStatus("Response stopped. Review the transcript, then grade it.");
  }

  async function gradeResponse() {
    if (!latestPrompt || !transcript.trim()) return;
    setBusy(true);
    setStatus("Grading ILR-2 task performance…");
    const durationMs = startedAt ? Date.now() - startedAt : (180 - seconds) * 1000;
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "speaking",
          prompt: latestPrompt.promptEn,
          transcript,
          ilrTarget: 2,
          targetWords: latestPrompt.targetWords,
          durationMs,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Speaking grading failed.");
      const result = data as SpeakingGrade;
      setGrade(result);
      onAttempt({
        id: makeId(), speakingPromptId: latestPrompt.id, attemptedAt: new Date().toISOString(),
        durationMs, transcript, usedSpeechRecognition: usedRecognition, grade: result, gradingMode: "ai",
      });
      setStatus("Speaking attempt graded and saved.");
    } catch (cause) {
      setStatus(cause instanceof Error ? `${cause.message} Use self-score below.` : "AI grading unavailable. Use self-score below.");
    } finally {
      setBusy(false);
    }
  }

  function saveSelf() {
    if (!latestPrompt || !transcript.trim()) return;
    const durationMs = startedAt ? Date.now() - startedAt : (180 - seconds) * 1000;
    onAttempt({
      id: makeId(), speakingPromptId: latestPrompt.id, attemptedAt: new Date().toISOString(),
      durationMs, transcript, usedSpeechRecognition: usedRecognition, gradingMode: "self", selfScore,
    });
    setStatus("Self-scored speaking attempt saved.");
  }

  const minutes = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");

  return <section className="grid">
    <div className="card span-12 lab-header">
      <div><h2>Speaking Maintenance · ILR 2</h2><p className="muted">Small allocation, high specificity: 2-4 minute connected responses, not endless production flashcards.</p></div>
      <button className="primary" onClick={generatePrompt} disabled={busy}>{busy ? "Working…" : "New speaking task"}</button>
    </div>

    {latestPrompt ? <>
      <div className="card span-7">
        <div className="muted">ILR 2 · {latestPrompt.topic}</div>
        <h2>{latestPrompt.promptEn}</h2>
        {latestPrompt.promptFa && <div className="fa speaking-fa">{latestPrompt.promptFa}</div>}
        <div className="function-tags">{latestPrompt.functions.map((item) => <span className="pill" key={item}>{item}</span>)}</div>
        {latestPrompt.targetWords.length > 0 && <p className="muted">Use naturally if useful: <span className="fa-inline">{latestPrompt.targetWords.join(" · ")}</span></p>}

        <div className="speaking-timer">{minutes}:{secs}</div>
        <div className="row">
          {!running ? <button className="primary" onClick={start}>Start 3-minute response</button> : <button className="danger" onClick={stop}>Stop response</button>}
          <span className="muted">{recognitionAvailable ? "Persian speech recognition available" : "Speak aloud; type the transcript after"}</span>
        </div>
        {status && <div className="mini-notice">{status}</div>}
      </div>

      <div className="card span-5">
        <h2>Transcript + feedback</h2>
        <p className="muted">Edit recognition errors before grading. Transcript grading cannot judge pronunciation.</p>
        <textarea className="fa transcript-editor" dir="rtl" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="متن پاسخ شما…"/>
        {!grade && <div className="row">
          <button className="primary" onClick={gradeResponse} disabled={busy || running || !transcript.trim()}>Grade response</button>
        </div>}
        {!grade && transcript.trim() && <label className="score">
          <div className="row spread"><span>Fallback self-score</span><strong>{selfScore}%</strong></div>
          <input type="range" min="0" max="100" step="5" value={selfScore} onChange={(event) => setSelfScore(Number(event.target.value))}/>
          <button className="secondary" type="button" onClick={saveSelf}>Save self-score</button>
        </label>}
        {grade && <div className="grade-summary">
          <div className="grade-metrics compact">
            <span><small>overall</small><strong>{grade.overallScore}%</strong></span>
            <span><small>task</small><strong>{grade.taskCompletion}%</strong></span>
            <span><small>grammar</small><strong>{grade.grammaticalControl}%</strong></span>
            <span><small>vocab</small><strong>{grade.vocabularyControl}%</strong></span>
          </div>
          <p>{grade.feedback}</p>
          {grade.priorities.length > 0 && <div><strong>Next priorities</strong><ul>{grade.priorities.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        </div>}
      </div>
    </> : <div className="card span-12 empty">Generate a short task. Speaking stays at a maintenance dose because the primary targets are R4 and L3+.</div>}
  </section>;
}
