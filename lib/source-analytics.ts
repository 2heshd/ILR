import type { ListeningAttempt, ListeningItem, Passage, PassageAttempt } from "./types";

export type SourceMetric = { label: string; attempts: number; average: number };
type Dimension = "source" | "genre" | "register";

export function sourceMetrics(
  passages: Passage[],
  passageAttempts: PassageAttempt[],
  listeningItems: ListeningItem[],
  listeningAttempts: ListeningAttempt[],
  dimension: Dimension,
): SourceMetric[] {
  const scores: Record<string, number[]> = {};
  const labelFor = (item: Passage | ListeningItem) => {
    if (dimension === "source") return item.publisher || (item.sourceType === "generated" ? "AI-generated" : "Unknown source");
    return item[dimension] || "Unclassified";
  };
  const add = (label: string, score: number) => { (scores[label] ??= []).push(score); };
  const passageById = new Map(passages.map((item) => [item.id, item]));
  const listeningById = new Map(listeningItems.map((item) => [item.id, item]));
  passageAttempts.forEach((attempt) => { const item = passageById.get(attempt.passageId); if (item) add(labelFor(item), attempt.comprehensionScore); });
  listeningAttempts.forEach((attempt) => { const item = listeningById.get(attempt.listeningItemId); if (item) add(labelFor(item), attempt.comprehensionScore); });
  return Object.entries(scores)
    .map(([label, values]) => ({ label, attempts: values.length, average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) }))
    .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label));
}
