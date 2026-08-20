import type { IlrLevel, StudyState } from "./types";

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function adaptiveAllocation(state: StudyState) {
  let listening = 34;
  let reading = 36;
  let lexical = 14;
  const speaking = 9;
  let repair = 7;

  const recentReading = state.passageAttempts.slice(-5).map((a) => a.comprehensionScore);
  const recentListening = state.listeningAttempts.slice(-5).map((a) => a.comprehensionScore);
  const r = avg(recentReading);
  const l = avg(recentListening);

  if (recentReading.length >= 2 && recentListening.length >= 2) {
    if (r + 10 < l) {
      reading += 8;
      listening -= 8;
    } else if (l + 10 < r) {
      listening += 8;
      reading -= 8;
    }
  }

  const due = state.words.filter((w) => new Date(w.dueAt).getTime() <= Date.now()).length;
  if (due > 60) {
    lexical += 4;
    if (reading >= listening) reading -= 4;
    else listening -= 4;
  }

  const recentFailures = [
    ...state.passageAttempts.slice(-5).flatMap((attempt) => attempt.errorCategories ?? []),
    ...state.listeningAttempts.slice(-5).flatMap((attempt) => attempt.errorCategories ?? []),
  ];
  if (recentFailures.length >= 3) {
    repair += 3;
    if (reading >= listening) reading -= 3;
    else listening -= 3;
  }

  return { reading, listening, lexical, speaking, repair };
}

export function currentTrainingPhase(weekNumber: number) {
  if (weekNumber <= 4) return { label: "Foundation", authenticTarget: 10, focus: "lexical mapping and sentence parsing" };
  if (weekNumber <= 8) return { label: "Automaticity", authenticTarget: 20, focus: "faster text and audio recognition" };
  if (weekNumber <= 12) return { label: "Transfer", authenticTarget: 35, focus: "unseen context and inference" };
  if (weekNumber <= 18) return { label: "Professional", authenticTarget: 50, focus: "authentic news and normal broadcast speech" };
  if (weekNumber <= 24) return { label: "Upper range", authenticTarget: 65, focus: "complex syntax, connotation, and cultural reference" };
  if (weekNumber <= 30) return { label: "Reading 4 push", authenticTarget: 80, focus: "editorials and unpredictable argument" };
  if (weekNumber <= 34) return { label: "Fresh transfer", authenticTarget: 90, focus: "unseen upper-range material" };
  return { label: "Consolidation", authenticTarget: 95, focus: "fresh diagnostics and targeted repair" };
}

export function dominantBottleneck(state: StudyState) {
  const failures = [
    ...state.passageAttempts.slice(-8).flatMap((attempt) => attempt.errorCategories ?? []),
    ...state.listeningAttempts.slice(-8).flatMap((attempt) => attempt.errorCategories ?? []),
  ];
  const counts = failures.reduce<Record<string, number>>((result, failure) => ({ ...result, [failure]: (result[failure] ?? 0) + 1 }), {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top) return { key: top[0], label: top[0].replace("_", " / "), evidence: `${top[1]} recent signal${top[1] === 1 ? "" : "s"}` };
  const reading = avg(state.passageAttempts.slice(-5).map((attempt) => attempt.comprehensionScore));
  const listening = avg(state.listeningAttempts.slice(-5).map((attempt) => attempt.comprehensionScore));
  if (reading && listening && reading + 10 < listening) return { key: "reading", label: "reading transfer", evidence: `${Math.round(reading)}% recent average` };
  if (reading && listening && listening + 10 < reading) return { key: "listening", label: "listening transfer", evidence: `${Math.round(listening)}% recent average` };
  return { key: "baseline", label: "collecting evidence", evidence: "complete fresh Reading and Listening attempts" };
}

export function targetIlrForWeek(weekNumber: number, skill: "reading" | "listening", currentIlr: IlrLevel = 1) {
  const cap = skill === "reading" ? 4 : 3.5;
  const courseStep = Math.min(0.5, Math.floor(Math.max(0, weekNumber - 1) / 12) * 0.25);
  return Math.min(cap, currentIlr + 0.25 + courseStep);
}

export function selectContextWords(state: StudyState, count = 12) {
  const ranked = [...state.words].sort((a, b) => {
      const aWeak = a.reviews ? a.correct / a.reviews : 0;
      const bWeak = b.reviews ? b.correct / b.reviews : 0;
      const weekBias = b.sourceWeek - a.sourceWeek;
      return aWeak - bWeak || weekBias;
    });
  const known = ranked.filter((word) => word.knowledgeState === "known" || word.knowledgeState === "automatic" || word.sourceWeek < state.weekNumber);
  const knownIds = new Set(known.map((word) => word.id));
  const learning = ranked.filter((word) => !knownIds.has(word.id));
  const historicalCohorts = [1, 3, 7, 15, 27].map((offset) => state.weekNumber - offset).filter((week) => week > 0);
  const historical = ranked.filter((word) => historicalCohorts.includes(word.sourceWeek));
  const historicalIds = new Set(historical.map((word) => word.id));
  const knownWithoutCohorts = known.filter((word) => !historicalIds.has(word.id));
  const historicalTarget = Math.min(historical.length, Math.max(1, Math.round(count * 0.2)));
  const knownTarget = Math.max(0, Math.round(count * 0.85) - historicalTarget);
  const selected = [
    ...historical.slice(0, historicalTarget),
    ...knownWithoutCohorts.slice(0, knownTarget),
    ...learning.slice(0, count - Math.min(count, historicalTarget + knownTarget)),
  ];
  if (selected.length < count) {
    const selectedIds = new Set(selected.map((word) => word.id));
    selected.push(...ranked.filter((word) => !selectedIds.has(word.id)).slice(0, count - selected.length));
  }
  return selected.slice(0, count).map((word) => word.displayForm);
}
