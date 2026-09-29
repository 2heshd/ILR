import OpenAI from "openai";
import { NextResponse } from "next/server";
import { openAiErrorResponse } from "@/lib/openai-error";
import { unselectedContentWords } from "@/lib/practice-vocabulary";
import { practiceAnswerIssues, repairPracticeAnswerArticles } from "@/lib/practice-answers";
import { checkSupportingVocabulary, SUPPORTING_VOCABULARY_LIMIT } from "@/lib/practice-support";
import { practiceBank } from "@/lib/practice-bank";
import { grammarProfileForIlr, grammarPromptForExercise } from "@/lib/grammar-levels";
import persianGrammar from "@/data/persian-grammar-rules.json";
import { persianCoherenceIssues, persianRegisterIssues } from "@/lib/persian-coherence";
import editorialPersianExamples from "@/data/persian-natural-exemplars.json";
import openPersianCorpus1 from "@/data/persian-natural-corpus-1.json";
import openPersianCorpus2 from "@/data/persian-natural-corpus-2.json";
import openPersianCorpus3 from "@/data/persian-natural-corpus-3.json";
import openPersianCorpus4 from "@/data/persian-natural-corpus-4.json";
import openPersianCorpus5 from "@/data/persian-natural-corpus-5.json";
import openPersianCorpus6 from "@/data/persian-natural-corpus-6.json";
import openPersianCorpus7 from "@/data/persian-natural-corpus-7.json";
import openPersianCorpus8 from "@/data/persian-natural-corpus-8.json";
import { naturalPersianExamples, naturalPersianPrompt } from "@/lib/natural-persian";
import courseVocabulary from "@/data/course-vocabulary.json";
import { earlierCourseVocabulary, promptCourseSupport } from "@/lib/course-prerequisites";

const openPersianCorpus = [
  ...openPersianCorpus1, ...openPersianCorpus2, ...openPersianCorpus3, ...openPersianCorpus4,
  ...openPersianCorpus5, ...openPersianCorpus6, ...openPersianCorpus7, ...openPersianCorpus8,
];

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
  targetCourseListNumbers?: number[];
  wordDefinitions?: {word:string;meaning:string}[];
  targetIlr?: number;
  practiceMode?: "controlled" | "transfer";
  practiceSource?: "selected" | "topic";
  register?: "formal" | "colloquial";
  practiceFocus?: string[];
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
      newWordsIntroduced: { type: "array", maxItems: 12, description: "Supporting dictionary entries used beyond the supplied generation bank. In selected-word mode, plan these before writing and keep every content word inside the selected bank or this allowance.", items: { type: "string" } },
      textFa: { type: "string", description: "A coherent Persian passage that follows the source-specific sentence and word range in the prompt." },
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

function persianWordCount(value: unknown) {
  return String(value ?? "").match(/[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+/gu)?.length ?? 0;
}

function copiedDictionaryInfinitives(text: unknown, vocabulary: string[]) {
  const normalized = String(text ?? "").normalize("NFKC").replace(/[\u064b-\u065f\u0670]/gu, "").replace(/[\u200c\s]+/gu, " ");
  return vocabulary.filter((entry) => {
    const form = entry.replace(/\([^)]*\)/gu, "").split(/[،؛/]/u)[0]?.trim().normalize("NFKC").replace(/[\u064b-\u065f\u0670]/gu, "").replace(/[\u200c\s]+/gu, " ");
    if (!form || !/[دت]ن$/u.test(form)) return false;
    const pattern = new RegExp(`(?:^|[\\s،؛])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s،؛.!؟])`, "gu");
    return [...normalized.matchAll(pattern)].some((match) => {
      const before = normalized.slice(0, match.index).trimEnd();
      const after = normalized.slice((match.index ?? 0) + match[0].length).trimStart();
      // Persian infinitives are legitimate after a preposition (برای معاینه کردن,
      // بعد از پر کردن) and as nominal complements (سرگرمی من بازی کردن است).
      // The gate targets dictionary forms pasted directly as finite predicates.
      return !/(?:^|\s)(?:برای|از|به|با)$/u.test(before) && !/^(?:است|بود|شد|نیست)(?=$|[\s،؛.!؟])/u.test(after);
    });
  });
}

function normalizeColloquialFunctionWords(text: unknown) {
  return String(text ?? "")
    .replace(/باهم/gu, "با هم")
    .replace(/(^|[\s،؛])را(?=$|[\s،؛.!؟])/gu, "$1رو")
    .replace(/(^|[\s،؛])اگر(?=$|[\s،؛.!؟])/gu, "$1اگه")
    .replace(/(^|[\s،؛])آن[‌\s]?جا(?=$|[\s،؛.!؟])/gu, "$1اونجا")
    .replace(/(^|[\s،؛])یک(?=$|[\s،؛.!؟])/gu, "$1یه")
    .replace(/(^|[\s،؛])خانه(?=$|[\s،؛.!؟])/gu, "$1خونه")
    .replace(/می‌?شوم/gu, "می‌شم")
    .replace(/می‌?شوند/gu, "می‌شن")
    .replace(/می‌?شود/gu, "می‌شه")
    .replace(/می‌?روم/gu, "می‌رم")
    .replace(/می‌?کنند/gu, "می‌کنن")
    .replace(/می‌?کند/gu, "می‌کنه")
    .replace(/می‌?رسند/gu, "می‌رسن")
    .replace(/(^|[\s،؛])بروم(?=$|[\s،؛.!؟])/gu, "$1برم")
    .replace(/ه‌ام(?=$|[\s،؛.!؟])/gu, "ه‌م")
    .replace(/([\u0600-\u06ff‌]+)\s+است(?=$|[\s،؛.!؟])/gu, "$1ه");
}

function passageProfile(source: "selected" | "topic", selectedCount: number) {
  if (source === "topic") return { sentenceMin: 4, sentenceMax: 8, target: "110–135", minimum: 60, supportingMaximum: SUPPORTING_VOCABULARY_LIMIT };
  if (selectedCount <= 15) return { sentenceMin: 3, sentenceMax: 5, target: "36–50", minimum: 30, supportingMaximum: 30 };
  if (selectedCount <= 40) return { sentenceMin: 4, sentenceMax: 6, target: "55–75", minimum: 44, supportingMaximum: 40 };
  return { sentenceMin: 4, sentenceMax: 7, target: "90–110", minimum: 65, supportingMaximum: 55 };
}

class IncompleteGeneration extends Error {}

async function completeJsonResponse(make: (budget: number) => Promise<OpenAI.Responses.Response>, budget: number) {
  const response = await make(budget);
  if (response.status === "completed" && response.output_text.trim()) {
    try { parseJson(response.output_text); return response; } catch { /* Fail fast; background preparation can retry. */ }
  }
  // Log metadata only, never the learner's passage or API credentials.
  console.warn("Practice response incomplete", { status: response.status, reason: response.incomplete_details?.reason });
  throw new IncompleteGeneration("The practice response was incomplete. Please generate again; your current work is unchanged.");
}

export async function POST(request: Request) {
  const requestStarted = performance.now();
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
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 7_600, maxRetries: 0 });
  // One learner-facing model call must finish inside the ten-second product budget.
  // Rejected drafts fail the deterministic gate; only invisible prefetch may retry.
  const deadline = AbortSignal.timeout(8_300);
  const signal = AbortSignal.any([request.signal, deadline]);
  // Natural Persian collocations and spoken inflections need the full model.
  // The single-call deadline—not a weaker model—keeps learner-facing latency bounded.
  const model = process.env.OPENAI_MODEL || "gpt-4.1";

  let prompt = "";
  let selectedVocabulary: string[] = [];
  let practiceSource: "selected" | "topic" = "selected";
  let passageLength = passageProfile("selected", 0);
  let grammarScaffold = "";
  let allowedSupportingVocabulary: string[] = [];
  if (body.kind === "define_words") {
    prompt = `Return JSON only. Define and romanize these Persian vocabulary items for a serious learner: ${(body.words ?? []).join(", ")}. Preserve the exact Persian display form. Give the most useful concise English meaning in context; for verbs use an infinitive beginning with "to". Romanization should be readable and consistent.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"..."}]}`;
  } else if (body.kind === "advanced_words") {
    prompt = `You are building a 35-week Persian course for an advanced government linguist. Return JSON only.\n\nWeek: ${body.weekNumber ?? 1}\nAlready learned terms (never repeat these): ${(body.existing ?? []).join(", ")}\n\nChoose EXACTLY 5 high-value Persian lexical items appropriate for eventual ILR 3-4 reading/listening. Rotate among government, politics, economics, diplomacy, law, security, policy, international relations, and formal media discourse. Prefer reusable formal vocabulary, collocations, and institutional terms rather than obscure trivia. Do not choose trivial morphological duplicates of existing items.\n\nReturn this exact shape:\n{"words":[{"displayForm":"...","definition":"...","romanization":"...","topic":"..."}]}`;
  } else {
    const mode = body.kind === "reading" ? "reading" : "listening";
    const level = Math.max(1, Math.min(4, body.targetIlr ?? 1));
    const grammarProfile = grammarProfileForIlr(persianGrammar.rules, level);
    const grammarSeed = `${body.topic ?? "Daily life"}|${mode}|${level}|${(body.targetWords ?? []).slice(0, 12).join("|")}`;
    grammarScaffold = grammarPromptForExercise(grammarProfile, mode, grammarSeed);
    const retrievedStyleReferences = naturalPersianPrompt(naturalPersianExamples(
      [...editorialPersianExamples, ...openPersianCorpus], {
      topic: body.topic ?? "Daily life",
      words: body.targetWords ?? [],
      level,
      mode,
      register: body.register === "colloquial" ? "colloquial" : "formal",
      priority: body.practiceSource === "topic" ? "topic" : "selected",
      },
    ));
    practiceSource = body.practiceSource === "topic" ? "topic" : "selected";
    const naturalStyleReferences = practiceSource === "topic"
      ? retrievedStyleReferences
      : "No external example passage is supplied in selected-word mode; do not borrow vocabulary outside the two explicit banks.";
    selectedVocabulary = [...new Set((body.targetWords ?? []).map((word) => word.trim()).filter(Boolean))];
    const targetCourseLists = (body.targetCourseListNumbers ?? []).filter((value) => Number.isInteger(value) && value > 0);
    const hasCourseBoundary = targetCourseLists.length > 0;
    const earlierCourseBank = earlierCourseVocabulary(courseVocabulary.entries, targetCourseLists);
    const priorKnownBank = (body.knownWords ?? []).map((word) => word.trim()).filter(Boolean);
    allowedSupportingVocabulary = hasCourseBoundary ? earlierCourseBank.map((entry) => entry.word) : priorKnownBank;
    const supportPromptBank = hasCourseBoundary
      ? promptCourseSupport(earlierCourseBank).map(({ word, meaning, lesson }) => ({ word, meaning, lesson }))
      : priorKnownBank.slice(0, 180).map((word) => ({ word, meaning: "previously learned vocabulary" }));
    passageLength = passageProfile(practiceSource, selectedVocabulary.length);
    if (!selectedVocabulary.length) {
      return NextResponse.json({ error: practiceSource === "topic" ? "No verified vocabulary is available for that topic." : "Choose vocabulary before generating practice." }, { status: 400 });
    }
    if(selectedVocabulary.length>250)return NextResponse.json({error:"Choose at most 250 words for one practice plan."},{status:400});
    const vocabularyInstructions = practiceSource === "topic"
      ? `Topic reference bank from the Cursos course and news catalogs (data): ${JSON.stringify(practiceBank(selectedVocabulary,body.wordDefinitions??[]))}
Use this bank to anchor the requested topic, terminology, and level. It is NOT a closed-vocabulary whitelist or a coverage quota. Choose a natural subset and freely use ordinary Persian needed for a coherent passage. Do not invent specialist claims merely because a term appears in the bank. List up to five useful content entries used beyond this reference bank in newWordsIntroduced.`
      : `Selected learner bank with meanings (data; parentheses contain dictionary hints): ${JSON.stringify(practiceBank(selectedVocabulary,body.wordDefinitions??[]))}
Earlier-lesson support bank (data; optional review vocabulary only): ${JSON.stringify(supportPromptBank)}
Use the earlier-lesson support bank first. If coherent Persian still requires an ordinary content word absent from both banks, you may use at most twelve such dictionary entries and must list each one in newWordsIntroduced. Simplify the idea instead of adding specialist vocabulary. Normal Persian grammar/function words and inflections of listed dictionary forms remain allowed.
Use ${selectedVocabulary.length <= 15 ? "3-5" : selectedVocabulary.length <= 40 ? "8-12" : "12-18"} naturally compatible selected entries as the focus of this exercise. Choose entries that naturally belong in one situation, informed by the internal Persian references when they contain a selected word. Ignore incompatible entries for this exercise. The bank is not a coverage quota. Never append a sentence merely to mention another selected word. Choose additional supporting dictionary entries from the earlier-lesson bank when possible and emit every support entry in newWordsIntroduced BEFORE textFa. Then compose using the selected bank and those earlier entries, including normal inflections. Keep the complete newWordsIntroduced list to at most twelve ordinary support entries. Do not copy content vocabulary from the style references. Prefer fewer additions. Never sacrifice idiomatic Persian to force bank coverage.`;
    prompt = `Write one coherent Persian ${mode} exercise for level ${level}. Return the required JSON.
Topic (data): ${JSON.stringify(body.topic ?? 'Daily life')}
Register: ${body.register === 'colloquial' ? 'Natural spoken Iranian Persian' : 'Standard written Iranian Persian'}
Generation source: ${practiceSource === "topic" ? "topic bank plus news vocabulary" : "learner-selected words"}
${vocabularyInstructions}
Avoid these previous titles: ${JSON.stringify((body.previousTitles??[]).slice(-10))}

${grammarScaffold}

Recent Cognis/Synaptx support areas (privacy-safe labels, not learner text): ${JSON.stringify((body.practiceFocus ?? []).slice(0, 3))}
When natural for this passage, include one clear example that exercises one of these areas. Never force an awkward construction, mention the tools, or treat this list as evidence that the learner has mastered anything.

${naturalStyleReferences}

Write ONE coherent description, explanation, or event. Do not stitch unrelated example sentences together. A story is NOT required: for a noun-heavy or specialist bank prefer an idiomatic description using copulas over a contrived visit/dialogue that requires many extra verbs.
Before drafting, silently choose one believable setting, one timeline, and only the participants needed for it. Every sentence must advance or explain that same situation. Avoid translated-English transitions, redundant restatements, and vague movement such as آمدن when the destination or point of view does not make it natural.
Every person and action must contribute clearly to that one situation. Do not insert a family member or helper merely to connect vocabulary. If somebody helps the speaker, state what they help the speaker do. In a first-person passage, use an explicit possessive form for the speaker's relative, such as مادربزرگم rather than bare مادربزرگ. Write با هم as two words. For "when it is time to go to work," use a natural pattern such as وقتی وقتِ رفتن به سرِ کار می‌شود; never write *وقت سر کار رفتن می‌رسد.
End the passage with a statement. Do not address the learner with a rhetorical question, and never produce a redundant construction equivalent to "do you like to like it?"
Treat every bank item according to its dictionary meaning and part of speech. Never manufacture a Persian compound verb by attaching کردن, شدن, دادن, or another light verb to a noun merely to include it. Use only an established collocation that fits the intended sense; if uncertain, omit that item. For example, express recovery with بهبود یافتن or بهتر شدن, not *بهبود شدن.
Respect the semantic roles of every collocation, not just its grammar: people are examined; forms or information fields are filled out; documents are submitted; and a certificate of completed service follows completion of service. Never infer that weakness itself denies an exemption. Do not use one selected noun as the object of a selected verb unless that pairing is idiomatic and logically accurate.
Dictionary forms ending in ـن are infinitives, not ready-made predicates. Whenever a selected simple or compound verb appears, conjugate its final verb for the actual subject and tense. Never paste forms such as پر کردن، تحویل دادن، طول کشیدن, or بستگی داشتن unchanged into an ordinary finite sentence.
Write ${passageLength.sentenceMin}–${passageLength.sentenceMax} connected sentences containing ${passageLength.target} Persian words total, leaving a safe margin above the enforced ${passageLength.minimum}-word minimum, with at least three concrete details that support distinct questions. Match sentence complexity to the requested level through structure and meaning rather than filler. Conjugate dictionary forms normally; do not copy stem annotations or vowel marks. Keep tense, viewpoint and register consistent.
${body.register === 'colloquial'
  ? 'Write as an Iranian speaker naturally explaining or retelling the topic to a friend aloud, using a first- or second-person frame when that helps technical subject matter sound conversational. Make the spoken register unmistakable throughout, using at least three natural conversational forms. Prefer grammatical/function-word signals such as رو، یه، توی، اون، اگه plus spoken inflections of verbs already present in the supplied banks; do not introduce a new content lemma merely to sound casual. Every ordinary inflection must also be spoken: write می‌شم not می‌شوم, می‌شه not می‌شود, می‌رم not می‌روم, برم not بروم, and کرده‌م not کرده‌ام. Do not merely insert casual function words into otherwise formal prose. Do not mix forms such as توی خانه‌ام with conversational speech, and do not return formal news prose with a colloquial label. Required technical, institutional, or formal content terms from the selected bank may remain standard; do not distort those terms into fake colloquialisms.'
  : 'Keep the entire passage in standard written Persian. Do not use colloquial forms such as توی, رو as an object marker, یه, اینا, اونا, می‌خوام, or spoken plural verb endings.'}
Return exactly three distinct English questions about explicit facts in the passage, with concise English reference answers preserving tense, person and meaning. Do not invent gender or unstated motives. No inference question is required; use inference only when concrete clues support it.
Use explicit participant roles (the student, the father, the speaker) or singular they in answers. Never use he, she, his, her or him. Avoid direct speech unless its person and imperative endings are correct.
The participant label in each English question and answer must match the Persian passage exactly. If textFa uses first-person من or an omitted first-person subject, call that person "the speaker"—never invent "the student," "the traveler," or another role.
Count the additional dictionary entries before finishing; do not introduce a dialogue that needs many extra reporting verbs. A simple coherent description with three concrete details is enough for a narrow bank.
knownWordsUsed must contain only original selected bank entries actually used. In selected-word mode, newWordsIntroduced may contain only entries from the supplied earlier-lesson support bank that actually appear in textFa. Never use a later lesson, the current lesson outside the learner's explicit selection, news vocabulary, or an invented supporting entry.
English title, English questions and English reference answers; only textFa is Persian. Silently check grammar, collocations, coherence and question evidence before returning.`;

  }

  try {
    const isPractice = body.kind === "reading" || body.kind === "listening";
    // This is a constrained transformation task. Skipping a separate reasoning
    // phase keeps the learner-facing call fast; the returned JSON is gated below.
    const generate = (input: string, stage = 'draft') => measured(stage, () => completeJsonResponse((budget) => client.responses.create({
        model,
        store: false,
        input,
        temperature: isPractice ? 0.2 : undefined,
        max_output_tokens: budget,
        text: { format: isPractice ? practiceResponseFormat : { type: "json_object" } },
      }, { signal }), isPractice ? 1800 : 2200));
    if (isPractice) prompt += `\nFINAL CHECK: Prefer a concise natural description over a forced story. No filler or unrelated plans. Use normal Persian collocations rather than mechanically combining dictionary nouns and verbs. Use explicit ezafe after final ه where appropriate (خانهٔ دوستم). Count the final passage: textFa must contain ${passageLength.sentenceMin}–${passageLength.sentenceMax} complete sentences and at least ${passageLength.minimum} Persian words.`;
    if (!isPractice) {
      const response = await generate(prompt);
      return NextResponse.json(parseJson(response.output_text), {headers:{'Server-Timing':timings.join(', ')}});
    }

    // A single, self-edited structured generation replaces the old five-draft
    // plus five-review fan-out. Deterministic validation remains a hard gate.
    const response = await generate(`${prompt}\nSILENT NATIVE EDIT: Read textFa once as a native Iranian editor before returning JSON. Remove literal translations, mixed register, filler, odd timelines, and unnatural motion viewpoint. Aim for ${passageLength.target} Persian words so the result remains above ${passageLength.minimum} after deterministic token counting, and keep ${passageLength.sentenceMin}–${passageLength.sentenceMax} complete sentences.${body.register === 'colloquial' ? ' Confirm the whole passage sounds spoken and contains at least four conversational forms drawn from at least two different spoken-pattern categories, without distorting technical content words.' : ''}`, 'draft');
    let data = parseJson(response.output_text);
    const preparePractice = () => {
        if(body.register==='colloquial')data.textFa=normalizeColloquialFunctionWords(data.textFa);
        data.questions=repairPracticeAnswerArticles(data.questions);
        const supporting=practiceSource === 'selected'
          ? checkSupportingVocabulary(String(data.textFa??''),[...selectedVocabulary,...allowedSupportingVocabulary],data.newWordsIntroduced,12)
          : {words:Array.isArray(data.newWordsIntroduced)?data.newWordsIntroduced.filter((word:unknown):word is string=>typeof word==='string'&&Boolean(word.trim())).slice(0,SUPPORTING_VOCABULARY_LIMIT):[],unknown:[] as string[],issues:[] as string[]};
        const rejectedWords=supporting.unknown;
        data.newWordsIntroduced=supporting.words;
        const sentenceCount=String(data.textFa??'').split(/[.!؟]+/u).filter(part=>part.trim()).length;
        const wordCount=persianWordCount(data.textFa);
        const curriculumViolations=practiceSource==='selected'?unselectedContentWords(String(data.textFa??''),[...selectedVocabulary,...allowedSupportingVocabulary,...supporting.words]):[];
        const rejectionIssues=[...supporting.issues,...(curriculumViolations.length?[`Replace words outside the selected and earlier-lesson banks: ${curriculumViolations.slice(0,12).join('، ')}`]:[]),...practiceAnswerIssues(data.questions),...persianCoherenceIssues(data.textFa),...persianRegisterIssues(data.textFa,body.register??'formal'),...(sentenceCount<passageLength.sentenceMin||sentenceCount>passageLength.sentenceMax?[`Passage must contain ${passageLength.sentenceMin}–${passageLength.sentenceMax} complete sentences; received ${sentenceCount}.`]:[]),...(wordCount<passageLength.minimum?[`Passage must contain at least ${passageLength.minimum} Persian words; received ${wordCount}.`]:[])];
        return { rejectionIssues, rejectedWords };
    };
    let { rejectionIssues, rejectedWords } = preparePractice();
    // A fast rejected first draft gets one rewrite, but never a repair queue.
    // The shared 9-second AbortSignal remains the absolute request deadline.
    if (rejectionIssues.length && performance.now() - requestStarted < 4_200 && !signal.aborted) {
      const repaired = await generate(`${prompt}\nONE BOUNDED MINIMAL EDIT: Here is an otherwise complete draft: ${JSON.stringify(data)}. It failed only these deterministic checks: ${JSON.stringify(rejectionIssues)}. Preserve its coherent situation and make the fewest possible edits needed to fix every listed issue. Delete or replace each forbidden content word with an exact item from the supplied selected or earlier-lesson bank; never substitute another unlisted synonym. A forbidden word remains forbidden even if it appeared in the draft, an example, or another part of this prompt. Before returning, search the corrected text for every exact surface form named in the failed checks and confirm that none remains; if a sentence cannot be repaired safely, delete that sentence and preserve the required passage length with bank vocabulary only. Preserve three fact-supported questions and the requested register. Return the complete corrected JSON only.`, 'rewrite');
      data = parseJson(repaired.output_text);
      ({ rejectionIssues, rejectedWords } = preparePractice());
    }
    if(rejectionIssues.length){
      return NextResponse.json({error:practiceSource === 'topic' ? 'This draft did not pass the Persian language and question-quality checks. Generate again.' : 'This draft did not pass the Persian language and question-quality checks. Try a broader vocabulary selection or generate again.',qualityIssues:rejectionIssues,suggestedWords:rejectedWords,
        // Only an explicitly enabled protected preview returns synthetic audit
        // drafts. Never expose rejected content through the production contract.
        ...((process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development') && process.env.PRACTICE_AUDIT === '1' ? {rejectedDraft:data} : {}),
      },{status:422,headers:{'Server-Timing':timings.join(', ')}});
    }
      const violations = practiceSource === 'selected' ? unselectedContentWords(String(data.textFa ?? ""), [...selectedVocabulary, ...allowedSupportingVocabulary, ...(Array.isArray(data.newWordsIntroduced) ? data.newWordsIntroduced : [])]) : [];
      if (violations.length) {
        const suggestions = violations.slice(0, 8).join("، ");
        return NextResponse.json({
          error: `The selected words could not form a natural passage within the support limit. Add these words to your bank or choose more vocabulary: ${suggestions}.`,
          suggestedWords: violations.slice(0, 8),
        }, { status: 422 });
      }
      const normalizedTitle=String(data.title??'').trim().toLocaleLowerCase();
      if(normalizedTitle&&(body.previousTitles??[]).some(title=>String(title).trim().toLocaleLowerCase()===normalizedTitle)){
        return NextResponse.json({error:'That exercise duplicated a recent title. Generate again for a fresh item.',qualityIssues:['duplicate_title']},{status:422,headers:{'Server-Timing':timings.join(', ')}});
      }
    return NextResponse.json(data, {headers:{'Server-Timing':timings.join(', ')}});
  } catch (error) {
    if (signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError || error instanceof OpenAI.APIUserAbortError) {
      return NextResponse.json({error:'Generation took too long. Your current practice is unchanged. Please try again.'},{status:504});
    }
    if (error instanceof IncompleteGeneration) return NextResponse.json({error:error.message},{status:502});
    console.error(error);
    return openAiErrorResponse(error, "Generation failed.");
  }
}
