type GrammarRule = {
  name: string;
  ilr_min: string;
  active_beta_scope?: boolean;
};

export type GrammarProfile = {
  level: number;
  foundation: string[];
  target: string[];
  ceiling: string[];
  guidance: string;
};

const LEVEL_ORDER: Record<string, number> = {
  "0+": 0.5,
  "1": 1,
  "1+": 1.5,
  "2": 2,
  "2+": 2.5,
  "3": 3,
  "3+": 3.5,
  "4": 4,
};

export function grammarProfileForIlr(rules: GrammarRule[], requestedLevel: number): GrammarProfile {
  const level = Math.max(1, Math.min(4, requestedLevel));
  // The catalog is internal generation guidance, so the full level map can
  // scaffold ILR 3-4 even when those rules are not exposed as beta lessons.
  const active = rules.filter((rule) => LEVEL_ORDER[rule.ilr_min] !== undefined);
  const ceiling = active.filter((rule) => LEVEL_ORDER[rule.ilr_min] <= level).map((rule) => rule.name);
  const lowerBoundary = Math.max(0.5, level - 0.75);
  const target = active
    .filter((rule) => LEVEL_ORDER[rule.ilr_min] > lowerBoundary && LEVEL_ORDER[rule.ilr_min] <= level)
    .map((rule) => rule.name);
  const targetSet = new Set(target);
  const foundation = ceiling.filter((name) => !targetSet.has(name));
  const guidance = level < 1.5
    ? "Prefer short independent clauses, explicit participants, high-frequency connectors, and direct time order. Keep embedding minimal."
    : level < 2.5
      ? "Use connected paragraph grammar with controlled subordination, tense/aspect contrasts, and clear reference tracking."
      : level < 3.5
        ? "Use authentic multi-clause relationships, nominalization, stance, and implicit links while keeping the discourse recoverable."
        : "Use dense professional or rhetorical grammar, nuanced stance, register-sensitive phrasing, and long-range clause relationships.";
  return { level, foundation, target, ceiling, guidance };
}

export function grammarPromptForProfile(profile: GrammarProfile, mode: "reading" | "listening") {
  const modality = mode === "listening"
    ? "For listening, grammar must remain understandable in one pass: use audible discourse cues, controlled reference chains, and natural spoken or broadcast phrasing for the requested register."
    : "For reading, grammar may use punctuation and paragraph structure as comprehension cues, but must stay within the same level ceiling.";
  return [
    "INTERNAL GRAMMAR SCAFFOLD (never mention this framework, its levels, or its source in learner-visible content):",
    `Target grammar for this exercise: ${JSON.stringify(profile.target)}`,
    `Previously learned grammar that may recur naturally: ${JSON.stringify(profile.foundation)}`,
    "Build the passage around two to four target-band grammar patterns when they fit naturally. Previously learned grammar may support them.",
    "Do not make comprehension depend on grammar above this ceiling. Natural fixed expressions are allowed, but avoid introducing a new advanced construction merely to make the passage seem difficult.",
    profile.guidance,
    modality,
  ].join("\n");
}
