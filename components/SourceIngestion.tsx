"use client";

import { useState } from "react";
import type { ContentModality, ContentOrigin, ListeningItem, Passage, PassageQuestion } from "@/lib/types";

const MAX_EXCERPT_CHARS = 1800;

type IngestResult = {
  topic: string;
  genre: string;
  register: string;
  ilrEstimate: number;
  targetWords: string[];
  questions: PassageQuestion[];
};

type Props = {
  initialModality?: ContentModality;
  knownWords: string[];
  makeId: () => string;
  onReading: (passage: Passage) => void;
  onListening: (item: ListeningItem) => void;
  onStatus: (message: string) => void;
};

function fallbackQuestions(title: string): PassageQuestion[] {
  return [
    { question: `What is the main point of “${title}”?`, type: "main_idea" },
    { question: "Which two concrete details support the main point?", type: "detail" },
    { question: "What actor, institution, or event is most important, and why?", type: "detail" },
    { question: "What can be inferred but is not stated directly?", type: "inference" },
    { question: "How is the information organized, and what is the source trying to accomplish?", type: "discourse" },
  ];
}

export default function SourceIngestion({ initialModality = "reading", knownWords, makeId, onReading, onListening, onStatus }: Props) {
  const [modality, setModality] = useState<ContentModality>(initialModality);
  const [sourceType, setSourceType] = useState<Exclude<ContentOrigin, "generated">>("authentic");
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [textFa, setTextFa] = useState("");
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState("");
  const [register, setRegister] = useState("");
  const [ilrEstimate, setIlrEstimate] = useState(2.5);
  const [busy, setBusy] = useState(false);

  async function ingest() {
    if (!title.trim() || !publisher.trim() || !sourceUrl.trim() || !textFa.trim()) {
      onStatus("Title, publisher, source URL, and a short Persian excerpt/transcript are required.");
      return;
    }
    if (textFa.length > MAX_EXCERPT_CHARS) {
      onStatus(`Keep the stored excerpt/transcript to ${MAX_EXCERPT_CHARS.toLocaleString()} characters or fewer.`);
      return;
    }
    try {
      const source = new URL(sourceUrl);
      const media = mediaUrl ? new URL(mediaUrl) : null;
      if (![source, media].filter(Boolean).every((url) => ["http:", "https:"].includes(url!.protocol))) throw new Error("Unsupported URL protocol");
    } catch {
      onStatus("Use complete http(s) URLs for the source and optional media.");
      return;
    }

    setBusy(true);
    onStatus("Classifying source and extracting target vocabulary…");
    let analysis: IngestResult = {
      topic: topic || "current affairs",
      genre: genre || (modality === "reading" ? "news article" : "broadcast report"),
      register: register || "formal",
      ilrEstimate,
      targetWords: knownWords.filter((word) => textFa.includes(word)).slice(0, 15),
      questions: fallbackQuestions(title),
    };
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modality, title, publisher, sourceUrl, publishedAt, sourceType, textFa, knownWords, topic, genre, register, ilrEstimate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Source analysis failed.");
      const proposed = data as IngestResult;
      analysis = {
        topic: proposed.topic || analysis.topic,
        genre: proposed.genre || analysis.genre,
        register: proposed.register || analysis.register,
        ilrEstimate: Math.min(5, Math.max(0, Number(proposed.ilrEstimate) || analysis.ilrEstimate)),
        targetWords: (proposed.targetWords ?? []).filter((word) => typeof word === "string" && textFa.includes(word)).slice(0, 15),
        questions: (proposed.questions ?? []).slice(0, 5),
      };
    } catch (error) {
      onStatus(`${error instanceof Error ? error.message : "Source analysis unavailable"} Saved with manual/fallback classification.`);
    }

    const common = {
      id: makeId(),
      title: title.trim(),
      ilrEstimate: analysis.ilrEstimate,
      topic: analysis.topic,
      genre: analysis.genre,
      register: analysis.register,
      sourceType,
      sourceUrl: sourceUrl.trim(),
      sourceTitle: title.trim(),
      publisher: publisher.trim(),
      publishedAt: publishedAt || undefined,
      targetWords: analysis.targetWords,
      questions: analysis.questions.length ? analysis.questions : fallbackQuestions(title),
      createdAt: new Date().toISOString(),
    };
    if (modality === "reading") onReading({ ...common, textFa: textFa.trim() });
    else onListening({ ...common, transcriptFa: textFa.trim(), mediaUrl: mediaUrl.trim() || undefined });

    setTextFa("");
    onStatus(`Ingested copyright-safe ${sourceType} ${modality} source with provenance, classification, and ${analysis.targetWords.length} target terms.`);
    setBusy(false);
  }

  return <section className="grid source-ingestion">
    <div className="card span-12">
      <h2>Add source</h2>
      <div className="form-grid">
        <label>Lab<select value={modality} onChange={(event) => setModality(event.target.value as ContentModality)}><option value="reading">Reading</option><option value="listening">Listening</option></select></label>
        <label>Text status<select value={sourceType} onChange={(event) => setSourceType(event.target.value as Exclude<ContentOrigin, "generated">)}><option value="authentic">Authentic / unchanged</option><option value="adapted">Adapted / shortened</option></select></label>
        <label>Source title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Article or segment title" /></label>
        <label>Publisher<input value={publisher} onChange={(event) => setPublisher(event.target.value)} placeholder="IRNA, CBI, Majlis…" /></label>
        <label className="wide">Canonical source URL<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
        <label>Publication date<input type="date" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /></label>
        {modality === "listening" && <label>Direct audio URL (optional)<input type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://…/audio.mp3" /></label>}
        <label>Topic (optional)<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="economics" /></label>
        <label>Genre (optional)<input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="news report" /></label>
        <label>Register (optional)<input value={register} onChange={(event) => setRegister(event.target.value)} placeholder="formal-broadcast" /></label>
        <label>ILR estimate<input type="number" min="0" max="5" step="0.25" value={ilrEstimate} onChange={(event) => setIlrEstimate(Number(event.target.value))} /></label>
      </div>
      <label className="source-text-label">Persian {modality === "reading" ? "excerpt" : "transcript excerpt"} · {textFa.length}/{MAX_EXCERPT_CHARS}
        <textarea className="fa" maxLength={MAX_EXCERPT_CHARS} value={textFa} onChange={(event) => setTextFa(event.target.value)} placeholder="یک گزیده کوتاه فارسی را اینجا قرار دهید…" />
      </label>
      <button className="primary" onClick={ingest} disabled={busy}>{busy ? "Analyzing…" : "Add to lab"}</button>
    </div>
  </section>;
}
