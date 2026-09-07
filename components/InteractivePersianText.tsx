"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePersian } from "@/lib/persian";
import InspectSelection from './InspectSelection';
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
const SYNAPTX_URL = process.env.NEXT_PUBLIC_SYNAPTX_URL ?? (process.env.NODE_ENV === "production" ? "https://synapt-x.app" : "http://localhost:3002");
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
  const [position,setPosition]=useState({left:0,top:0,above:true});
  const popup=useRef<HTMLDivElement>(null);
  const anchor=useRef<HTMLElement|null>(null);
  function choose(part:string,element:HTMLElement){
    const rect=element.getBoundingClientRect();anchor.current=element;
    setPosition({left:Math.max(12,Math.min(rect.left+rect.width/2-190,window.innerWidth-392)),top:rect.top>230?rect.top-10:rect.bottom+10,above:rect.top>230});
    setSelected(current=>current===part?'':part);
  }
  useEffect(()=>{
    if(!selected)return;
    const outside=(event:MouseEvent)=>{if(!popup.current?.contains(event.target as Node)&&!anchor.current?.contains(event.target as Node))setSelected('');};
    const close=()=>setSelected('');
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){close();anchor.current?.focus();}};
    document.addEventListener('click',outside);window.addEventListener('scroll',close,true);window.addEventListener('resize',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('click',outside);window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close);document.removeEventListener('keydown',key);};
  },[selected]);
  const parts = useMemo(() => text.split(WORD_PATTERN), [text]);
  const byWord = useMemo(() => new Map(words.map((word) => [word.normalizedForm, word])), [words]);
  const selectedItem = selected ? byWord.get(normalizePersian(selected)) : undefined;

  return <div className="interactive-text-wrap">
    <InspectSelection disabled={disabled}><div className={className} dir="rtl">
      {parts.map((part, index) => {
        if (!IS_WORD.test(part)) return <span key={`${index}-${part}`}>{part}</span>;
        const item = byWord.get(normalizePersian(part));
        const status = item?.knowledgeState ?? "untracked";
        return <span
          role="button"
          tabIndex={disabled ? -1 : 0}
          data-inspect-word={part}
          key={`${index}-${part}`}
          className={`passage-word word-${status} ${selected === part ? "selected" : ""}`}
          onClick={event => !disabled && !window.getSelection()?.toString().trim() && choose(part,event.currentTarget)}
          onKeyDown={event => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(part,event.currentTarget); } }}
          aria-disabled={disabled}
          title={disabled ? undefined : `${part} · ${item?.knowledgeState ?? "not tracked"}`}
        >{part}</span>;
      })}
    </div></InspectSelection>

    {selected && !disabled && <div ref={popup} role="dialog" aria-label="Word familiarity" className="word-status-panel word-status-popover" style={{left:position.left,top:position.top,transform:position.above?'translateY(-100%)':undefined}}>
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
