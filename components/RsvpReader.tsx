"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RSVP_SPEEDS, rsvpDelayMs, rsvpWordParts, rsvpWords } from "@/lib/rsvp";

export default function RsvpReader({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const words = useMemo(() => rsvpWords(text), [text]);
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState<number>(RSVP_SPEEDS[0]);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLElement>(null);

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

  useLayoutEffect(() => {
    const alignFocus = () => {
      const stage = stageRef.current;
      const wordElement = wordRef.current;
      const focus = focusRef.current;
      if (!stage || !wordElement || !focus) return;

      wordElement.style.transform = "translateX(0)";
      const stageBounds = stage.getBoundingClientRect();
      const focusBounds = focus.getBoundingClientRect();
      const offset = stageBounds.left + stageBounds.width / 2 - (focusBounds.left + focusBounds.width / 2);
      wordElement.style.transform = `translateX(${offset}px)`;
    };

    alignFocus();
    window.addEventListener("resize", alignFocus);
    return () => window.removeEventListener("resize", alignFocus);
  }, [disabled, word]);

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
    <div ref={stageRef} className="rsvp-stage" aria-live="off">
      {disabled ? <span className="rsvp-ready">Start reading to begin the word stream.</span> : <>
        <div ref={wordRef} className="rsvp-word fa" lang="fa" dir="rtl" aria-label={word}>
          <span>{parts.before}</span><b ref={focusRef} aria-hidden="true">{parts.focus}</b><span>{parts.after}</span>
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
