export const COURSE_TOPICS=['All topics','Daily life','Travel & transport','Food & shopping','Education','Health','Work & economy','Government & society','Nature & weather','Other vocabulary'] as const;
export const PRACTICE_TOPICS=COURSE_TOPICS.filter(topic=>topic!=='All topics'&&topic!=='Other vocabulary');
export function courseTopicFor(definition:string):string {
  const rules:[string,RegExp][]=[
    ['Health',/\b(health|doctor|hospital|medicine|sick|disease|pain|patient|nurse)\b/i],
    ['Education',/\b(school|university|student|teacher|lesson|study|class|exam|education|book)\b/i],
    ['Travel & transport',/\b(travel|train|bus|car|airport|flight|ticket|road|drive|hotel|passport)\b/i],
    ['Food & shopping',/\b(food|eat|drink|bread|rice|meat|fruit|restaurant|shop|store|buy|sell|price)\b/i],
    ['Work & economy',/\b(work|job|salary|business|economy|money|bank|trade|company|office)\b/i],
    ['Government & society',/\b(government|president|minister|law|political|election|war|military|society|rights)\b/i],
    ['Nature & weather',/\b(weather|rain|snow|wind|sun|tree|river|mountain|animal|environment)\b/i],
    ['Daily life',/\b(home|house|family|friend|mother|father|sleep|clothes|room|day|night)\b/i],
  ];
  return rules.find(([,rule])=>rule.test(definition))?.[0]??'Other vocabulary';
}
