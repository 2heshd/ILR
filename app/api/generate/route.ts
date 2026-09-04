import OpenAI from "openai";
import { NextResponse } from "next/server";
import { openAiErrorResponse } from "@/lib/openai-error";
import { unselectedContentWords } from "@/lib/practice-vocabulary";

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

const practiceResponseFormat = {
  type: "json_schema" as const,
  name: "persian_practice_item",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "textFa", "topic", "register", "knownWordsUsed", "newWordsIntroduced", "questions"],
    properties: {
      title: { type: "string" },
      textFa: { type: "string" },
      topic: { type: "string" },
      register: { type: "string" },
      knownWordsUsed: { type: "array", items: { type: "string" } },
      newWordsIntroduced: { type: "array", maxItems: 0, items: { type: "string" } },
      questions: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "type", "referenceAnswer"],
          properties: {
            question: { type: "string" },
            type: { type: "string", enum: ["main_idea", "detail", "inference", "discourse"] },
            referenceAnswer: { type: "string" },
          },
        },
      },
    },
  },
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
  let selectedVocabulary: string[] = [];
  if (body.kind === "define_words") {
    prompt = `Return JSON only. Define and romanize these Persian vocabulary items for a serious learner: ${(body.words ?? []).join(", ")}. Preserve the exact Persian display form. Give the most useful concise English meaning in context; for verbs use an infinitive beginning with "to". Romanization should be readable and consistent.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"..."}]}`;
  } else if (body.kind === "advanced_words") {
    prompt = `You are building a 35-week Persian course for an advanced government linguist. Return JSON only.\n\nWeek: ${body.weekNumber ?? 1}\nAlready learned terms (never repeat these): ${(body.existing ?? []).join(", ")}\n\nChoose EXACTLY 5 high-value Persian lexical items appropriate for eventual ILR 3-4 reading/listening. Rotate among government, politics, economics, diplomacy, law, security, policy, international relations, and formal media discourse. Prefer reusable formal vocabulary, collocations, and institutional terms rather than obscure trivia. Do not choose trivial morphological duplicates of existing items.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"...","topic":"..."}]}`;
  } else {
    const mode = body.kind === "reading" ? "reading" : "listening";
    const level = Math.max(1, Math.min(4, body.targetIlr ?? 1));
    const transfer = body.practiceMode === "transfer";
    selectedVocabulary = [...new Set((body.targetWords ?? []).map((word) => word.trim()).filter(Boolean))];
    if (!selectedVocabulary.length) {
      return NextResponse.json({ error: "Choose vocabulary before generating practice." }, { status: 400 });
    }
    if(selectedVocabulary.length>250)return NextResponse.json({error:"Choose at most 250 words for one practice plan."},{status:400});
    const sentenceCount = selectedVocabulary.length < 8
      ? "2-3"
      : selectedVocabulary.length < 20
        ? "3-4"
        : level === 1 ? "5-6" : level === 2 ? "6-8" : level === 3 ? "8-10" : "9-11";
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
- in formal prose, never omit the copula from a nominal sentence: write forms such as مهم است or مهم بود, not a fragment such as مهم
- check semantic roles and Persian collocations: use every selected verb with a plausible subject and object; a report may show an increase, while exports increase or have an increase rather than "show" one
- do not end a sentence with an isolated adjective, noun, or prepositional phrase unless it has the required Persian verb or copula
- do not introduce, target, or list any unselected vocabulary; newWordsIntroduced must be []
- ${transfer ? "do not repeat a memorized or previously supplied passage; freshness must come from the situation and syntax, not new vocabulary" : "use as many selected words as fit naturally, but never force awkward repetition merely to increase coverage"}
- prefer a shorter, clear, idiomatic passage over a longer passage with unnatural combinations of the selected words
- use familiar daily-life situations at Level 1 and progressively use formal news, government, economics, policy, diplomacy, security, or social situations at higher levels, but never add vocabulary outside the selected bank
- include discourse relations and inference opportunities appropriate to the selected level
- avoid English inside the Persian passage
- list only selected bank words actually used, using their original dictionary forms from the bank
- produce 5 comprehension questions in ENGLISH: one main idea, two detail, one inference, one discourse/author-intent
- every question must name a participant, event, decision, action, contrast, or consequence from THIS passage; never ask generic questions like "What is the main idea?" or "What can be inferred?"
- detail questions must ask different concrete facts (who did what, where, when, why, sequence, quantity, or consequence); avoid asking for facts not stated
- inference questions must require combining two stated clues, not outside knowledge; identify both clues in the reference answer
- discourse questions must name the actual contrast, causal link, or intention being tested; reference answers must cite the supporting Persian clause
- when the selected vocabulary cannot support five distinct answerable questions, return a shorter passage with genuinely distinct questions rather than fabricating missing events
- for each question include a concise hidden reference answer used only for grading

Return this exact shape:
{"title":"English title","textFa":"Persian paragraph","topic":"...","register":"...","knownWordsUsed":["..."],"newWordsIntroduced":[],"questions":[{"question":"...","type":"main_idea|detail|inference|discourse","referenceAnswer":"..."}]}`;
  }

  try {
    const isPractice = body.kind === "reading" || body.kind === "listening";
    const generate = (input: string) => client.responses.create({
        model,
        store: false,
        input,
        max_output_tokens: isPractice ? 3200 : 2200,
        reasoning: { effort: isPractice ? "low" : "none" },
        text: { format: isPractice ? practiceResponseFormat : { type: "json_object" }, verbosity: "low" },
      });
    let response = await generate(prompt);
    let data = parseJson(response.output_text);

    if (isPractice) {
      let violations = unselectedContentWords(String(data.textFa ?? ""), selectedVocabulary);
      if (violations.length) {
        response = await generate(`${prompt}\n\nREPAIR THE PREVIOUS DRAFT. It used these unselected Persian content words or verb forms: ${violations.join(", ")}. Rewrite the passage and questions without them. Use only the selected dictionary forms and their natural inflections. Previous draft:\n${JSON.stringify(data)}`);
        data = parseJson(response.output_text);
        violations = unselectedContentWords(String(data.textFa ?? ""), selectedVocabulary);
      }
      if (violations.length) {
        const suggestions = violations.slice(0, 8).join("، ");
        return NextResponse.json({
          error: `The selected words could not form a natural closed-vocabulary passage. Add these words to your bank or choose more vocabulary: ${suggestions}.`,
          suggestedWords: violations.slice(0, 8),
        }, { status: 422 });
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "Generation failed.");
  }
}
