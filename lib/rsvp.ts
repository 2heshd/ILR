export const RSVP_SPEEDS = [250, 360, 500] as const;

export function rsvpWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function isFocusCharacter(character: string) {
  return /[\p{L}\p{N}]/u.test(character);
}

export function rsvpWordParts(word: string) {
  const characters = Array.from(word);
  const readableIndexes = characters
    .map((character, index) => isFocusCharacter(character) ? index : -1)
    .filter((index) => index >= 0);

  const focusIndex = readableIndexes.length
    ? readableIndexes[Math.floor((readableIndexes.length - 1) * 0.4)]
    : Math.floor(Math.max(0, characters.length - 1) / 2);

  return {
    before: characters.slice(0, focusIndex).join(""),
    focus: characters[focusIndex] ?? "",
    after: characters.slice(focusIndex + 1).join(""),
    focusIndex,
    length: characters.length,
  };
}

export function rsvpDelayMs(wpm: number, word: string) {
  const base = 60_000 / Math.max(1, wpm);
  const pauseMultiplier = /[.!?؟]$/u.test(word) ? 1.8 : /[,،؛:]$/u.test(word) ? 1.35 : 1;
  return Math.round(base * pauseMultiplier);
}
