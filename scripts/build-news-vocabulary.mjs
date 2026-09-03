import fs from "node:fs";

const course = JSON.parse(fs.readFileSync(new URL("../data/course-vocabulary.json", import.meta.url), "utf8"));
const cycle = JSON.parse(fs.readFileSync(new URL("../data/curated-cycle.json", import.meta.url), "utf8"));

function normalize(value = "") {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670]/gu, "")
    .replace(/ك/gu, "ک")
    .replace(/[يى]/gu, "ی")
    .replace(/[\s‌]+/gu, " ")
    .trim();
}

const items = [];
const seen = new Set();
function add(item) {
  const normalizedForm = normalize(item.displayForm);
  const key = normalizedForm.replace(/[\s‌]+/gu, "");
  if (!normalizedForm || !item.definition?.trim() || seen.has(key)) return;
  seen.add(key);
  items.push({ ...item, normalizedForm });
}

cycle.vocabulary.filter((word) => word.sourceType === "system_advanced").forEach((word, index) => add({
  id: `news-sample-${String(index + 1).padStart(3, "0")}`,
  displayForm: word.displayForm,
  definition: word.definition,
  romanization: word.romanization,
  sourceType: "system_advanced",
  sourceWeek: 1,
  tier: "A",
  topic: "BBC Persian + Iran International frequency sample",
  provenance: "frequency_sample",
}));

const advanced = [...course.entries].sort((a, b) => {
  const aNews = /Newspaper Book/u.test(a.lesson) ? 1 : 0;
  const bNews = /Newspaper Book/u.test(b.lesson) ? 1 : 0;
  return bNews - aNews || b.week - a.week || a.id - b.id;
});

for (const entry of advanced) {
  if (items.length >= 2000) break;
  if (entry.week < 20 && !/Newspaper Book/u.test(entry.lesson)) continue;
  add({
    id: `news-course-${entry.id}`,
    displayForm: entry.fa,
    definition: entry.en,
    sourceType: "system_advanced",
    sourceWeek: entry.week,
    tier: "A",
    courseEntryId: entry.id,
    courseListNumber: entry.list,
    courseLesson: entry.lesson,
    topic: /Newspaper Book/u.test(entry.lesson) ? "ChiMishe Newspaper Book" : "ChiMishe advanced formal Persian",
    provenance: /Newspaper Book/u.test(entry.lesson) ? "newspaper_book" : "advanced_course",
  });
}

if (items.length !== 2000) throw new Error(`Expected 2,000 unique news/formal entries, found ${items.length}`);

const output = {
  meta: {
    id: "persian-news-vocabulary-2000-v1",
    title: "Persian news vocabulary",
    entries: items.length,
    frequencySampleEntries: items.filter((item) => item.provenance === "frequency_sample").length,
    newspaperBookEntries: items.filter((item) => item.provenance === "newspaper_book").length,
    advancedCourseEntries: items.filter((item) => item.provenance === "advanced_course").length,
    sources: ["BBC Persian + Iran International 2,000-token frequency sample", "ChiMishe Newspaper Book", "ChiMishe advanced formal-Persian course units"],
  },
  entries: items,
};

fs.writeFileSync(new URL("../data/news-vocabulary.json", import.meta.url), `${JSON.stringify(output)}\n`);
console.log(JSON.stringify(output.meta, null, 2));
