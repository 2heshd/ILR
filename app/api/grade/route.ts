import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Question = {
  question: string;
  type: "detail" | "inference" | "discourse" | "main_idea";
  referenceAnswer?: string;
};

type GradeBody =
  | {
      kind: "reading" | "listening";
      sourceText: string;
      questions: Question[];
      answers: string[];
      ilrEstimate?: number;
      transcriptRevealed?: boolean;
      listensCount?: number;
    }
  | {
      kind: "speaking";
      prompt: string;
      transcript: string;
      ilrTarget?: number;
      targetWords?: string[];
      durationMs?: number;
    };

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function clamp(n: unknown) {
  const value = Number(n);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as GradeBody;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5.6";

  try {
    if (body.kind === "speaking") {
      if (!body.transcript.trim()) {
        return NextResponse.json({ error: "A transcript is required for speaking grading." }, { status: 400 });
      }

      const prompt = `You are grading a Persian speaking practice response for an ILR-oriented learner. Return JSON only.

Target: ILR speaking ${body.ilrTarget ?? 2}
Task: ${body.prompt}
Target vocabulary when relevant: ${(body.targetWords ?? []).join(", ")}
Approximate response duration: ${Math.round((body.durationMs ?? 0) / 1000)} seconds
Learner transcript in Persian:
${body.transcript}

Grade only what can reasonably be inferred from the transcript. Do NOT claim to assess pronunciation or actual acoustic intelligibility. "fluencyEstimate" may infer continuity/organization from transcript length, clause structure, repairs/fillers if represented, and task completion, but state limitations in feedback when relevant.

For ILR 2, prioritize ability to narrate/describe in major time frames, handle routine social/work topics, connect sentences into paragraph-length discourse, and communicate despite errors. Score 0-100.

Return exactly:
{"taskCompletion":0,"organization":0,"grammaticalControl":0,"vocabularyControl":0,"fluencyEstimate":0,"overallScore":0,"strengths":["..."],"priorities":["..."],"feedback":"..."}`;

      const response = await client.responses.create({ model, store: false, input: prompt });
      const result = parseJson(response.output_text);
      return NextResponse.json({
        taskCompletion: clamp(result.taskCompletion),
        organization: clamp(result.organization),
        grammaticalControl: clamp(result.grammaticalControl),
        vocabularyControl: clamp(result.vocabularyControl),
        fluencyEstimate: clamp(result.fluencyEstimate),
        overallScore: clamp(result.overallScore),
        strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 4) : [],
        priorities: Array.isArray(result.priorities) ? result.priorities.slice(0, 4) : [],
        feedback: String(result.feedback ?? ""),
      });
    }

    const questions = body.questions.map((question, index) => ({
      index,
      ...question,
      learnerAnswer: body.answers[index] ?? "",
    }));

    const prompt = `You are grading ${body.kind} comprehension for a Persian learner. Return JSON only.

Approximate source difficulty: ILR ${body.ilrEstimate ?? "unknown"}
${body.kind === "listening" ? `Listens: ${body.listensCount ?? 1}; transcript revealed before submission: ${Boolean(body.transcriptRevealed)}` : ""}

Persian source:
${body.sourceText}

Questions and learner answers:
${JSON.stringify(questions)}

Grade meaning, not wording. Accept concise paraphrases. Do not penalize English grammar. A blank, non-responsive, contradicted, or guessed answer should score low. For inference/discourse items, require the inference or relationship actually supported by the source. Score each 0-100 and provide one short corrective feedback sentence. Then calculate dimension scores using only relevant question types. Overall should reflect comprehension across the item, not a simple optimism-biased average.

Return exactly:
{"overallScore":0,"detailScore":0,"inferenceScore":0,"discourseScore":0,"mainIdeaScore":0,"answers":[{"questionIndex":0,"score":0,"feedback":"...","missedConcepts":["..."]}],"summary":"..."}`;

    const response = await client.responses.create({ model, store: false, input: prompt });
    const result = parseJson(response.output_text);
    return NextResponse.json({
      overallScore: clamp(result.overallScore),
      detailScore: clamp(result.detailScore),
      inferenceScore: clamp(result.inferenceScore),
      discourseScore: clamp(result.discourseScore),
      mainIdeaScore: clamp(result.mainIdeaScore),
      answers: Array.isArray(result.answers)
        ? result.answers.slice(0, body.questions.length).map((answer: Record<string, unknown>, index: number) => ({
            questionIndex: Number.isFinite(Number(answer.questionIndex)) ? Number(answer.questionIndex) : index,
            score: clamp(answer.score),
            feedback: String(answer.feedback ?? ""),
            missedConcepts: Array.isArray(answer.missedConcepts) ? answer.missedConcepts.slice(0, 4).map(String) : [],
          }))
        : [],
      summary: String(result.summary ?? ""),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Grading failed." }, { status: 500 });
  }
}
