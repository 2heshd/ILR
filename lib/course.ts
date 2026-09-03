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
  id: "chimishe-v22-2",
  title: "ChiMishe course vocabulary",
  sourceFile: "ChiMishe V22.2.xlsm",
  entries: 6060,
  lessonLists: 154,
  weeks: 36,
  weekCounts: [178, 170, 144, 200, 137, 185, 177, 159, 146, 169, 179, 158, 202, 153, 170, 164, 184, 147, 177, 174, 181, 136, 163, 171, 172, 205, 162, 151, 146, 204, 154, 158, 217, 121, 187, 159],
  weekLessonCounts: [5, 6, 5, 6, 4, 6, 6, 5, 4, 4, 5, 4, 5, 5, 6, 6, 6, 5, 4, 5, 4, 4, 4, 4, 3, 4, 3, 3, 3, 4, 3, 3, 3, 2, 3, 2],
} as const;

export async function loadCourseCatalog() {
  const module = await import("@/data/course-vocabulary.json");
  return module.default as CourseCatalog;
}

export async function loadCourseWeek(week: number) {
  const catalog = await loadCourseCatalog();
  return catalog.entries.filter((entry) => entry.week === week);
}
