"use client";

import { useEffect, useRef } from "react";

type Props = {
  currentWord: string;
  captionListens: number;
  playing: boolean;
  preparing: boolean;
  onPlay: () => void;
  onExit: () => void;
};

export default function RapidCaptions({ currentWord, captionListens, playing, preparing, onPlay, onExit }: Props) {
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    document.body.classList.add("rapid-focus-open");
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitRef.current();
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => {
      document.body.classList.remove("rapid-focus-open");
      window.removeEventListener("keydown", exitOnEscape);
    };
  }, []);

  return <div className={playing || preparing ? "rapid-captions playing" : "rapid-captions"} role="dialog" aria-modal="true" aria-label="Rapid Persian captions">
    <button className="rapid-caption-exit" onClick={onExit} aria-label="Exit Rapid Captions">Exit ×</button>

    <div className="rapid-caption-stage" aria-live="assertive" aria-atomic="true">
      <span key={currentWord || (playing ? "playing" : "idle")} className={currentWord ? "rapid-caption-word fa" : "rapid-caption-word idle"} dir="rtl">
        {currentWord || (preparing ? "SYNCING…" : playing ? "" : captionListens ? "تمام" : "آماده")}
      </span>
    </div>

    {!playing && !preparing && <div className="rapid-caption-controls">
      <button className="primary" onClick={onPlay}>
        {captionListens ? "↻ Replay" : "▶ Start"}
      </button>
      {captionListens > 0 && <span>{captionListens} completed</span>}
    </div>}
  </div>;
}
