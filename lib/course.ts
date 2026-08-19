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
  id: "chimishe-v22-2-unit1",
  title: "ChiMishe course vocabulary",
  sourceFile: "ChiMishe V22.2.xlsm",
  entries: 5819,
  lessonLists: 147,
  weeks: 35,
  weekCounts: [107, 144, 200, 137, 185, 177, 159, 146, 169, 179, 158, 202, 153, 170, 164, 184, 147, 177, 174, 181, 136, 163, 171, 172, 205, 162, 151, 146, 204, 154, 158, 217, 121, 187, 159],
  weekLessonCounts: [4, 5, 6, 4, 6, 6, 5, 4, 4, 5, 4, 5, 5, 6, 6, 6, 5, 4, 5, 4, 4, 4, 4, 3, 4, 3, 3, 3, 4, 3, 3, 3, 2, 3, 2],
} as const;

export async function loadCourseWeek(week: number) {
  const module = await import("@/data/course-vocabulary.json");
  const catalog = module.default as CourseCatalog;
  return catalog.entries
    .filter((entry) => !entry.lesson.startsWith("Introductory Unit") && entry.week - 1 === week)
    .map((entry) => ({ ...entry, week: entry.week - 1 }));
}
