const specific:[string,RegExp][]=[
 ['Doctors & hospitals',/\b(doctor|hospital|clinic|nurse|patient|surgery)\b/i],
 ['Symptoms & illness',/\b(symptom|illness|disease|fever|cough|pain|sick)\b/i],
 ['Medicine & treatment',/\b(medicine|treatment|pill|pharmacy|vaccine)\b/i],
 ['Body & fitness',/\b(body|muscle|exercise|fitness|heart|hand|foot)\b/i],
 ['Airports & flights',/\b(airport|flight|airplane|airline|pilot|baggage)\b/i],
 ['Roads & public transport',/\b(train|bus|car|taxi|road|traffic|ticket|subway)\b/i],
 ['Hotels & tourism',/\b(hotel|tourism|tourist|reservation|vacation)\b/i],
 ['Borders & immigration',/\b(border|immigration|passport|visa|refugee)\b/i],
 ['Restaurants & ordering',/\b(restaurant|waiter|menu|cafe|breakfast|lunch|dinner)\b/i],
 ['Ingredients & cooking',/\b(cooking|cook|rice|bread|meat|fruit|vegetable|salt|sugar)\b/i],
 ['Stores & prices',/\b(store|shop|price|discount|customer|purchase)\b/i],
 ['Clothing & appearance',/\b(clothes|clothing|shirt|shoe|coat|trousers|dress)\b/i],
 ['School & classrooms',/\b(school|classroom|teacher|homework|lesson)\b/i],
 ['University & exams',/\b(university|college|exam|degree|student)\b/i],
 ['Language & reading',/\b(language|read|book|grammar|dictionary|translation)\b/i],
 ['Jobs & careers',/\b(job|career|salary|employment|employee|profession)\b/i],
 ['Offices & meetings',/\b(office|meeting|colleague|manager|appointment)\b/i],
 ['Banking & payments',/\b(bank|payment|loan|cash|credit|currency)\b/i],
 ['Trade & business',/\b(trade|business|company|export|import|industry)\b/i],
 ['Inflation & budgets',/\b(inflation|budget|tax|investment|financial)\b/i],
 ['Elections & politics',/\b(election|vote|parliament|president|political)\b/i],
 ['Public services',/\b(government|municipal|administration|minister)\b/i],
 ['Diplomacy & international relations',/\b(diplomacy|ambassador|embassy|treaty|negotiation)\b/i],
 ['Courts & rights',/\b(court|lawyer|judge|rights|trial|law|justice)\b/i],
 ['Police & crime',/\b(police|crime|arrest|theft|prison|criminal)\b/i],
 ['Military & conflict',/\b(military|war|army|soldier|weapon|conflict|attack)\b/i],
 ['Weather & seasons',/\b(weather|season|rain|snow|wind|storm|temperature)\b/i],
 ['Animals & landscapes',/\b(animal|mountain|river|forest|desert|bird|tree)\b/i],
 ['Climate & energy',/\b(climate|energy|pollution|electricity|fuel|environment)\b/i],
 ['Family & relationships',/\b(family|mother|father|sister|brother|friend|marriage)\b/i],
 ['Home & chores',/\b(home|house|room|clean|furniture|laundry|kitchen)\b/i],
 ['Routines & time',/\b(sleep|morning|evening|today|yesterday|tomorrow|hour|minute)\b/i],
 ['Sports & recreation',/\b(sport|football|swim|game|team|recreation)\b/i],
 ['Arts & celebrations',/\b(art|music|film|festival|celebration|wedding|dance)\b/i],
 ['News & communication',/\b(news|journalist|report|radio|television|message)\b/i],
 ['Computers & internet',/\b(computer|internet|software|website|digital|technology)\b/i],
];
export const COURSE_TOPICS=['All topics',...specific.map(([topic])=>topic),'Daily life','Travel & transport','Food & shopping','Education','Health','Work & economy','Government & society','Nature & weather','Other vocabulary'];
export const PRACTICE_TOPICS=COURSE_TOPICS.filter(topic=>topic!=='All topics'&&topic!=='Other vocabulary');
export function courseTopicFor(definition:string):string {
  const match=specific.find(([,pattern])=>pattern.test(definition));
  if(match)return match[0];
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
