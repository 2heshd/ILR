"use client";

import { useEffect, useRef, useState } from "react";
import type { IlrLevel, SpeakingAttempt, SpeakingGrade, SpeakingPrompt } from "@/lib/types";

type Props = {
  weekNumber: number;
  level: IlrLevel;
  onLevelChange: (level: IlrLevel) => void;
  targetWords: string[];
  latestPrompt?: SpeakingPrompt;
  onPrompt: (prompt: SpeakingPrompt) => void;
  onAttempt: (attempt: SpeakingAttempt) => void;
  makeId: () => string;
};

const PROMPTS: Record<IlrLevel, Array<{ prompt: string; topic: string; functions: string[] }>> = {
  1: [
    { prompt: "Introduce yourself in Persian. Say where you live, what you do, and what you usually do each day.", topic: "daily life", functions: ["introduce", "describe", "present time"] },
    { prompt: "Describe your home or neighborhood. Mention three places and explain where they are.", topic: "places", functions: ["describe", "locate", "simple detail"] },
    { prompt: "Talk about what you did yesterday and what you plan to do tomorrow.", topic: "routine", functions: ["past time", "future time", "sequence"] },
  ],
  2: [
    { prompt: "Describe a recent problem, explain what caused it, what you did, and what you would change next time.", topic: "problem solving", functions: ["narrate", "explain", "past and future"] },
    { prompt: "Compare two places where you have lived or visited. Explain the advantages of each and which you prefer.", topic: "comparison", functions: ["compare", "support an opinion", "connected speech"] },
    { prompt: "Explain a change at work, school, or in your community and how it affects people.", topic: "community", functions: ["explain", "cause and effect", "give examples"] },
  ],
  3: [
    { prompt: "Explain a public policy you think should change. Describe the problem, defend your position, and address one objection.", topic: "public policy", functions: ["argue", "support", "address objections"] },
    { prompt: "Discuss how rising prices affect different groups in society and propose a practical response.", topic: "economics", functions: ["analyze", "compare impacts", "recommend"] },
    { prompt: "Assess the benefits and risks of relying on technology in education or government services.", topic: "technology", functions: ["evaluate", "qualify", "support conclusions"] },
  ],
  4: [
    { prompt: "Give a nuanced analysis of whether national security can justify limits on public access to information. Define the competing principles and reconcile them.", topic: "security and rights", functions: ["analyze nuance", "shift register", "synthesize"] },
    { prompt: "Evaluate how a government should balance short-term economic stability with long-term structural reform, including unintended consequences.", topic: "economic policy", functions: ["evaluate", "hypothesize", "handle abstraction"] },
    { prompt: "Discuss how language used by institutions can shape public trust. Distinguish persuasion, explanation, and manipulation.", topic: "public discourse", functions: ["distinguish", "interpret", "develop a precise argument"] },
  ],
};

const TARGET_SECONDS: Record<IlrLevel, number> = { 1: 45, 2: 90, 3: 150, 4: 240 };

function makePrompt(level: IlrLevel, index: number, weekNumber: number, targetWords: string[], makeId: () => string): SpeakingPrompt {
  const item = PROMPTS[level][(index + weekNumber - 1) % PROMPTS[level].length];
  return {
    id: makeId(),
    promptEn: item.prompt,
    topic: item.topic,
    ilrTarget: level,
    functions: item.functions,
    targetWords: targetWords.slice(0, level <= 1 ? 3 : 5),
    createdAt: new Date().toISOString(),
  };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

async function convertToWav(blob: Blob) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio conversion is not supported in this browser.");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const input = decoded.getChannelData(channel);
      for (let i = 0; i < input.length; i += 1) samples[i] += input[i] / decoded.numberOfChannels;
    }
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (const sample of samples) {
      const value = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    void context.close();
  }
}

export default function SpeakingLab({ weekNumber, level, onLevelChange, targetWords, latestPrompt, onPrompt, onAttempt, makeId }: Props) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [grade, setGrade] = useState<SpeakingGrade | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!latestPrompt || latestPrompt.ilrTarget !== level) {
      onPrompt(makePrompt(level, 0, weekNumber, targetWords, makeId));
      setPromptIndex(0);
      setAudioBlob(null);
      setGrade(null);
      setElapsed(0);
    }
  }, [level, latestPrompt, makeId, onPrompt, targetWords, weekNumber]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function nextPrompt() {
    const next = (promptIndex + 1) % PROMPTS[level].length;
    setPromptIndex(next);
    onPrompt(makePrompt(level, next, weekNumber, targetWords, makeId));
    setAudioBlob(null);
    setGrade(null);
    setElapsed(0);
    setStatus("");
  }

  async function startRecording() {
    if (!latestPrompt || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl((oldUrl) => {
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStatus("Recording ready. Listen back or send it for feedback.");
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setAudioBlob(null);
      setGrade(null);
      setStatus("Recording… speak naturally in Persian.");
      recorder.start();
      setRecording(true);
    } catch {
      setStatus("Microphone access was not granted. Allow microphone access and try again.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function gradeRecording() {
    if (!audioBlob || !latestPrompt) return;
    setBusy(true);
    setStatus("Listening to your response…");
    try {
      const wav = await convertToWav(audioBlob);
      const form = new FormData();
      form.append("audio", wav, "speaking.wav");
      form.append("prompt", latestPrompt.promptEn);
      form.append("ilrTarget", String(level));
      form.append("durationMs", String(elapsed * 1000));
      form.append("targetWords", JSON.stringify(latestPrompt.targetWords));
      const response = await fetch("/api/speaking-grade", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Speaking feedback failed.");
      const result = data as SpeakingGrade;
      setGrade(result);
      onAttempt({
        id: makeId(),
        speakingPromptId: latestPrompt.id,
        attemptedAt: new Date().toISOString(),
        durationMs: elapsed * 1000,
        transcript: result.transcript,
        usedSpeechRecognition: false,
        audioEvaluated: true,
        grade: result,
        gradingMode: "ai",
      });
      setStatus("Feedback saved to your progress.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Speaking feedback is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");
  const target = TARGET_SECONDS[level];

  return <section className="speaking-workspace">
    <header className="speaking-header">
      <div><span className="eyebrow">Speaking</span><h2>Respond in Persian.</h2></div>
      <div className="skill-level-selector" aria-label="Speaking level">
        {([1, 2, 3, 4] as IlrLevel[]).map((value) => <button key={value} className={level === value ? "active" : ""} onClick={() => onLevelChange(value)}>Level {value}</button>)}
      </div>
    </header>

    {latestPrompt && <>
      <div className="speaking-prompt">
        <div className="row spread"><span className="muted">Level {level} · {latestPrompt.topic}</span><button className="text-button" onClick={nextPrompt}>Different prompt</button></div>
        <h1>{latestPrompt.promptEn}</h1>
        <p>{latestPrompt.functions.join(" · ")}</p>
      </div>

      <div className="speaking-recorder">
        <button className={`mic-button ${recording ? "recording" : ""}`} onClick={recording ? stopRecording : startRecording} disabled={busy} aria-label={recording ? "Stop recording" : "Start recording"}>
          <span aria-hidden="true">{recording ? "■" : "●"}</span>
          {recording ? "Stop" : audioBlob ? "Record again" : "Record"}
        </button>
        <strong className="recording-time">{minutes}:{seconds}</strong>
        <span className="muted">Suggested: {Math.floor(target / 60)}:{String(target % 60).padStart(2, "0")}</span>
      </div>

      {audioUrl && !recording && <div className="speaking-audio"><audio controls src={audioUrl}/><button className="primary" onClick={gradeRecording} disabled={busy}>{busy ? "Reviewing…" : "Get feedback"}</button></div>}
      {status && <p className="speaking-status">{status}</p>}

      {grade && <section className="speaking-feedback">
        <div className="row spread"><div><span className="eyebrow">Audio coaching estimate</span><h2>{grade.overallScore}%</h2></div><p>{grade.feedback}</p></div>
        <div className="speaking-metrics">
          <span><small>Task</small><strong>{grade.taskCompletion}</strong></span>
          <span><small>Grammar</small><strong>{grade.grammaticalControl}</strong></span>
          <span><small>Fluency</small><strong>{grade.fluencyEstimate}</strong></span>
          <span><small>Rhythm</small><strong>{grade.rhythmPacing}</strong></span>
          <span><small>Tone</small><strong>{grade.toneDelivery}</strong></span>
          <span><small>Clarity</small><strong>{grade.pronunciationClarity}</strong></span>
        </div>
        {grade.transcript && <details><summary>Transcript</summary><p className="fa" dir="rtl">{grade.transcript}</p></details>}
        {grade.priorities.length > 0 && <p><strong>Next:</strong> {grade.priorities.join(" · ")}</p>}
      </section>}
    </>}
  </section>;
}
