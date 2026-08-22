"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizePersian } from "@/lib/persian";
import type { LexicalItem } from "@/lib/types";

type Props = {
  text: string;
  words: LexicalItem[];
  targetWords: string[];
  disabled?: boolean;
  gists: string[];
  onGistsChange: (gists: string[]) => void;
};

const WORD_PATTERN = /([\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+)/g;
const IS_WORD = /^[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+$/;
const LOW_INFORMATION_WORDS = new Set([
  "از", "به", "در", "با", "برای", "تا", "بر", "را", "که", "و", "یا", "اما", "اگر", "چون", "پس", "نیز",
  "این", "آن", "یک", "هر", "هم", "خود", "می", "نمی", "است", "بود", "شد", "شده", "شود", "هست", "هستند",
  "کرد", "کرده", "کند", "می‌شود", "می‌کند", "خواهد", "دارد", "داشت", "داشتند", "مورد", "طور", "حال",
]);

export function persianSentences(text: string) {
  const sentences = (text.match(/[^.!؟!\n]+[.!؟!]?/g) ?? [text]).map((sentence) => sentence.trim()).filter(Boolean);
  if (sentences.length <= 6) return sentences;
  return Array.from({ length: 6 }, (_, index) => sentences[Math.round(index * (sentences.length - 1) / 5)]);
}

function stableScore(value: string, index: number) {
  let hash = 2166136261 ^ index;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function maskedSentence(sentence: string, words: LexicalItem[], targetWords: string[]) {
  const parts = sentence.split(WORD_PATTERN);
  const byWord = new Map(words.map((word) => [word.normalizedForm, word]));
  const protectedWords = new Set(targetWords.map(normalizePersian));
  const candidates = parts.flatMap((part, index) => {
    if (!IS_WORD.test(part)) return [];
    const normalized = normalizePersian(part);
    const item = byWord.get(normalized);
    if (protectedWords.has(normalized) || item?.knowledgeState === "new" || item?.knowledgeState === "learning") return [];
    const lowInformation = LOW_INFORMATION_WORDS.has(normalized);
    return [{ index, normalized, priority: lowInformation ? 0 : 1, score: stableScore(normalized, index) }];
  });
  const wordCount = parts.filter((part) => IS_WORD.test(part)).length;
  const hideCount = Math.min(candidates.length, Math.max(1, Math.round(wordCount * 0.3)));
  const hidden = new Set(candidates
    .sort((a, b) => a.priority - b.priority || a.score - b.score)
    .slice(0, hideCount)
    .map((candidate) => candidate.index));

  return parts.map((part, index) => hidden.has(index)
    ? <span className="inference-blank" key={`${index}-${part}`} aria-label="hidden predictable word">•••</span>
    : <span key={`${index}-${part}`}>{part}</span>);
}

export default function InferenceReadingText({ text, words, targetWords, disabled = false, gists, onGistsChange }: Props) {
  const sentences = useMemo(() => persianSentences(text), [text]);
  const [activeSentence, setActiveSentence] = useState(0);

  useEffect(() => setActiveSentence(0), [text]);

  const activeGist = gists[activeSentence] ?? "";
  const completeCount = gists.filter((gist) => gist.trim()).length;

  return <div className={disabled ? "inference-reader disabled" : "inference-reader"}>
    <div className="row spread inference-meta">
      <span>Sentence {activeSentence + 1}/{sentences.length}</span>
      <span>{completeCount}/{sentences.length} gists captured · 30% masked</span>
    </div>
    <div className="fa inference-sentence" dir="rtl">
      {maskedSentence(sentences[activeSentence] ?? "", words, targetWords)}
    </div>
    {!disabled && <label className="inference-gist">
      <span>Main idea in a few words—not a translation.</span>
      <input
        value={activeGist}
        onChange={(event) => onGistsChange(sentences.map((_, index) => index === activeSentence ? event.target.value : (gists[index] ?? "")))}
        placeholder="Type the gist…"
        autoComplete="off"
      />
    </label>}
    {!disabled && <div className="row inference-navigation">
      <button className="secondary" disabled={activeSentence === 0} onClick={() => setActiveSentence((index) => Math.max(0, index - 1))}>Previous</button>
      <button className="primary" disabled={!activeGist.trim() || activeSentence === sentences.length - 1} onClick={() => setActiveSentence((index) => Math.min(sentences.length - 1, index + 1))}>Next sentence</button>
    </div>}
  </div>;
}
