export const NEWS_TOPICS = [
  "All topics",
  "Politics & government",
  "Security & conflict",
  "Economy & business",
  "Law & rights",
  "Health & science",
  "Society & culture",
  "Environment",
  "Media & communication",
  "General news",
] as const;

export type NewsTopic = (typeof NEWS_TOPICS)[number];

const rules: Array<[Exclude<NewsTopic, "All topics" | "General news">, RegExp]> = [
  ["Politics & government", /government|politic|president|minister|parliament|election|republic|regime|diploma|embassy|governor|municipal|administration|policy|cabinet|monarch|king|prince|revolution/u],
  ["Security & conflict", /war|attack|military|army|guard|weapon|missile|bomb|security|conflict|soldier|terror|threat|defen[cs]e|ceasefire|nuclear|sanction|spy|prison|arrest/u],
  ["Economy & business", /econom|business|market|bank|money|price|inflation|trade|export|import|budget|tax|income|salary|employment|unemployment|industry|company|financial|oil|gas|currency|investment/u],
  ["Law & rights", /law|legal|court|judge|trial|justice|right|crime|criminal|constitution|attorney|lawyer|verdict|sentence|prosecution|human rights/u],
  ["Health & science", /health|medical|medicine|doctor|hospital|disease|patient|drug|vaccine|science|research|technology|internet|computer|space|energy/u],
  ["Society & culture", /society|social|culture|religion|education|school|university|student|family|woman|women|child|sport|art|music|film|book|language|festival|marriage/u],
  ["Environment", /environment|climate|weather|water|drought|flood|earthquake|pollution|forest|wildlife|agriculture|farm|natural disaster/u],
  ["Media & communication", /media|news|report|journal|press|broadcast|television|radio|interview|statement|announce|publish|message|communication/u],
];

export function newsTopicFor(word: { displayForm?: string; definition?: string }) : NewsTopic {
  const searchable = `${word.displayForm ?? ""} ${word.definition ?? ""}`.toLocaleLowerCase();
  return rules.find(([, pattern]) => pattern.test(searchable))?.[0] ?? "General news";
}
