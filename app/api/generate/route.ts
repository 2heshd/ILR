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
  // Practice generation is a tightly constrained JSON task. A mini model keeps
  // the lab responsive while OPENAI_MODEL still allows a deployment override.
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

  let prompt = "";
  if (body.kind === "define_words") {
    prompt = `Return JSON only. Define and romanize these Persian vocabulary items for a serious learner: ${(body.words ?? []).join(", ")}. Preserve the exact Persian display form. Give the most useful concise English meaning in context; for verbs use an infinitive beginning with "to". Romanization should be readable and consistent.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"..."}]}`;
  } else if (body.kind === "advanced_words") {
    prompt = `You are building a 35-week Persian course for an advanced government linguist. Return JSON only.\n\nWeek: ${body.weekNumber ?? 1}\nAlready learned terms (never repeat these): ${(body.existing ?? []).join(", ")}\n\nChoose EXACTLY 5 high-value Persian lexical items appropriate for eventual ILR 3-4 reading/listening. Rotate among government, politics, economics, diplomacy, law, security, policy, international relations, and formal media discourse. Prefer reusable formal vocabulary, collocations, and institutional terms rather than obscure trivia. Do not choose trivial morphological duplicates of existing items.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"...","topic":"..."}]}`;
  } else {
    const mode = body.kind === "reading" ? "reading" : "listening";
    const level = Math.max(1, Math.min(4, body.targetIlr ?? 1));
    const sentenceCount = level === 1 ? "5-6" : level === 2 ? "6-8" : level === 3 ? "8-10" : "9-11";
    const transfer = body.practiceMode === "transfer";
    const selectedVocabulary = [...new Set((body.targetWords ?? []).map((word) => word.trim()).filter(Boolean))];
    if (!selectedVocabulary.length) {
      return NextResponse.json({ error: "Choose vocabulary before generating practice." }, { status: 400 });
    }
    prompt = `Create one Persian ${mode} practice item at the learner's selected proficiency level. Return JSON only.

Target ILR difficulty: ${body.targetIlr ?? 1}
Learner-selected vocabulary bank: ${selectedVocabulary.join(", ")}

Requirements:
- natural educated Iranian Persian suitable for the selected ILR level
- ${sentenceCount} natural connected sentences forming ONE coherent passage, not standalone example sentences
- practice mode: ${transfer ? "FRESH TRANSFER — create a new situation and new sentence structure without introducing unselected vocabulary" : "CONTROLLED COVERAGE — reinforce the selected bank in coherent context"}
- use ONLY vocabulary selected in the learner bank for lexical/content words; ordinary Persian grammar words, pronouns, prepositions, conjunctions, and inflected forms of selected words are allowed
- treat bank entries as dictionary forms, not text that must be copied literally: conjugate simple and compound verbs naturally for their subject, tense, and aspect
- never use an infinitive ending in کردن, شدن, دادن, گرفتن, داشتن, or بودن as a finite sentence predicate; use the appropriate Persian finite form instead
- silently revise the Persian before returning it so every sentence is idiomatic and grammatically complete; selected-only vocabulary must never produce broken Persian
- do not introduce, target, or list any unselected vocabulary; newWordsIntroduced must be []
- ${transfer ? "do not repeat a memorized or previously supplied passage; freshness must come from the situation and syntax, not new vocabulary" : "use selected words naturally and repeatedly"}
- use familiar daily-life situations at Level 1 and progressively use formal news, government, economics, policy, diplomacy, security, or social situations at higher levels, but never add vocabulary outside the selected bank
- include discourse relations and inference opportunities appropriate to the selected level
- avoid English inside the Persian passage
- list only selected bank words actually used, using their original dictionary forms from the bank
- produce 5 comprehension questions in ENGLISH: one main idea, two detail, one inference, one discourse/author-intent
- for each question include a concise hidden reference answer used only for grading

Return this exact shape:
{"title":"English title","textFa":"Persian paragraph","topic":"...","register":"...","knownWordsUsed":["..."],"newWordsIntroduced":[],"questions":[{"question":"...","type":"main_idea|detail|inference|discourse","referenceAnswer":"..."}]}`;
  }

  try {
    const response = await client.responses.create({
      model,
      store: false,
      input: prompt,
      max_output_tokens: 2200,
      reasoning: { effort: body.kind === "reading" || body.kind === "listening" ? "low" : "none" },
      text: { verbosity: "low" },
    });
    return NextResponse.json(parseJson(response.output_text));
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "Generation failed.");
  }
}
