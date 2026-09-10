"use client";

import { useEffect, useMemo, useState } from "react";
import { RSVP_SPEEDS, rsvpDelayMs, rsvpWordParts, rsvpWords } from "@/lib/rsvp";

export default function RsvpReader({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const words = useMemo(() => rsvpWords(text), [text]);
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState<number>(RSVP_SPEEDS[0]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [text]);

  useEffect(() => {
    if (disabled || !playing || !words.length) return;
    const timer = window.setTimeout(() => {
      if (index >= words.length - 1) {
        setPlaying(false);
        return;
      }
      setIndex((current) => current + 1);
    }, rsvpDelayMs(wpm, words[index]));
    return () => window.clearTimeout(timer);
  }, [disabled, index, playing, words, wpm]);

  const word = words[index] ?? "";
  const parts = rsvpWordParts(word);
  const rightClip = parts.length ? (parts.focusIndex / parts.length) * 100 : 0;
  const leftClip = parts.length ? ((parts.length - parts.focusIndex - 1) / parts.length) * 100 : 0;

  function restart() {
    setIndex(0);
    setPlaying(!disabled && words.length > 0);
  }

  return <section className={`rsvp-reader${disabled ? " disabled" : ""}`} aria-label="Rapid serial visual presentation reader">
    <div className="rsvp-speed" aria-label="Reading speed">
      {RSVP_SPEEDS.map((speed) => <button
        type="button"
        key={speed}
        className={wpm === speed ? "active" : ""}
        aria-pressed={wpm === speed}
        disabled={disabled}
        onClick={() => setWpm(speed)}
      >{speed} WPM</button>)}
    </div>
    <div className="rsvp-stage" aria-live="off">
      {disabled ? <span className="rsvp-ready">Start reading to begin the word stream.</span> : <>
        <div className="rsvp-word fa" lang="fa" dir="rtl" aria-label={word}>
          <span>{word}</span>
          <b aria-hidden="true" style={{ clipPath: `inset(0 ${rightClip}% 0 ${leftClip}%)` }}>{word}</b>
        </div>
      </>}
    </div>
    <div className="rsvp-controls">
      <button type="button" disabled={disabled || !words.length} onClick={() => setIndex((current) => Math.max(0, current - 1))} aria-label="Previous word">←</button>
      <button type="button" className="primary" disabled={disabled || !words.length} onClick={() => {
        if (index >= words.length - 1) setIndex(0);
        setPlaying((current) => !current);
      }}>{playing ? "Pause" : index >= words.length - 1 ? "Play again" : "Play"}</button>
      <button type="button" disabled={disabled || !words.length} onClick={() => setIndex((current) => Math.min(words.length - 1, current + 1))} aria-label="Next word">→</button>
      <button type="button" disabled={disabled || !words.length} onClick={restart}>Restart</button>
    </div>
    <div className="rsvp-progress" aria-label={`Word ${Math.min(index + 1, words.length)} of ${words.length}`}>
      <i style={{ width: `${words.length ? ((index + 1) / words.length) * 100 : 0}%` }} />
    </div>
    <small>{words.length ? `${Math.min(index + 1, words.length)} / ${words.length} words` : "No reading text"}</small>
  </section>;
}
