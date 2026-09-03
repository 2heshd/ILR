"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { LexicalItem, StudyState } from "./types";

let singleton: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  singleton = url && key ? createClient(url, key, {
    auth: {
      // Make the intended account behavior explicit across desktop browsers,
      // mobile Safari, and an installed home-screen web app.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }) : null;
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

type PlatformVocabularyRow = {
  id: string;
  display_form: string;
  normalized_form: string;
  definition: string | null;
  romanization: string | null;
  source_platform: string;
  source_context: string | null;
  source_week: number;
  created_at: string;
};

function missingPlatformTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function rowToLexicalItem(row: PlatformVocabularyRow): LexicalItem {
  return {
    id: row.id,
    displayForm: row.display_form,
    normalizedForm: row.normalized_form,
    definition: row.definition ?? undefined,
    romanization: row.romanization ?? undefined,
    sourceType: "user",
    sourceWeek: Math.max(1, Number(row.source_week) || 1),
    tier: "B",
    knowledgeState: "learning",
    topic: row.source_context || `${row.source_platform || "shared"} vocabulary`,
    introducedAt: row.created_at,
    reviews: 0,
    correct: 0,
    lapses: 0,
    dueAt: row.created_at,
  };
}

export async function loadPlatformVocabulary(client: SupabaseClient, user: User): Promise<LexicalItem[]> {
  const { data, error } = await client
    .from("platform_vocabulary")
    .select("id,display_form,normalized_form,definition,romanization,source_platform,source_context,source_week,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (missingPlatformTable(error)) return [];
  if (error) throw error;
  return ((data ?? []) as PlatformVocabularyRow[]).map(rowToLexicalItem);
}

export function mergePlatformVocabulary(state: StudyState, sharedWords: LexicalItem[]): StudyState {
  if (!sharedWords.length) return state;
  const words = [...state.words];
  const indexes = new Map(words.map((word, index) => [word.normalizedForm, index]));
  let changed = false;
  for (const shared of sharedWords) {
    const index = indexes.get(shared.normalizedForm);
    if (index === undefined) {
      indexes.set(shared.normalizedForm, words.length);
      words.push(shared);
      changed = true;
    } else if (words[index].sourceType === "user") {
      const current = words[index];
      const merged = {
        ...shared,
        ...current,
        displayForm: shared.displayForm,
        normalizedForm: shared.normalizedForm,
        definition: shared.definition || current.definition,
        romanization: shared.romanization || current.romanization,
        topic: shared.topic || current.topic,
      };
      if (merged.displayForm !== current.displayForm || merged.definition !== current.definition || merged.romanization !== current.romanization || merged.topic !== current.topic) {
        words[index] = merged;
        changed = true;
      }
    }
  }
  return changed ? { ...state, words } : state;
}

export async function syncPlatformVocabulary(client: SupabaseClient, user: User, words: LexicalItem[]) {
  const rows = words.filter((word) => word.sourceType === "user").map((word) => ({
    user_id: user.id,
    display_form: word.displayForm,
    normalized_form: word.normalizedForm,
    definition: word.definition ?? null,
    romanization: word.romanization ?? null,
    source_platform: word.topic === "Asl derivation" ? "asl" : "cursos",
    source_context: word.topic ?? "Personal vocabulary",
    source_week: Math.max(1, Number(word.sourceWeek) || 1),
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await client.from("platform_vocabulary").upsert(rows, { onConflict: "user_id,normalized_form" });
  if (missingPlatformTable(error)) return;
  if (error) throw error;
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
