import OpenAI from "openai";
import { NextResponse } from "next/server";
import { openAiErrorResponse } from "@/lib/openai-error";

export const runtime = "nodejs";

type GenerateBody = {
  kind: "advanced_words" | "define_words" | "reading" | "listening";
  words?: string[];
  weekNumber?: number;
  existing?: string[];
  targetWords?: string[];
  targetIlr?: number;
  practiceMode?: "controlled" | "transfer";
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
    prompt = `You are building a 35-week Persian course for an advanced government linguist. Return JSON only.\n\nWeek: ${body.weekNumber ?? 1}\nAlready learned terms (never repeat these): ${(body.existing ?? []).join(", ")}\n\nChoose EXACTLY 5 high-value Persian lexical items appropriate for eventual ILR 3-4 reading/listening. Rotate among government, politics, economics, diplomacy, law, security, policy, international relations, and formal media discourse. Prefer reusable formal vocabulary, collocations, and institutional terms rather than obscure trivia. Do not choose trivial morphological duplicates of existing items.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"...","topic":"..."}]}`;
  } else {
    const mode = body.kind === "reading" ? "reading" : "listening";
    const sentenceCount = body.kind === "reading" ? "12-16" : "10-14";
    const transfer = body.practiceMode === "transfer";
    prompt = `Create one Persian ${mode} practice item at the learner's selected proficiency level. Return JSON only.\n\nTarget ILR difficulty: ${body.targetIlr ?? 1}\nLearner vocabulary inventory, including words introduced today: ${(body.targetWords ?? []).join(", ")}\n\nRequirements:\n- natural educated Iranian Persian suitable for the selected ILR level\n- ${sentenceCount} natural connected sentences forming ONE coherent passage, not standalone example sentences\n- practice mode: ${transfer ? "FRESH TRANSFER — do not force vocabulary coverage; use unfamiliar but level-appropriate language and test general proficiency" : "CONTROLLED COVERAGE — reinforce the inventory in coherent context"}\n- ${transfer ? "use the inventory only when natural; prioritize a genuinely unseen passage and do not list fabricated inventory matches" : "approximately 80-90% of distinct CONTENT vocabulary must come from the inventory; reserve 10-20% for useful unfamiliar language"}\n- ${transfer ? "do not repeat a memorized or previously supplied passage" : "use inventory words naturally and repeatedly, including newly introduced words"}\n- use familiar daily-life language at Level 1 and progressively introduce formal news, government, economics, policy, diplomacy, security, or social themes at higher levels\n- include discourse relations and inference opportunities appropriate to the selected level\n- avoid English inside the Persian passage\n- list the inventory words actually used and the unfamiliar content words introduced\n- produce 5 comprehension questions in ENGLISH: one main idea, two detail, one inference, one discourse/author-intent\n- for each question include a concise hidden reference answer used only for grading\n\nReturn this exact shape:\n{"title":"English title","textFa":"Persian paragraph","topic":"...","register":"...","knownWordsUsed":["..."],"newWordsIntroduced":["..."],"questions":[{"question":"...","type":"main_idea|detail|inference|discourse","referenceAnswer":"..."}]}`;
  }

  try {
    const response = await client.responses.create({ model, store: false, input: prompt });
    return NextResponse.json(parseJson(response.output_text));
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "Generation failed.");
  }
}
