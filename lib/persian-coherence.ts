const normalize = (value: string) => value
  .normalize("NFKC")
  .replace(/[يى]/gu, "ی")
  .replace(/ك/gu, "ک");

export function persianCoherenceIssues(value: unknown) {
  const text = normalize(String(value ?? "").trim());
  if (!text) return ["The Persian passage is empty."];
  const issues: string[] = [];

  if (/باهم/u.test(text)) {
    issues.push("Write the adverb با هم as two words, not باهم.");
  }

  if (/(?:^|[\s،,.؟!])من(?=$|[\s،,.؟!])/u.test(text) && /با\s+(?:مادر|پدر|مادربزرگ|پدربزرگ)(?=[\s،,.؟!])/u.test(text)) {
    issues.push("A first-person reference to the speaker's close relative needs a clear possessive form, such as مادربزرگم.");
  }

  if (/وقت(?:ِ|\s)+(?:به\s+)?سر\s+کار\s+رفتن\s+می‌?رسد/u.test(text)) {
    issues.push("Use a natural time-to-leave construction, such as وقتی وقتِ رفتن به سرِ کار می‌شود; do not use وقت سر کار رفتن می‌رسد.");
  }

  if (/به\s+من\s+کمک\s+می‌?کند(?:\s+و|[.،؟!]|$)/u.test(text)) {
    issues.push("State what the person helps the speaker do; به من کمک می‌کند cannot end as a vague event in a controlled passage.");
  }

  return issues;
}
