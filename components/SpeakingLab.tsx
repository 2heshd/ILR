"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IlrLevel, SpeakingAttempt, SpeakingPrompt } from "@/lib/types";

type PersianVoice = "male" | "female";
type ChatTurn = { id: string; role: "learner" | "coach"; text: string };
type RealtimeEvent = { type?: string; transcript?: string; error?: { message?: string } };

type Props = {
  level: IlrLevel;
  prompts: SpeakingPrompt[];
  onAttempt: (attempt: SpeakingAttempt) => void;
  makeId: () => string;
  voice: PersianVoice;
};

function clientId() {
  const key = "cursos-realtime-user";
  const saved = window.localStorage.getItem(key);
  if (saved) return saved;
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(key, id);
  return id;
}

export default function SpeakingLab({ level, prompts, onAttempt, makeId, voice }: Props) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live">("idle");
  const [status, setStatus] = useState("Choose a topic, then start a live conversation.");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef(0);
  const transcriptRef = useRef<ChatTurn[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const currentPrompt = prompts[promptIndex] ?? prompts[0];
  const topics = useMemo(() => prompts.map((prompt) => prompt.topic), [prompts]);

  function addTurn(role: ChatTurn["role"], text: unknown) {
    const clean = String(text || "").trim();
    if (!clean) return;
    const turn = { id: makeId(), role, text: clean };
    transcriptRef.current = [...transcriptRef.current, turn];
    setTurns(transcriptRef.current);
  }

  function releaseConnection() {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }

  useEffect(() => () => releaseConnection(), []);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  function handleEvent(event: RealtimeEvent) {
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed":
        addTurn("learner", event.transcript);
        break;
      case "response.output_audio_transcript.done":
        addTurn("coach", event.transcript);
        setStatus("Your turn — answer naturally in Persian.");
        break;
      case "input_audio_buffer.speech_started":
        setStatus("Listening…");
        break;
      case "input_audio_buffer.speech_stopped":
        setStatus("Coach is thinking…");
        break;
      case "response.created":
        setStatus("Coach is responding…");
        break;
      case "error":
        setStatus(event.error?.message || "The live coach hit an error. End the call and try again.");
        break;
    }
  }

  async function startSession() {
    if (!currentPrompt || phase !== "idle" || !navigator.mediaDevices?.getUserMedia) return;
    setPhase("connecting");
    setStatus("Requesting microphone access…");
    setTurns([]);
    transcriptRef.current = [];
    startedAtRef.current = 0;
    setElapsed(0);
    setMuted(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      for (const track of stream.getTracks()) peer.addTrack(track, stream);
      peer.ontrack = (event) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) {
          setStatus("The live connection ended. Start a new conversation to continue.");
          setPhase("idle");
          releaseConnection();
        }
      };

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", (message) => {
        try { handleEvent(JSON.parse(message.data)); } catch { /* Ignore malformed service events. */ }
      });
      channel.addEventListener("open", () => {
        startedAtRef.current = Date.now();
        setPhase("live");
        setStatus("Coach is joining…");
        channel.send(JSON.stringify({
          type: "response.create",
          response: { instructions: "Begin the Persian practice now with a brief natural greeting and one question about the selected topic." },
        }));
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const params = new URLSearchParams({ level: String(level), topic: currentPrompt.topic, voice });
      const response = await fetch(`/api/realtime-session?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp", "X-Cursos-User": clientId() },
        body: offer.sdp,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The live coach could not connect.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (error) {
      releaseConnection();
      setPhase("idle");
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError") setStatus("Microphone access is blocked. Allow it for this site, then try again.");
      else if (name === "NotFoundError") setStatus("No microphone was found. Connect one and try again.");
      else setStatus(error instanceof Error ? error.message : "The live coach could not connect.");
    }
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    setStatus(next ? "Microphone muted." : "Microphone live — continue in Persian.");
  }

  function endSession(save = true) {
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    startedAtRef.current = 0;
    releaseConnection();
    setPhase("idle");
    setMuted(false);
    setStatus(save ? "Conversation saved. Start another whenever you are ready." : "Conversation ended.");
    if (save && currentPrompt && durationMs >= 5_000) {
      onAttempt({
        id: makeId(),
        speakingPromptId: currentPrompt.id,
        attemptedAt: new Date().toISOString(),
        durationMs,
        transcript: transcriptRef.current.map((turn) => `${turn.role === "learner" ? "Learner" : "Coach"}: ${turn.text}`).join("\n"),
        usedSpeechRecognition: true,
        audioEvaluated: true,
        gradingMode: "self",
      });
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");
  const active = phase !== "idle";

  return <section className="speaking-workspace live-speaking-workspace">
    <header className="live-speaking-header">
      <div>
        <span className="eyebrow">Realtime Persian · GPT Realtime 2.1</span>
        <h1>Live conversation coach</h1>
        <p>Speak naturally. The coach answers in Iranian Persian and selectively corrects grammar, word choice, rhythm, and pronunciation.</p>
      </div>
      <div className={`live-indicator ${phase}`}><i />{phase === "live" ? `${minutes}:${seconds}` : phase === "connecting" ? "Connecting" : "Ready"}</div>
    </header>

    <div className="live-speaking-controls">
      <label><span>Conversation topic</span><select disabled={active} aria-label="Choose conversation topic" value={promptIndex} onChange={(event) => { setPromptIndex(Number(event.target.value)); setTurns([]); transcriptRef.current = []; setStatus("Topic changed. Start when you are ready."); }}>{topics.map((topic, index) => <option key={`${topic}-${index}`} value={index}>{String(index + 1).padStart(2, "0")} · {topic}</option>)}</select></label>
      <label><span>Target</span><strong>ILR {level}</strong></label>
      <label><span>Coach voice</span><strong>{voice === "female" ? "Female" : "Male"}</strong></label>
    </div>

    <div className="live-chat" aria-live="polite">
      {turns.length === 0 ? <div className="live-chat-empty"><strong>How it works</strong><p>The coach starts the conversation. Answer aloud in Persian. Important corrections appear naturally inside the conversation instead of waiting for a final recording grade.</p><small>Use headphones for the clearest pronunciation feedback.</small></div> : turns.map((turn) => <article key={turn.id} className={`live-turn ${turn.role}`}><span>{turn.role === "learner" ? "You" : "Coach"}</span><p className="fa" dir="rtl">{turn.text}</p></article>)}
      <div ref={transcriptEndRef} />
    </div>

    <div className="live-call-bar">
      {phase === "idle" ? <button className="primary live-start" onClick={() => void startSession()} disabled={!currentPrompt}>● Start live conversation</button> : <>
        <button onClick={toggleMute} disabled={phase === "connecting"}>{muted ? "Unmute microphone" : "Mute microphone"}</button>
        <button className="danger-button" onClick={() => endSession(true)}>End &amp; save</button>
      </>}
      <p className="speaking-status">{status}</p>
    </div>
    <audio ref={remoteAudioRef} autoPlay className="remote-coach-audio" />
    <p className="muted live-speaking-note">AI coaching is experimental and not an official ILR score. The microphone is streamed only while the live session is active.</p>
  </section>;
}
