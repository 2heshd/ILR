import { courseTopicFor } from "./course-topics.ts";
import { newsTopicFor, type NewsTopic } from "./news-topics.ts";

export type PracticeSource = "selected" | "topic";

export const SELECTED_PRACTICE_LIMIT = 80;
export const TOPIC_PRACTICE_LIMIT = 120;

type SelectedWord = {
  displayForm: string;
  definition?: string;
  reviews?: number;
  correct?: number;
};

type CourseWord = { fa: string; en: string };
type NewsWord = { displayForm: string; definition?: string };
export type PracticeBankEntry = { word: string; meaning: string };

const BROAD_COURSE_TOPICS: Record<string, string[]> = {
  "Daily life": ["Family & relationships", "Home & chores", "Routines & time", "Clothing & appearance", "Sports & recreation", "Arts & celebrations"],
  "Travel & transport": ["Airports & flights", "Roads & public transport", "Hotels & tourism", "Borders & immigration"],
  "Food & shopping": ["Restaurants & ordering", "Ingredients & cooking", "Stores & prices"],
  Education: ["School & classrooms", "University & exams", "Language & reading"],
  Health: ["Doctors & hospitals", "Symptoms & illness", "Medicine & treatment", "Body & fitness"],
  "Work & economy": ["Jobs & careers", "Offices & meetings", "Banking & payments", "Trade & business", "Inflation & budgets"],
  "Government & society": ["Elections & politics", "Public services", "Diplomacy & international relations", "Courts & rights", "Police & crime", "Military & conflict"],
  "Nature & weather": ["Weather & seasons", "Animals & landscapes", "Climate & energy"],
};

const NEWS_TOPIC_FOR_PRACTICE: Record<string, NewsTopic> = {
  "Elections & politics": "Politics & government",
  "Public services": "Politics & government",
  "Diplomacy & international relations": "Politics & government",
  "Military & conflict": "Security & conflict",
  "Police & crime": "Security & conflict",
  "Banking & payments": "Economy & business",
  "Trade & business": "Economy & business",
  "Inflation & budgets": "Economy & business",
  "Jobs & careers": "Economy & business",
  "Courts & rights": "Law & rights",
  "Doctors & hospitals": "Health & science",
  "Symptoms & illness": "Health & science",
  "Medicine & treatment": "Health & science",
  "Computers & internet": "Health & science",
  "School & classrooms": "Society & culture",
  "University & exams": "Society & culture",
  "Family & relationships": "Society & culture",
  "Arts & celebrations": "Society & culture",
  "Sports & recreation": "Society & culture",
  "Weather & seasons": "Environment",
  "Animals & landscapes": "Environment",
  "Climate & energy": "Environment",
  "News & communication": "Media & communication",
};

function courseTopicMatches(topic: string, meaning: string) {
  const assigned = courseTopicFor(meaning);
  return assigned === topic || (BROAD_COURSE_TOPICS[topic] ?? []).includes(assigned);
}

function newsTopicMatches(topic: string, entry: NewsWord) {
  const direct = NEWS_TOPIC_FOR_PRACTICE[topic];
  const broad = BROAD_COURSE_TOPICS[topic] ?? [];
  const accepted = new Set([direct, ...broad.map((child) => NEWS_TOPIC_FOR_PRACTICE[child])].filter(Boolean));
  return accepted.has(newsTopicFor(entry));
}

function key(value: string) {
  return value.normalize("NFKC").replace(/[\u064b-\u065f\u0670\u200c\s]/gu, "").replace(/[يى]/gu, "ی").replace(/ك/gu, "ک");
}

function unique(entries: PracticeBankEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const normalized = key(entry.word);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/** Keep a large plan usable while prioritizing words with the least recall evidence. */
export function focusedSelectedPracticeWords(words: SelectedWord[], limit = SELECTED_PRACTICE_LIMIT) {
  return unique([...words]
    .sort((left, right) => {
      const leftRecall = left.reviews ? (left.correct ?? 0) / left.reviews : -1;
      const rightRecall = right.reviews ? (right.correct ?? 0) / right.reviews : -1;
      return leftRecall - rightRecall;
    })
    .map((word) => ({ word: word.displayForm, meaning: word.definition ?? "" })))
    .slice(0, limit);
}

/** Build a topic reference bank from both Cursos catalogs; never invent entries. */
export function topicPracticeWords(topic: string, course: CourseWord[], news: NewsWord[], limit = TOPIC_PRACTICE_LIMIT) {
  const courseMatches = course
    .filter((entry) => courseTopicMatches(topic, entry.en))
    .map((entry) => ({ word: entry.fa, meaning: entry.en }));
  const newsMatches = news
    .filter((entry) => newsTopicMatches(topic, entry))
    .map((entry) => ({ word: entry.displayForm, meaning: entry.definition ?? "" }));
  const interleaved: PracticeBankEntry[] = [];
  for (let index = 0; index < Math.max(courseMatches.length, newsMatches.length); index += 1) {
    if (courseMatches[index]) interleaved.push(courseMatches[index]);
    if (newsMatches[index]) interleaved.push(newsMatches[index]);
  }
  return unique(interleaved).slice(0, limit);
}
