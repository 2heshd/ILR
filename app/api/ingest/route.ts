import OpenAI from "openai";
import { NextResponse } from "next/server";
import { openAiErrorResponse } from "@/lib/openai-error";

export const runtime = "nodejs";
const MAX_EXCERPT_CHARS = 1800;

type Body = {
  modality?: "reading" | "listening";
  title?: string;
  publisher?: string;
  sourceUrl?: string;
  sourceType?: "authentic" | "adapted";
  publishedAt?: string;
  textFa?: string;
  knownWords?: string[];
  topic?: string;
  genre?: string;
  register?: string;
  ilrEstimate?: number;
};

function parseJson(text: string) {
  return JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  if (!body.textFa || body.textFa.length > MAX_EXCERPT_CHARS || !body.title || !body.publisher || !body.sourceUrl) {
    return NextResponse.json({ error: "Incomplete source or excerpt exceeds the copyright-safe storage limit." }, { status: 400 });
  }
  try {
    const sourceUrl = new URL(body.sourceUrl);
    if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ error: "Source URL must be a valid http(s) URL." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const prompt = `Analyze this user-supplied short Persian source excerpt for an advanced language-learning lab. Do not reproduce or extend the copyrighted source; analyze only the supplied excerpt. Return JSON only.

Modality: ${body.modality ?? "reading"}
Provenance: ${body.title} — ${body.publisher} (${body.publishedAt || "date unknown"})
Source status: ${body.sourceType ?? "authentic"}
User hints: topic=${body.topic || "none"}; genre=${body.genre || "none"}; register=${body.register || "none"}; ILR=${body.ilrEstimate ?? "none"}
Learner vocabulary: ${(body.knownWords ?? []).slice(0, 300).join(", ")}
Persian excerpt:
${body.textFa}

Classify topic, genre, and register with concise stable labels. Estimate ILR reading/listening difficulty from 0-5 in quarter steps. Extract up to 15 high-value Persian target words or multiword terms that actually occur in the excerpt, prioritizing learner vocabulary when present. Create exactly five English comprehension questions: main idea, two detail, inference, and discourse/author intent. Include a concise reference answer grounded only in the excerpt.

Return exactly:
{"topic":"...","genre":"...","register":"...","ilrEstimate":2.5,"targetWords":["..."],"questions":[{"question":"...","type":"main_idea|detail|inference|discourse","referenceAnswer":"..."}]}`;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({ model: process.env.OPENAI_MODEL || "gpt-5.6", store: false, input: prompt });
    return NextResponse.json(parseJson(response.output_text));
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "Source analysis failed.");
  }
}
