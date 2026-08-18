import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import type { ReviewRating, SerializedFsrsCard } from "./types";

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 3650,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["10m"],
  relearning_steps: ["10m"],
});

const RATING_MAP: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function serializeCard(card: Card): SerializedFsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps,
    state: card.state,
    lastReview: card.last_review?.toISOString(),
  };
}

export function deserializeCard(card: SerializedFsrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learningSteps,
    state: card.state as State,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

export function createSerializedCard(now = new Date()): SerializedFsrsCard {
  return serializeCard(createEmptyCard(now));
}

export function reviewFsrs(
  cardState: SerializedFsrsCard | undefined,
  rating: ReviewRating,
  now = new Date(),
) {
  const before = cardState ?? createSerializedCard(now);
  const result = scheduler.next(deserializeCard(before), now, RATING_MAP[rating]);
  const after = serializeCard(result.card);
  return { before, after };
}

export function getRetrievability(cardState: SerializedFsrsCard | undefined, now = new Date()) {
  if (!cardState || cardState.state === State.New) return 0;
  return scheduler.get_retrievability(deserializeCard(cardState), now, false);
}

export function autoRatingForKnown(responseMs: number): ReviewRating {
  if (responseMs <= 3_000) return "easy";
  if (responseMs <= 8_000) return "good";
  return "hard";
}
