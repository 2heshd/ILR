import type { IlrLevel } from "./types";

export type SpeakingPromptTemplate = {
  prompt: string;
  topic: string;
  functions: string[];
};

type Theme = { topic: string; subject: string };
type Frame = { build: (subject: string) => string; functions: string[] };

function expand(themes: Theme[], frames: Frame[]): SpeakingPromptTemplate[] {
  return themes.flatMap((theme) => frames.map((frame) => ({
    prompt: frame.build(theme.subject),
    topic: theme.topic,
    functions: frame.functions,
  })));
}

const LEVEL_1_THEMES: Theme[] = [
  { topic: "daily routine", subject: "your usual morning" },
  { topic: "family", subject: "your family or a person close to you" },
  { topic: "home", subject: "your home and the rooms you use most" },
  { topic: "neighborhood", subject: "your neighborhood and nearby places" },
  { topic: "food", subject: "a meal you often eat" },
  { topic: "work or school", subject: "a normal day at work or school" },
  { topic: "free time", subject: "what you do in your free time" },
  { topic: "shopping", subject: "a recent shopping trip" },
  { topic: "transportation", subject: "how you usually travel around town" },
  { topic: "weather", subject: "today's weather and your favorite season" },
];

const LEVEL_1_FRAMES: Frame[] = [
  { build: (subject) => `Describe ${subject}. Give at least four simple details.`, functions: ["describe", "give details", "present time"] },
  { build: (subject) => `Talk about ${subject}. Say what you like, what you do not like, and why.`, functions: ["state preferences", "give a reason", "simple sentences"] },
  { build: (subject) => `Explain what happened recently with ${subject}, then say what will happen next.`, functions: ["past time", "future time", "sequence"] },
  { build: (subject) => `Imagine someone asks you about ${subject}. Give a clear answer with names, places, times, or numbers.`, functions: ["answer questions", "give facts", "clarify"] },
  { build: (subject) => `Compare two parts or examples of ${subject}. Say how they are the same and different.`, functions: ["compare", "contrast", "familiar vocabulary"] },
];

const LEVEL_2_THEMES: Theme[] = [
  { topic: "travel", subject: "a trip that did not go exactly as planned" },
  { topic: "work or school", subject: "a challenge at work or school" },
  { topic: "community", subject: "a change in your neighborhood or community" },
  { topic: "health", subject: "a habit that improves everyday health" },
  { topic: "technology", subject: "a technology you use regularly" },
  { topic: "relationships", subject: "a time you helped someone or received help" },
  { topic: "housing", subject: "two different places to live" },
  { topic: "money", subject: "a purchase or expense that required planning" },
  { topic: "events", subject: "an important celebration, meeting, or event" },
  { topic: "learning", subject: "a skill you learned through practice" },
];

const LEVEL_2_FRAMES: Frame[] = [
  { build: (subject) => `Narrate ${subject}. Explain what happened first, what changed, and how it ended.`, functions: ["narrate", "sequence", "past time"] },
  { build: (subject) => `Describe ${subject} in connected detail, then explain why it mattered to the people involved.`, functions: ["describe", "explain significance", "connected speech"] },
  { build: (subject) => `Explain a problem connected to ${subject}, how you handled it, and what you would do differently next time.`, functions: ["problem solving", "past and conditional", "explain"] },
  { build: (subject) => `Compare two possible approaches to ${subject}. Give advantages, disadvantages, and your preference.`, functions: ["compare", "support an opinion", "qualify"] },
  { build: (subject) => `Discuss how ${subject} was different in the past, how it is now, and how it may change in the future.`, functions: ["major time frames", "contrast", "predict"] },
];

const LEVEL_3_THEMES: Theme[] = [
  { topic: "education policy", subject: "how education should prepare people for a changing economy" },
  { topic: "economic pressure", subject: "how rising prices affect different groups in society" },
  { topic: "public health", subject: "how institutions should respond to a preventable public-health problem" },
  { topic: "technology policy", subject: "the benefits and risks of automated decision-making" },
  { topic: "environment", subject: "how communities should balance development and environmental protection" },
  { topic: "media", subject: "how news organizations influence public understanding" },
  { topic: "workforce", subject: "how remote work changes organizations and employees" },
  { topic: "urban policy", subject: "how cities should improve transportation and housing" },
  { topic: "international affairs", subject: "when international cooperation is more effective than unilateral action" },
  { topic: "social change", subject: "how demographic or cultural change affects public institutions" },
];

const LEVEL_3_FRAMES: Frame[] = [
  { build: (subject) => `Analyze ${subject}. Identify the main causes, effects, and groups involved.`, functions: ["analyze", "cause and effect", "sustain discourse"] },
  { build: (subject) => `Take a position on ${subject}. Support it with examples and respond to one strong objection.`, functions: ["argue", "support", "address objections"] },
  { build: (subject) => `Compare two policy approaches to ${subject}. Evaluate their likely results and recommend one.`, functions: ["compare policy", "evaluate", "recommend"] },
  { build: (subject) => `Brief a professional audience on ${subject}. Explain the current situation, risks, and next steps.`, functions: ["brief", "organize", "professional register"] },
  { build: (subject) => `Discuss how ${subject} may develop over the next decade. Separate likely outcomes from uncertain ones.`, functions: ["hypothesize", "qualify", "project consequences"] },
];

const LEVEL_4_THEMES: Theme[] = [
  { topic: "security and rights", subject: "the tension between national security and public access to information" },
  { topic: "economic reform", subject: "the balance between short-term stability and long-term structural reform" },
  { topic: "institutional trust", subject: "how institutional language shapes legitimacy and public trust" },
  { topic: "diplomacy", subject: "the strategic value and limitations of ambiguity in diplomacy" },
  { topic: "law and ethics", subject: "when legal authority and ethical responsibility point in different directions" },
  { topic: "historical memory", subject: "how competing accounts of history influence present-day policy" },
  { topic: "technology and power", subject: "how control of data redistributes power among citizens, firms, and governments" },
  { topic: "governance", subject: "the tradeoff between administrative efficiency and democratic accountability" },
  { topic: "international order", subject: "whether multilateral institutions can remain effective during great-power competition" },
  { topic: "public discourse", subject: "the boundary between persuasion, strategic framing, and manipulation" },
];

const LEVEL_4_FRAMES: Frame[] = [
  { build: (subject) => `Give a nuanced analysis of ${subject}. Define the competing principles and reconcile them where possible.`, functions: ["analyze nuance", "define principles", "synthesize"] },
  { build: (subject) => `Present the strongest arguments on both sides of ${subject}, then reach a carefully qualified judgment.`, functions: ["steelman", "qualify", "judge"] },
  { build: (subject) => `Explain ${subject} to a senior professional audience. Shift between conceptual analysis and concrete examples.`, functions: ["shift register", "illustrate abstraction", "precise discourse"] },
  { build: (subject) => `Examine the hidden assumptions behind common arguments about ${subject}. Explain how changing one assumption alters the conclusion.`, functions: ["surface assumptions", "reason hypothetically", "reframe"] },
  { build: (subject) => `Develop an extended argument about ${subject}, including second-order effects, unintended consequences, and limits to your own position.`, functions: ["develop argument", "trace consequences", "self-qualify"] },
];

export const SPEAKING_PROMPTS: Record<IlrLevel, SpeakingPromptTemplate[]> = {
  1: expand(LEVEL_1_THEMES, LEVEL_1_FRAMES),
  2: expand(LEVEL_2_THEMES, LEVEL_2_FRAMES),
  3: expand(LEVEL_3_THEMES, LEVEL_3_FRAMES),
  4: expand(LEVEL_4_THEMES, LEVEL_4_FRAMES),
};
