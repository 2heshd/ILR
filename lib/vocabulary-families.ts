import type { CourseVocabularyEntry } from "./course.ts";

export type RelatedVocabulary = { word: string; meaning: string; build: string };

const DIACRITICS = /[\u064b-\u065f\u0670ـ]/gu;
const PERSIAN_PART = /[\u0600-\u06ff‌]+/gu;
const AFFIXES = ["ناک", "مند", "گاه", "گر", "گی"];
const CURATED: Record<string, RelatedVocabulary[]> = {
  گلو: [{ word: "گلودرد", meaning: "sore throat", build: "گلو + درد" }],
};

function normalized(value: string) {
  return value.normalize("NFKC").replace(DIACRITICS, "").replace(/[يى]/gu, "ی").replace(/ك/gu, "ک").replace(/[\s‌\-،؛/()]/gu, "");
}
function meaningStems(value: string) { return value.toLocaleLowerCase().match(/[a-z]{4,}/gu)?.map((word) => word.slice(0, 4)) ?? []; }
function familyBases(word: string) {
  const form = normalized(word), bases = new Set([form]);
  for (const affix of AFFIXES) if (form.endsWith(affix) && form.length >= affix.length + 2) bases.add(form.slice(0, -affix.length));
  for (const prefix of ["بی", "نا"]) if (form.startsWith(prefix) && form.length >= prefix.length + 2) bases.add(form.slice(prefix.length));
  return [...bases].filter((base) => base.length >= 3);
}

/** Conservative associations from the verified glossary. Spelling overlap must
 * also share an English meaning stem, preventing گلو/throat → گلوله/bullet. */
export function relatedVocabulary(word: string, meaning: string, catalog: CourseVocabularyEntry[], limit = 4) {
  const source = normalized(word), bases = familyBases(word), stems = meaningStems(meaning);
  const rows: Array<RelatedVocabulary & { score: number }> = [], seen = new Set<string>([source]);
  for (const item of CURATED[source] ?? []) { const key = normalized(item.word); if (!seen.has(key)) { seen.add(key); rows.push({ ...item, score: 100 }); } }
  for (const entry of catalog) {
    const candidate = normalized(entry.fa);
    if (!candidate || seen.has(candidate)) continue;
    const base = bases.find((part) => candidate.includes(part));
    if (!base || !stems.some((stem) => entry.en.toLocaleLowerCase().includes(stem))) continue;
    const pieces = entry.fa.match(PERSIAN_PART) ?? [entry.fa];
    const build = pieces.length > 1 ? pieces.join(" + ") : `${base} + ${candidate.replace(base, "") || "related form"}`;
    seen.add(candidate);
    rows.push({ word: entry.fa, meaning: entry.en, build, score: (candidate.startsWith(base) ? 20 : 10) - Math.abs(candidate.length - base.length) });
  }
  return rows.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, "fa")).slice(0, limit).map(({ score: _score, ...item }) => item);
}
