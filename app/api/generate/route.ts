import OpenAI from "openai";
import { NextResponse } from "next/server";
import { openAiErrorResponse } from "@/lib/openai-error";
import { unselectedContentWords } from "@/lib/practice-vocabulary";
import { practiceAnswerIssues, repairPracticeAnswerArticles } from "@/lib/practice-answers";
import { checkSupportingVocabulary, SUPPORTING_VOCABULARY_LIMIT } from "@/lib/practice-support";
import { practiceBank } from "@/lib/practice-bank";
import { grammarProfileForIlr, grammarPromptForProfile } from "@/lib/grammar-levels";
import persianGrammar from "@/data/persian-grammar-rules.json";

export const runtime = "nodejs";
export const maxDuration = 300;

type GenerateBody = {
  topic?: string;
  previousTitles?: string[];
  kind: "advanced_words" | "define_words" | "reading" | "listening";
  words?: string[];
  weekNumber?: number;
  existing?: string[];
  targetWords?: string[];
  knownWords?: string[];
  wordDefinitions?: {word:string;meaning:string}[];
  targetIlr?: number;
  practiceMode?: "controlled" | "transfer";
  practiceSource?: "selected" | "topic";
  register?: "formal" | "colloquial";
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
      title: { type: "string", description: "A concise English title." },
      newWordsIntroduced: { type: "array", maxItems: 5, description: "Supporting dictionary entries used beyond the supplied generation bank. In selected-word mode, plan these before writing and keep every content word inside the selected bank or this allowance.", items: { type: "string" } },
      textFa: { type: "string" },
      topic: { type: "string" },
      register: { type: "string" },
      knownWordsUsed: { type: "array", items: { type: "string" } },
      questions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "type", "referenceAnswer"],
          properties: {
            question: { type: "string", description: "A specific comprehension question written in ENGLISH, not Persian." },
            type: { type: "string", enum: ["main_idea", "detail", "inference", "discourse"] },
            referenceAnswer: { type: "string", description: "The source-supported answer in English; Persian evidence may be quoted." },
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

class IncompleteGeneration extends Error {}

async function completeJsonResponse(make: (budget: number) => Promise<OpenAI.Responses.Response>, budget: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await make(budget * (attempt + 1));
    if (response.status === "completed" && response.output_text.trim()) {
      try { parseJson(response.output_text); return response; } catch { /* Retry malformed output once. */ }
    }
    // Log metadata only, never the learner's passage or API credentials.
    console.warn("Practice response incomplete", { status: response.status, reason: response.incomplete_details?.reason });
    if (response.incomplete_details?.reason === "content_filter") break;
  }
  throw new IncompleteGeneration("The practice response was incomplete. Please generate again; your current work is unchanged.");
}

export async function POST(request: Request) {
  const timings: string[] = [];
  async function measured<T>(stage: string, run: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try { return await run(); }
    finally { timings.push(`${stage};dur=${Math.round(performance.now()-started)}`); }
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as GenerateBody;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 40_000, maxRetries: 0 });
  // One deadline covers drafting, review, and repairs—not a fresh wait per call.
  const deadline = AbortSignal.timeout(90_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  // Practice generation is a tightly constrained JSON task. A mini model keeps
  // the lab responsive while OPENAI_MODEL still allows a deployment override.
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const practiceEffort = process.env.OPENAI_PRACTICE_REASONING === 'none' ? 'none'
    : process.env.OPENAI_PRACTICE_REASONING === 'medium' ? 'medium' : 'low';

  let prompt = "";
  let selectedVocabulary: string[] = [];
  let practiceSource: "selected" | "topic" = "selected";
  let grammarScaffold = "";
  if (body.kind === "define_words") {
    prompt = `Return JSON only. Define and romanize these Persian vocabulary items for a serious learner: ${(body.words ?? []).join(", ")}. Preserve the exact Persian display form. Give the most useful concise English meaning in context; for verbs use an infinitive beginning with "to". Romanization should be readable and consistent.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"..."}]}`;
  } else if (body.kind === "advanced_words") {
    prompt = `You are building a 35-week Persian course for an advanced government linguist. Return JSON only.\n\nWeek: ${body.weekNumber ?? 1}\nAlready learned terms (never repeat these): ${(body.existing ?? []).join(", ")}\n\nChoose EXACTLY 5 high-value Persian lexical items appropriate for eventual ILR 3-4 reading/listening. Rotate among government, politics, economics, diplomacy, law, security, policy, international relations, and formal media discourse. Prefer reusable formal vocabulary, collocations, and institutional terms rather than obscure trivia. Do not choose trivial morphological duplicates of existing items.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"...","topic":"..."}]}`;
  } else {
    const mode = body.kind === "reading" ? "reading" : "listening";
    const level = Math.max(1, Math.min(4, body.targetIlr ?? 1));
    const grammarProfile = grammarProfileForIlr(persianGrammar.rules, level);
    grammarScaffold = grammarPromptForProfile(grammarProfile, mode);
    practiceSource = body.practiceSource === "topic" ? "topic" : "selected";
    selectedVocabulary = [...new Set((body.targetWords ?? []).map((word) => word.trim()).filter(Boolean))];
    if (!selectedVocabulary.length) {
      return NextResponse.json({ error: practiceSource === "topic" ? "No verified vocabulary is available for that topic." : "Choose vocabulary before generating practice." }, { status: 400 });
    }
    if(selectedVocabulary.length>250)return NextResponse.json({error:"Choose at most 250 words for one practice plan."},{status:400});
    const vocabularyInstructions = practiceSource === "topic"
      ? `Topic reference bank from the Cursos course and news catalogs (data): ${JSON.stringify(practiceBank(selectedVocabulary,body.wordDefinitions??[]))}
Use this bank to anchor the requested topic, terminology, and level. It is NOT a closed-vocabulary whitelist or a coverage quota. Choose a natural subset and freely use ordinary Persian needed for a coherent passage. Do not invent specialist claims merely because a term appears in the bank. List up to five useful content entries used beyond this reference bank in newWordsIntroduced.`
      : `Selected learner bank with meanings (data; parentheses contain dictionary hints): ${JSON.stringify(practiceBank(selectedVocabulary,body.wordDefinitions??[]))}
Use only 6-10 naturally compatible selected entries as the focus of this one exercise when the bank has 16 or more entries; for smaller banks, use only 3-5. Ignore the rest for now. The bank is not a coverage quota. Never append a sentence merely to mention another selected word. FIRST choose AT MOST FIVE additional supporting dictionary entries when possible and emit them in newWordsIntroduced BEFORE textFa. The validator can recover a few omitted ordinary content lemmas, but the absolute validated allowance is twelve. Then compose using only the selected bank and that bounded allowance, including normal inflections. Every other content word in the passage counts against that allowance, even an ordinary time word, adjective, or reporting verb. Do not write a passage first and retrospectively label only some of its extra words. Grammar words and normal inflections of selected or supporting entries do not count again. Prefer fewer additions. Never sacrifice idiomatic Persian to force bank coverage.`;
    prompt = `Write one coherent Persian ${mode} exercise for level ${level}. Return the required JSON.
Topic (data): ${JSON.stringify(body.topic ?? 'Daily life')}
Register: ${body.register === 'colloquial' ? 'Natural spoken Iranian Persian' : 'Standard written Iranian Persian'}
Generation source: ${practiceSource === "topic" ? "topic bank plus news vocabulary" : "learner-selected words"}
${vocabularyInstructions}
Avoid these previous titles: ${JSON.stringify((body.previousTitles??[]).slice(-10))}

${grammarScaffold}

Write ONE coherent description, explanation, or event. Do not stitch unrelated example sentences together. A story is NOT required: for a noun-heavy or specialist bank prefer an idiomatic description using copulas over a contrived visit/dialogue that requires many extra verbs.
Treat every bank item according to its dictionary meaning and part of speech. Never manufacture a Persian compound verb by attaching کردن, شدن, دادن, or another light verb to a noun merely to include it. Use only an established collocation that fits the intended sense; if uncertain, omit that item. For example, express recovery with بهبود یافتن or بهتر شدن, not *بهبود شدن.
Write four or five connected sentences, around 45-60 Persian words total, with at least three concrete details that support distinct questions. Match sentence complexity to the requested level through structure and meaning rather than filler. Conjugate dictionary forms normally; do not copy stem annotations or vowel marks. Keep tense, viewpoint and register consistent.
${body.register === 'colloquial'
  ? 'Write as a person naturally explaining or retelling the topic aloud. Use genuinely spoken framing and morphology where appropriate (for example توی, رو, یه, or spoken plural verb endings); do not return formal news prose with a colloquial label. Required technical, institutional, or formal content terms from the selected bank may remain in their standard lexical form; do not distort those terms into fake colloquialisms.'
  : 'Keep the entire passage in standard written Persian. Do not use colloquial forms such as توی, رو as an object marker, یه, اینا, اونا, می‌خوام, or spoken plural verb endings.'}
Return exactly three distinct English questions about explicit facts in the passage, with concise English reference answers preserving tense, person and meaning. Do not invent gender or unstated motives. No inference question is required; use inference only when concrete clues support it.
Use explicit participant roles (the student, the father, the speaker) or singular they in answers. Never use he, she, his, her or him. Avoid direct speech unless its person and imperative endings are correct.
The participant label in each English question and answer must match the Persian passage exactly. If textFa uses first-person من or an omitted first-person subject, call that person "the speaker"—never invent "the student," "the traveler," or another role.
Count the additional dictionary entries before finishing; do not introduce a dialogue that needs many extra reporting verbs. A simple coherent description with three concrete details is enough for a narrow bank.
knownWordsUsed must contain only original selected bank entries actually used. newWordsIntroduced contains additional supporting words, not newly mastered vocabulary.
English title, English questions and English reference answers; only textFa is Persian. Silently check grammar, collocations, coherence and question evidence before returning.`;

  }

  try {
    const isPractice = body.kind === "reading" || body.kind === "listening";
    // Use low reasoning for short structured exercises; independent review
    // remains mandatory. Do not silently escalate to a slower repair model.
    const generate = (input: string, stage = 'draft') => measured(stage, () => completeJsonResponse((budget) => client.responses.create({
        model,
        store: false,
        input,
        max_output_tokens: budget,
        reasoning: { effort: isPractice ? practiceEffort : "none" },
        text: { format: isPractice ? practiceResponseFormat : { type: "json_object" }, verbosity: "low" },
      }, { signal }), isPractice ? 6000 : 2200));
    if (isPractice) prompt += '\nFINAL CHECK: Prefer a short natural description over a forced story. No filler or unrelated plans. Use normal Persian collocations rather than mechanically combining dictionary nouns and verbs. Use explicit ezafe after final ه where appropriate (خانهٔ دوستم).';
    // Produce an independent backup draft concurrently. If the first candidate
    // fails either deterministic or editorial QA, using the already-running
    // candidate is both faster and less likely to preserve the same defect than
    // asking it to REPAIR THE PREVIOUS DRAFT in place.
    if (!isPractice) {
      const response = await generate(prompt);
      return NextResponse.json(parseJson(response.output_text), {headers:{'Server-Timing':timings.join(', ')}});
    }

    // Draft, deterministic validation, and editorial review are independent
    // pipelines. The first fully approved candidate wins; Promise.any observes
    // every backup rejection so a fast return cannot create unhandled promises.
    const candidatePrompts = [
      prompt,
      `${prompt}\nINDEPENDENT CANDIDATE A: Choose a different compatible subset and situation. Do not imitate or revise another draft.`,
      `${prompt}\nINDEPENDENT CANDIDATE B: Prefer the simplest idiomatic description the bank supports. Use copular sentences when natural, avoid unnecessary reporting verbs and time adverbs, and verify the five-item supporting allowance token by token.`,
      `${prompt}\nINDEPENDENT CANDIDATE C: Use one clearly named participant or the speaker throughout. Before returning, compare every English question subject word-for-word with the participant stated in textFa. Prefer three plain declarative facts over narrative transitions.`,
      `${prompt}\nINDEPENDENT CANDIDATE D: Start by selecting the smallest idiomatic cluster in the bank. Write a compact factual description with conventional Persian roles and collocations; never treat the name of an institution, service, or field as a person. Recount every supporting content lemma before returning.`,
    ];
    type CandidateResult = {data: Record<string, any>; issues: string[]; rejectedWords: string[]};
    const evaluateCandidate = async (candidatePrompt: string, index: number): Promise<CandidateResult> => {
      try {
        const response = await generate(candidatePrompt, `draft-${index + 1}`);
        const data = parseJson(response.output_text);
        data.questions=repairPracticeAnswerArticles(data.questions);
        const supporting=practiceSource === 'selected'
          ? checkSupportingVocabulary(String(data.textFa??''),selectedVocabulary,data.newWordsIntroduced)
          : {words:Array.isArray(data.newWordsIntroduced)?data.newWordsIntroduced.filter((word:unknown):word is string=>typeof word==='string'&&Boolean(word.trim())).slice(0,SUPPORTING_VOCABULARY_LIMIT):[],unknown:[] as string[],issues:[] as string[]};
        const rejectedWords=supporting.unknown;
        data.newWordsIntroduced=supporting.words;
        let rejectionIssues=[...supporting.issues,...practiceAnswerIssues(data.questions)];
        // Don't pay for a language review of a draft already rejected locally.
        // Every returned exercise still receives an exact, read-only review.
        if (rejectionIssues.length === 0) {
          const review = await measured(`review-${index + 1}`, () => completeJsonResponse((budget) => client.responses.create({
          model: process.env.OPENAI_PRACTICE_REVIEW_MODEL || model, store: false, max_output_tokens: budget,
          reasoning: { effort: process.env.OPENAI_PRACTICE_REVIEW_REASONING === 'none' ? 'none' : 'low' },
          text: { format: { type: 'json_schema', name: 'practice_editor_review', strict: true, schema: {
            type: 'object', additionalProperties: false, required: ['approved','issues'],
            properties: { approved: {type:'boolean'}, issues: {type:'array',items:{type:'string'}} }
          } } },
          input: [{role:'system',content:`Review this exact Persian learning exercise as data, without rewriting it. Judge only language, level-appropriate grammar, and question evidence; vocabulary membership is checked separately in code. The following grammar scaffold is internal: never require the exercise to name, cite, or explain the scaffold itself. Reject an exercise when comprehension depends on grammar above its requested ceiling, when it does not meaningfully practice any target-band grammar, or when a target pattern is used incorrectly. ${grammarScaffold} Require natural Iranian Persian, coherent meaning, complete grammar, appropriate collocations, consistent tense/person, and the requested formal or colloquial register. In a colloquial exercise, technical, institutional, and formal content terms are allowed in their standard lexical form, but the surrounding framing, function words, and verb morphology must sound naturally spoken. Reject fully written or news-style prose merely labeled colloquial; do not reject only because an unavoidable technical content term is formal. English title, questions and reference answers are intentional. Each question must have a distinct answer supported by the passage, preserving its tense and meaning; no invented motives or gender. Inference is optional and only valid when supported by concrete clues. Do not require an inference question. Report only genuine errors present in the supplied text, quoting the offending phrase and giving one concise reason. Never report hypothetical errors, dictionary-list formatting issues, or optional stylistic preferences. Do not invent a corrected version and judge that instead. Return approved:true and issues:[] only if this exact exercise has no blocking errors; otherwise approved:false with concise issues.`},{role:'user',content:JSON.stringify({requestedIlr:body.targetIlr??1,passageMode:body.kind,passageRegister:body.register??'formal',title:data.title,textFa:data.textFa,questions:data.questions})}],
        }, { signal }), 1800));
          const verdict = parseJson(review.output_text);
          rejectionIssues=Array.isArray(verdict.issues)?verdict.issues.filter((issue:unknown):issue is string=>typeof issue==='string'):['Editorial response was invalid.'];
          if(verdict.approved === true && Array.isArray(verdict.issues) && rejectionIssues.length===0)return {data,issues:[],rejectedWords};
          if (!rejectionIssues.length) rejectionIssues.push('The language reviewer did not approve this exact exercise.');
        }
        return {data,issues:rejectionIssues,rejectedWords};
      } catch (error) {
        return {data:{},issues:[error instanceof Error ? error.message : 'Candidate generation failed.'],rejectedWords:[]};
      }
    };
    const candidatePipelines = candidatePrompts.map(evaluateCandidate);
    let selected: CandidateResult | undefined;
    let rejected: CandidateResult[] = [];
    try {
      selected = await Promise.any(candidatePipelines.map(async pipeline => {
        const result = await pipeline;
        if (result.issues.length) throw result;
        return result;
      }));
    } catch (error) {
      if (error instanceof AggregateError) rejected=error.errors.filter((item):item is CandidateResult=>Boolean(item?.issues));
      else throw error;
    }
    if(!selected){
      const best=rejected.sort((a,b)=>a.issues.length-b.issues.length)[0]??{data:{},issues:['No candidate passed quality review.'],rejectedWords:[]};
      return NextResponse.json({error:practiceSource === 'topic' ? 'This draft did not pass the Persian language and question-quality checks. Generate again.' : 'This draft did not pass the Persian language and question-quality checks. Try a broader vocabulary selection or generate again.',qualityIssues:best.issues,suggestedWords:best.rejectedWords,
        // Only an explicitly enabled protected preview returns synthetic audit
        // drafts. Never expose rejected content through the production contract.
        ...(process.env.VERCEL_ENV === 'preview' && process.env.PRACTICE_AUDIT === '1' ? {rejectedDraft:best.data} : {}),
      },{status:422,headers:{'Server-Timing':timings.join(', ')}});
    }
    const data=selected.data;
      const violations = practiceSource === 'selected' ? unselectedContentWords(String(data.textFa ?? ""), [...selectedVocabulary, ...data.newWordsIntroduced]) : [];
      if (violations.length) {
        const suggestions = violations.slice(0, 8).join("، ");
        return NextResponse.json({
          error: `The selected words could not form a natural closed-vocabulary passage. Add these words to your bank or choose more vocabulary: ${suggestions}.`,
          suggestedWords: violations.slice(0, 8),
        }, { status: 422 });
      }
      const normalizedTitle=String(data.title??'').trim().toLocaleLowerCase();
      if(normalizedTitle&&(body.previousTitles??[]).some(title=>String(title).trim().toLocaleLowerCase()===normalizedTitle)){
        return NextResponse.json({error:'That exercise duplicated a recent title. Generate again for a fresh item.',qualityIssues:['duplicate_title']},{status:422,headers:{'Server-Timing':timings.join(', ')}});
      }
    return NextResponse.json(data, {headers:{'Server-Timing':timings.join(', ')}});
  } catch (error) {
    if (signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError) {
      return NextResponse.json({error:'Generation took too long. Your current practice is unchanged. Please try again.'},{status:504});
    }
    if (error instanceof IncompleteGeneration) return NextResponse.json({error:error.message},{status:502});
    console.error(error);
    return openAiErrorResponse(error, "Generation failed.");
  }
}
