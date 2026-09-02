"use client";

import { useEffect, useRef, useState } from "react";
import type { IlrLevel, SpeakingAttempt, SpeakingGrade, SpeakingPrompt } from "@/lib/types";

type Props = {
  level: IlrLevel;
  prompts: SpeakingPrompt[];
  onAttempt: (attempt: SpeakingAttempt) => void;
  makeId: () => string;
};

const TARGET_SECONDS: Record<IlrLevel, number> = { 1: 45, 2: 90, 3: 150, 4: 240 };

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

export default function SpeakingLab({ level, prompts, onAttempt, makeId }: Props) {
  const [promptIndex, setPromptIndex] = useState(0);
  const latestPrompt = prompts[promptIndex] ?? prompts[0];
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
    const next = (promptIndex + 1) % prompts.length;
    setPromptIndex(next);
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
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotFoundError") setStatus("No microphone was found. Connect a microphone and try again.");
      else if (name === "NotReadableError" || name === "AbortError") setStatus("The microphone is busy in another app. Close the other app and try again.");
      else setStatus("Microphone is blocked for this site. Allow it in the browser’s site settings, then reload and try again.");
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
    {latestPrompt && <>
      <div className="speaking-prompt">
        <div className="row spread"><span className="muted">Report {promptIndex + 1} of {prompts.length} · ILR 1+ · {latestPrompt.topic}</span><div className="row"><select aria-label="Choose speaking report" value={promptIndex} onChange={(event) => { setPromptIndex(Number(event.target.value)); setAudioBlob(null); setGrade(null); setElapsed(0); setStatus(""); }}>{prompts.map((prompt, index) => <option key={prompt.id} value={index}>{String(index + 1).padStart(2, "0")} · {prompt.topic}</option>)}</select><button className="text-button" onClick={nextPrompt}>Next report</button></div></div>
        <h1>{latestPrompt.promptEn}</h1>
        {latestPrompt.promptFa && <p className="fa" dir="rtl">{latestPrompt.promptFa}</p>}
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
      {status.startsWith("Microphone is blocked") && <p className="muted permission-help">On Mac, also open System Settings → Privacy &amp; Security → Microphone and allow access for the browser or app you are using.</p>}

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
