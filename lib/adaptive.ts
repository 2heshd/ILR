import type { IlrLevel, StudyState } from "./types";

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function adaptiveAllocation(state: StudyState) {
  let listening = 35;
  let reading = 35;
  let lexical = 20;
  const speaking = 10;

  const recentReading = state.passageAttempts.slice(-5).map((a) => a.comprehensionScore);
  const recentListening = state.listeningAttempts.slice(-5).map((a) => a.comprehensionScore);
  const r = avg(recentReading);
  const l = avg(recentListening);

  if (recentReading.length >= 2 && recentListening.length >= 2) {
    if (r + 10 < l) {
      reading += 10;
      listening -= 10;
    } else if (l + 10 < r) {
      listening += 10;
      reading -= 10;
    }
  }

  const due = state.words.filter((w) => new Date(w.dueAt).getTime() <= Date.now()).length;
  if (due > 60) {
    lexical += 5;
    if (reading >= listening) reading -= 5;
    else listening -= 5;
  }

  return { listening, reading, lexical, speaking };
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
  const known = ranked.filter((word) => word.knowledgeState === "known" || word.sourceWeek < state.weekNumber);
  const knownIds = new Set(known.map((word) => word.id));
  const learning = ranked.filter((word) => !knownIds.has(word.id));
  const knownTarget = Math.round(count * 0.85);
  const selected = [...known.slice(0, knownTarget), ...learning.slice(0, count - Math.min(knownTarget, known.length))];
  if (selected.length < count) {
    const selectedIds = new Set(selected.map((word) => word.id));
    selected.push(...ranked.filter((word) => !selectedIds.has(word.id)).slice(0, count - selected.length));
  }
  return selected.slice(0, count).map((word) => word.displayForm);
}
