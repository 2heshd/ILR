"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { StudyState } from "./types";

let singleton: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  singleton = url && key ? createClient(url, key) : null;
  return singleton;
}

export async function loadCloudState(client: SupabaseClient, user: User): Promise<StudyState | null> {
  const { data, error } = await client
    .from("study_snapshots")
    .select("state")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.state as StudyState | undefined) ?? null;
}

export async function loadUsername(client: SupabaseClient, user: User): Promise<string | null> {
  const { data, error } = await client
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.username === "string" ? data.username : null;
}

function mergeById<T extends { id: string }>(cloud: T[], local: T[]) {
  const merged = new Map(cloud.map((item) => [item.id, item]));
  local.forEach((item) => merged.set(item.id, { ...merged.get(item.id), ...item }));
  return [...merged.values()];
}

export function mergeStudyStates(cloud: StudyState, local: StudyState): StudyState {
  return {
    ...cloud,
    weekNumber: Math.max(cloud.weekNumber, local.weekNumber),
    currentIlr: local.currentIlr ?? cloud.currentIlr,
    skillLevels: { ...cloud.skillLevels, ...local.skillLevels },
    course: {
      ...cloud.course,
      ...local.course,
      importedWeeks: [...new Set([...(cloud.course?.importedWeeks ?? []), ...(local.course?.importedWeeks ?? [])])].sort((a, b) => a - b),
    },
    anki: { ...cloud.anki, ...local.anki },
    words: mergeById(cloud.words ?? [], local.words ?? []),
    reviews: mergeById(cloud.reviews ?? [], local.reviews ?? []),
    passages: mergeById(cloud.passages ?? [], local.passages ?? []),
    passageAttempts: mergeById(cloud.passageAttempts ?? [], local.passageAttempts ?? []),
    listeningItems: mergeById(cloud.listeningItems ?? [], local.listeningItems ?? []),
    listeningAttempts: mergeById(cloud.listeningAttempts ?? [], local.listeningAttempts ?? []),
    speakingPrompts: mergeById(cloud.speakingPrompts ?? [], local.speakingPrompts ?? []),
    speakingAttempts: mergeById(cloud.speakingAttempts ?? [], local.speakingAttempts ?? []),
  };
}

export async function updateUsername(client: SupabaseClient, user: User, username: string) {
  const { error: profileError } = await client.from("profiles").upsert({ id: user.id, username, updated_at: new Date().toISOString() });
  if (profileError) throw profileError;
  const { error: metadataError } = await client.auth.updateUser({ data: { username } });
  if (metadataError) throw metadataError;
}

export async function saveCloudState(client: SupabaseClient, user: User, state: StudyState) {
  const { error } = await client.from("study_snapshots").upsert({
    user_id: user.id,
    state,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function appendCloudReview(
  client: SupabaseClient,
  user: User,
  review: StudyState["reviews"][number],
) {
  const { error } = await client.from("review_events").insert({
    id: review.id,
    user_id: user.id,
    lexical_item_id: review.lexicalItemId,
    reviewed_at: review.reviewedAt,
    modality: review.modality,
    rating: review.rating,
    correct: review.correct,
    response_ms: review.responseMs,
    scheduler_state_before: review.schedulerBefore ?? null,
    scheduler_state_after: review.schedulerAfter ?? null,
  });
  if (error && error.code !== "23505") throw error;
}
