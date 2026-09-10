export const RSVP_SPEEDS = [150, 250, 360, 500] as const;

export function rsvpWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function isFocusCharacter(character: string) {
  return /[\p{L}\p{N}]/u.test(character);
}

export function rsvpWordParts(word: string) {
  const graphemes = Array.from(new Intl.Segmenter("fa", { granularity: "grapheme" }).segment(word), ({ segment }) => segment);
  const readableIndexes = graphemes
    .map((grapheme, index) => isFocusCharacter(grapheme) ? index : -1)
    .filter((index) => index >= 0);

  const focusIndex = readableIndexes.length
    ? readableIndexes[Math.floor((readableIndexes.length - 1) * 0.4)]
    : Math.floor(Math.max(0, graphemes.length - 1) / 2);
  const before = graphemes.slice(0, focusIndex).join("");
  const focus = graphemes[focusIndex] ?? "";

  return {
    before,
    focus,
    after: graphemes.slice(focusIndex + 1).join(""),
    focusIndex,
    focusStart: before.length,
    focusEnd: before.length + focus.length,
    length: graphemes.length,
  };
}

export function rsvpDelayMs(wpm: number, word: string) {
  const base = 60_000 / Math.max(1, wpm);
  const pauseMultiplier = /[.!?؟]$/u.test(word) ? 1.8 : /[,،؛:]$/u.test(word) ? 1.35 : 1;
  return Math.round(base * pauseMultiplier);
}
