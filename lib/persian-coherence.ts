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

  for (const sentence of text.split(/[.؟!]+/u)) {
    if (/(?:^|[\s،])من(?:[\s،])/u.test(sentence)
      && !/(?:^|[\s،])من\s+و\s+/u.test(sentence)
      && /(?:کردیم|خریدیم|رفتیم|آمدیم|بودیم|داشتیم|شدیم|گفتیم|دیدیم|خوردیم|خواندیم|نوشتیم|گرفتیم)(?=$|[\s،])/u.test(sentence)) {
      issues.push("An explicit singular من subject cannot take a first-person plural verb ending unless it is coordinated with another participant.");
    }
  }

  return issues;
}

export function persianRegisterIssues(value: unknown, register: "formal" | "colloquial") {
  const text = normalize(String(value ?? "").trim());
  const issues: string[] = [];

  if (register === "formal") {
    if (/(?:^|[\s،,.؟!])(?:یه|خونه|توی|اینا|اونا|می‌?خوام|می‌?رم)(?=$|[\s،,.؟!])/u.test(text)) {
      issues.push("The formal passage contains conversational Persian morphology or function words.");
    }
    if (/(?:^|[\s،,.؟!])رو(?=$|[\s،,.؟!])/u.test(text)) {
      issues.push("Use را rather than colloquial رو in a formal passage.");
    }
  } else {
    // This catches the exact kind of half-converted register that produced
    // phrases such as «توی خانه‌ام» inside otherwise conversational narration.
    if (/توی\s+خانه(?:‌?ام|‌?مان|‌?شان)?/u.test(text)) {
      issues.push("Use a consistently conversational home form, such as خونه or خونه‌ام, after توی.");
    }
    const conversationalPatterns = [
      /(?:^|[\s،,.؟!])(?:یه|رو|توی|اون|اینا|اونا|اونجا|بعدش)(?=$|[\s،,.؟!])/gu,
      /(?:^|[\s،,.؟!])(?:خونه|نون|می‌?خوام|می‌?رم|می‌?ریم|می‌?شه|نمی‌?شه|مهمه|باشه|اومد(?:م|ی|یم|ن|ند)?|دارن|هستن|می‌?(?:کنن|دن|شن|گن)|ب(?:خرن|رن|شن|گن)|بتونن)(?=$|[\s،,.؟!])/gu,
      /[\u0600-\u06ff‌]+(?:شون|مون|تون|هامو|هاشون)(?=$|[\s،,.؟!])/gu,
    ];
    const markerCount = conversationalPatterns.reduce((total, pattern) => total + (text.match(pattern) ?? []).length, 0);
    if (markerCount < 4) {
      issues.push("The colloquial passage must use consistent spoken Persian throughout, with at least four conversational forms.");
    }
  }

  return issues;
}
