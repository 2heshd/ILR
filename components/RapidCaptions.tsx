"use client";

type Props = {
  currentWord: string;
  blindComplete: boolean;
  captionListens: number;
  playing: boolean;
  gist: string;
  onBlindPlay: () => void;
  onCaptionPlay: () => void;
  onGistChange: (value: string) => void;
};

export default function RapidCaptions({ currentWord, blindComplete, captionListens, playing, gist, onBlindPlay, onCaptionPlay, onGistChange }: Props) {
  return <div className="rapid-captions">
    <div className="rapid-caption-stage" aria-live="assertive" aria-atomic="true">
      <span className={currentWord ? "rapid-caption-word fa" : "rapid-caption-word idle"} dir="rtl">
        {currentWord || (playing ? "گوش کن" : blindComplete ? "آماده" : "بدون متن")}
      </span>
    </div>

    <div className="rapid-caption-controls">
      <button className={blindComplete ? "secondary" : "primary"} disabled={playing || blindComplete} onClick={onBlindPlay}>
        {blindComplete ? "✓ Blind listen complete" : "▶ Listen without captions"}
      </button>
      <button className="primary" disabled={playing || !blindComplete} onClick={onCaptionPlay}>
        {playing && currentWord ? "Captioning…" : "↻ Replay with word captions"}
      </button>
      <span className="muted">Persian only · one word at a time · caption replays: {captionListens}</span>
    </div>

    <label className="rapid-caption-gist">
      <span>Main idea in a few words</span>
      <input
        value={gist}
        onChange={(event) => onGistChange(event.target.value)}
        placeholder={blindComplete ? "What was it mainly about?" : "Complete the blind listen first…"}
        disabled={!blindComplete || playing}
        autoComplete="off"
      />
    </label>
  </div>;
}
