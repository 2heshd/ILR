export type CourseVocabularyEntry = {
  id: number;
  list: number;
  lesson: string;
  fa: string;
  en: string;
  type: string;
  week: number;
};

type CourseCatalog = {
  meta: {
    id: string;
    title: string;
    sourceFile: string;
    sourceSheet: string;
    version: string;
    entries: number;
    lessonLists: number;
    weeks: number;
    weekCounts: number[];
    weekLessonCounts: number[];
  };
  entries: CourseVocabularyEntry[];
};

export const COURSE_META = {
  id: "dli-ch4-ch5l1-news-2026-09-01",
  title: "DLI Chapter 4–5.1 + News Cycle",
  sourceFile: "ChiMishe V22.2.xlsm",
  entries: 194,
  lessonLists: 3,
  weeks: 1,
  weekCounts: [194],
  weekLessonCounts: [3],
} as const;

export async function loadCourseWeek(week: number) {
  const module = await import("@/data/course-vocabulary.json");
  const catalog = module.default as CourseCatalog;
  return catalog.entries
    .filter((entry) => [
      "Unit 1 - Chapter 4 - Lesson 1",
      "Unit 1 - Chapter 4 - Lesson 2",
      "Unit 2 - Chapter 5 - Lesson 1",
    ].includes(entry.lesson))
    .map((entry) => ({ ...entry, week }));
}
