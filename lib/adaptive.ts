import type { StudyState } from "./types";

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

export function targetIlrForWeek(weekNumber: number, skill: "reading" | "listening") {
  const start = skill === "reading" ? 1.5 : 1.25;
  const cap = skill === "reading" ? 4 : 3.5;
  return Math.min(cap, Math.round((start + weekNumber / 14) * 4) / 4);
}

export function selectContextWords(state: StudyState, count = 12) {
  return [...state.words]
    .sort((a, b) => {
      const aWeak = a.reviews ? a.correct / a.reviews : 0;
      const bWeak = b.reviews ? b.correct / b.reviews : 0;
      const weekBias = b.sourceWeek - a.sourceWeek;
      return aWeak - bWeak || weekBias;
    })
    .slice(0, count)
    .map((w) => w.displayForm);
}
