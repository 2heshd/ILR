import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateBody = {
  kind: "advanced_words" | "define_words" | "reading" | "listening";
  words?: string[];
  weekNumber?: number;
  existing?: string[];
  targetWords?: string[];
  targetIlr?: number;
};

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as GenerateBody;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5.6";

  let prompt = "";
  if (body.kind === "define_words") {
    prompt = `Return JSON only. Define and romanize these Persian vocabulary items for a serious learner: ${(body.words ?? []).join(", ")}. Preserve the exact Persian display form. Give the most useful concise English meaning in context; for verbs use an infinitive beginning with "to". Romanization should be readable and consistent.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"..."}]}`;
  } else if (body.kind === "advanced_words") {
    prompt = `You are building a 36-week Persian course for an advanced government linguist. Return JSON only.\n\nWeek: ${body.weekNumber ?? 1}\nAlready learned terms (never repeat these): ${(body.existing ?? []).join(", ")}\n\nChoose EXACTLY 5 high-value Persian lexical items appropriate for eventual ILR 3-4 reading/listening. Rotate among government, politics, economics, diplomacy, law, security, policy, international relations, and formal media discourse. Prefer reusable formal vocabulary, collocations, and institutional terms rather than obscure trivia. Do not choose trivial morphological duplicates of existing items.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"...","topic":"..."}]}`;
  } else {
    const mode = body.kind === "reading" ? "reading" : "listening";
    const sentenceCount = body.kind === "reading" ? "12-16" : "10-14";
    prompt = `Create one Persian ${mode} practice item for a learner targeting ILR Reading 4 / Listening 3+ / Speaking 2. Return JSON only.\n\nTarget ILR difficulty: ${body.targetIlr ?? 2}\nTarget/recycled words to use naturally where possible: ${(body.targetWords ?? []).join(", ")}\n\nRequirements:\n- formal educated Iranian Persian suitable for news, government, economics, policy, diplomacy, security, or society\n- ${sentenceCount} natural connected sentences forming ONE coherent passage, not standalone example sentences\n- use a mix of current and previously learned target words, but never force unnatural density\n- include discourse relations, inference opportunities, and at least one sentence whose meaning depends on context\n- avoid English inside the Persian passage\n- produce 5 comprehension questions in ENGLISH: one main idea, two detail, one inference, one discourse/author-intent\n\nReturn this exact shape:\n{"title":"English title","textFa":"Persian paragraph","topic":"...","register":"formal-news","questions":[{"question":"...","type":"main_idea|detail|inference|discourse"}]}`;
  }

  try {
    const response = await client.responses.create({ model, store: false, input: prompt });
    return NextResponse.json(parseJson(response.output_text));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Generation failed." }, { status: 500 });
  }
}
