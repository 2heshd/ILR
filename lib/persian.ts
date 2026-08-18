const ARABIC_TO_PERSIAN: Record<string, string> = { "ي": "ی", "ى": "ی", "ك": "ک" };

export function normalizePersian(input: string): string {
  return input
    .trim()
    .replace(/[يىك]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c)
    .replace(/\u200c+/g, "‌")
    .replace(/\s+/g, " ");
}

export function parseWeeklyInput(input: string): Array<{ displayForm: string; definition?: string; romanization?: string }> {
  return input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[\t|—–-]\s*/).filter(Boolean);
      return {
        displayForm: parts[0],
        definition: parts[1],
        romanization: parts[2],
      };
    });
}
