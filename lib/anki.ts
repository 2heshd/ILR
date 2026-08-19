import type { ReviewRating } from "./types";

export type AnkiVocabularyRow = {
  displayForm: string;
  definition?: string;
  romanization?: string;
};

export type AnkiReviewRow = {
  displayForm: string;
  externalId: string;
  reviewedAt: string;
  correct: boolean;
  responseMs: number;
  rating: ReviewRating;
};

export type AnkiField = { value: string; order: number };
export type AnkiNoteInfo = { noteId: number; fields: Record<string, AnkiField>; tags?: string[] };
export type AnkiCardInfo = { cardId: number; fields: Record<string, AnkiField> };
export type AnkiReviewInfo = { id: number; ease: number; time: number };

export function orderedFieldValues(fields: Record<string, AnkiField>) {
  return Object.entries(fields).sort(([, a], [, b]) => a.order - b.order).map(([name, field]) => ({ name, value: field.value }));
}

export function parseAnkiText(text: string): AnkiVocabularyRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const cells = lines.map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
  const first = cells[0].map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => ["front", "word", "persian", "displayform", "back", "definition", "romanization"].includes(cell));
  const frontIndex = Math.max(0, first.findIndex((cell) => ["front", "word", "persian", "displayform"].includes(cell)));
  const backIndex = first.findIndex((cell) => ["back", "definition", "meaning"].includes(cell));
  const romanizationIndex = first.findIndex((cell) => ["romanization", "transliteration", "pronunciation"].includes(cell));
  return cells.slice(hasHeader ? 1 : 0).map((row) => ({
    displayForm: row[hasHeader ? frontIndex : 0] ?? "",
    definition: row[hasHeader && backIndex >= 0 ? backIndex : 1] || undefined,
    romanization: row[hasHeader && romanizationIndex >= 0 ? romanizationIndex : 2] || undefined,
  })).filter((row) => row.displayForm);
}

function tsvCell(value: string | undefined) {
  return (value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

export function exportAnkiTsv(rows: AnkiVocabularyRow[]) {
  return ["Front\tBack\tRomanization\tTags", ...rows.map((row) => `${tsvCell(row.displayForm)}\t${tsvCell(row.definition)}\t${tsvCell(row.romanization)}\tilr-persian`)].join("\n");
}

export async function invokeAnki<T>(endpoint: string, action: string, params: Record<string, unknown> = {}, apiKey?: string): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params, ...(apiKey ? { key: apiKey } : {}) }),
  });
  if (!response.ok) throw new Error(`AnkiConnect returned HTTP ${response.status}.`);
  const body = await response.json() as { result: T; error: string | null };
  if (body.error) throw new Error(body.error);
  return body.result;
}

export function easeToRating(ease: number): ReviewRating {
  if (ease <= 1) return "again";
  if (ease === 2) return "hard";
  if (ease === 3) return "good";
  return "easy";
}
