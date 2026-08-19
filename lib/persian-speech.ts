const PERSIAN_LETTERS = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC]/g;

export function sanitizePersianSpeechText(input: string) {
  return input
    .replace(/```[a-z]*|```/gi, " ")
    .replace(/(?:\.{2,}|…+)/g, "، ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMeaningfulPersianText(input: unknown) {
  if (typeof input !== "string") return false;
  const cleaned = sanitizePersianSpeechText(input);
  const letters = cleaned.match(PERSIAN_LETTERS)?.length ?? 0;
  return cleaned.length >= 20 && letters >= 12;
}
