"use client";

import { useMemo, useState } from "react";
import { normalizePersian } from "@/lib/persian";
import type { LexicalItem, WordKnowledgeState } from "@/lib/types";

type Props = {
  text: string;
  words: LexicalItem[];
  className?: string;
  disabled?: boolean;
  onStatus: (word: string, status: WordKnowledgeState) => void;
};

const WORD_PATTERN = /([\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+)/g;
const IS_WORD = /^[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+$/;
const SYNAPTX_URL = process.env.NEXT_PUBLIC_SYNAPTX_URL ?? "http://localhost:3002";
function morphologyUrl(word: string) {
  const params = new URLSearchParams({ word, language: "fa", focus: "etymology" });
  return `${SYNAPTX_URL}/morphology.html?${params}`;
}
const STATES: Array<{ value: WordKnowledgeState; label: string; detail: string }> = [
  { value: "new", label: "New", detail: "Unfamiliar · review now" },
  { value: "learning", label: "Learning", detail: "Still building recall" },
  { value: "known", label: "Known", detail: "Recognized reliably" },
  { value: "automatic", label: "Automatic", detail: "Instant recognition" },
];

export default function InteractivePersianText({ text, words, className = "", disabled = false, onStatus }: Props) {
  const [selected, setSelected] = useState("");
  const parts = useMemo(() => text.split(WORD_PATTERN), [text]);
  const byWord = useMemo(() => new Map(words.map((word) => [word.normalizedForm, word])), [words]);
  const selectedItem = selected ? byWord.get(normalizePersian(selected)) : undefined;

  return <div className="interactive-text-wrap">
    <div className={className} dir="rtl">
      {parts.map((part, index) => {
        if (!IS_WORD.test(part)) return <span key={`${index}-${part}`}>{part}</span>;
        const item = byWord.get(normalizePersian(part));
        const status = item?.knowledgeState ?? "untracked";
        return <button
          type="button"
          key={`${index}-${part}`}
          className={`passage-word word-${status} ${selected === part ? "selected" : ""}`}
          onClick={() => !disabled && setSelected((current) => current === part ? "" : part)}
          disabled={disabled}
          title={disabled ? undefined : `${part} · ${item?.knowledgeState ?? "not tracked"}`}
        >{part}</button>;
      })}
    </div>

    {selected && !disabled && <div className="word-status-panel">
      <div className="word-status-heading"><strong className="fa" dir="rtl">{selected}</strong><span>{selectedItem?.definition || "Choose how well you know this word."}</span><button type="button" onClick={() => setSelected("")} aria-label="Close word status">×</button></div>
      <div className="word-status-options">
        {STATES.map((state) => <button
          type="button"
          key={state.value}
          className={selectedItem?.knowledgeState === state.value ? "active" : ""}
          onClick={() => { onStatus(selected, state.value); setSelected(""); }}
        ><strong>{state.label}</strong><small>{state.detail}</small></button>)}
      </div>
      <a className="secondary button-link inspect-link" href={morphologyUrl(selected)} target="_blank" rel="noreferrer">Inspect morphology in Synaptx ↗</a>
    </div>}
  </div>;
}
