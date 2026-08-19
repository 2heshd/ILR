import OpenAI from "openai";
import { NextResponse } from "next/server";
import { openAiErrorResponse } from "@/lib/openai-error";
import type { SpeakingGrade } from "@/lib/types";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

function cleanJson(text: string) {
  return text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

function score(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 5) : [];
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Speaking feedback is not configured yet." }, { status: 503 });
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.size) {
    return NextResponse.json({ error: "Record a response before requesting feedback." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too large. Keep the response under four minutes." }, { status: 413 });
  }

  const level = Math.max(1, Math.min(4, Number(form.get("ilrTarget")) || 1));
  const prompt = String(form.get("prompt") || "").slice(0, 2000);
  const durationMs = Math.max(0, Number(form.get("durationMs")) || 0);
  const targetWords = String(form.get("targetWords") || "[]").slice(0, 4000);
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const instructions = `You are a careful Persian speaking coach. Evaluate the attached learner recording against the task and selected proficiency level.

Task: ${prompt}
Selected level: ${level}
Recording duration: ${Math.round(durationMs / 1000)} seconds
Optional course vocabulary: ${targetWords}

Level expectations:
- Level 1: understandable simple sentences about familiar needs, people, places, and routine events.
- Level 2: connected paragraph-length narration and description across major time frames.
- Level 3: sustained professional or abstract discussion with supported opinions and effective organization.
- Level 4: precise, nuanced, extended discourse with flexible register and sophisticated argument.

Listen to the actual audio. Assess task completion, organization, grammar, vocabulary, fluency, pronunciation clarity, rhythm/pacing, and tone/delivery. Tone means whether intonation, emphasis, and delivery fit the communicative purpose—not personality. Do not penalize a non-native accent by itself. Do not claim clinical or phonetic precision. If the recording is too short, silent, or unclear, say so directly and score only what can be supported.

Return JSON only in exactly this shape:
{"transcript":"Persian transcript","taskCompletion":0,"organization":0,"grammaticalControl":0,"vocabularyControl":0,"fluencyEstimate":0,"pronunciationClarity":0,"rhythmPacing":0,"toneDelivery":0,"overallScore":0,"strengths":["..."],"priorities":["..."],"feedback":"Concise, specific coaching feedback in English."}`;

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_AUDIO_MODEL || "gpt-audio-1.5",
      modalities: ["text"],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: instructions },
          { type: "input_audio", input_audio: { data, format: "wav" } },
        ],
      }],
    });
    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("The audio model returned no feedback.");
    const raw = JSON.parse(cleanJson(content)) as Record<string, unknown>;
    const result: SpeakingGrade = {
      transcript: String(raw.transcript || ""),
      taskCompletion: score(raw.taskCompletion),
      organization: score(raw.organization),
      grammaticalControl: score(raw.grammaticalControl),
      vocabularyControl: score(raw.vocabularyControl),
      fluencyEstimate: score(raw.fluencyEstimate),
      pronunciationClarity: score(raw.pronunciationClarity),
      rhythmPacing: score(raw.rhythmPacing),
      toneDelivery: score(raw.toneDelivery),
      overallScore: score(raw.overallScore),
      strengths: strings(raw.strengths),
      priorities: strings(raw.priorities),
      feedback: String(raw.feedback || "Recording reviewed."),
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "Speaking feedback failed.");
  }
}
