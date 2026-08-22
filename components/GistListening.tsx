"use client";

import { useEffect, useState } from "react";
import { normalizePersian } from "@/lib/persian";
import type { LexicalItem } from "@/lib/types";

type Props = {
  sentences: string[];
  words: LexicalItem[];
  gists: string[];
  listenCounts: number[];
  hintedSentenceIndexes: number[];
  busy: boolean;
  onPlay: (index: number) => void;
  onGistChange: (index: number, value: string) => void;
  onHint: (index: number) => void;
};

const WORD_PATTERN = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+/g;

export default function GistListening({ sentences, words, gists, listenCounts, hintedSentenceIndexes, busy, onPlay, onGistChange, onHint }: Props) {
  const [activeSentence, setActiveSentence] = useState(0);

  useEffect(() => setActiveSentence(0), [sentences.length]);

  const sentenceCount = sentences.length;
  const listens = listenCounts[activeSentence] ?? 0;
  const gist = gists[activeSentence] ?? "";
  const captured = gists.filter((value) => value.trim()).length;
  const wordLookup = new Map(words.map((word) => [word.normalizedForm, word]));
  const unfamiliarWords = [...new Set(sentences[activeSentence]?.match(WORD_PATTERN) ?? [])]
    .map((displayForm) => ({ displayForm, item: wordLookup.get(normalizePersian(displayForm)) }))
    .filter(({ item }) => item?.knowledgeState !== "known" && item?.knowledgeState !== "automatic");
  const hintUsed = hintedSentenceIndexes.includes(activeSentence);

  return <div className="gist-listening">
    <div className="row spread inference-meta">
      <span>Sentence {activeSentence + 1}/{sentenceCount}</span>
      <span>{captured}/{sentenceCount} gists · {listenCounts.reduce((sum, count) => sum + count, 0)} plays</span>
    </div>

    <div className="gist-audio-stage">
      <button className="primary big-button" disabled={busy || listens >= 2} onClick={() => onPlay(activeSentence)}>
        {busy ? "Starting…" : listens === 0 ? "▶ Play sentence once" : listens === 1 ? "↻ Optional replay" : "Replay used"}
      </button>
      <span>{listens === 0 ? "Listen for the idea, not every word." : listens === 1 ? "First listen complete." : "Two-listen limit reached."}</span>
    </div>

    <label className="inference-gist">
      <span>Main idea in a few words—not a transcription.</span>
      <input
        value={gist}
        onChange={(event) => onGistChange(activeSentence, event.target.value)}
        placeholder={listens ? "Type the gist…" : "Listen once to unlock…"}
        disabled={listens === 0}
        autoComplete="off"
      />
    </label>

    {!!gist.trim() && unfamiliarWords.length > 0 && <div className="gist-word-help">
      {!hintUsed ? <button className="secondary" onClick={() => onHint(activeSentence)}>Show unfamiliar words</button> : <div className="target-strip">
        <span className="muted">Unfamiliar only</span>
        {unfamiliarWords.map(({ displayForm, item }) => <span className="pill fa-inline" key={displayForm}>{displayForm}{item?.definition ? ` · ${item.definition}` : ""}</span>)}
      </div>}
    </div>}

    <div className="row inference-navigation">
      <button className="secondary" disabled={activeSentence === 0} onClick={() => setActiveSentence((index) => Math.max(0, index - 1))}>Previous</button>
      <button className="primary" disabled={!gist.trim() || activeSentence === sentenceCount - 1} onClick={() => setActiveSentence((index) => Math.min(sentenceCount - 1, index + 1))}>Next sentence</button>
    </div>
  </div>;
}
