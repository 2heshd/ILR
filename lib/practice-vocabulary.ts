const ARABIC_TO_PERSIAN: Record<string, string> = { ي: "ی", ى: "ی", ك: "ک" };
const PERSIAN_TOKEN = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+/gu;

const GRAMMAR_WORDS = new Set([
  "از", "اگر", "اما", "او", "این", "آن", "آنها", "ای", "با", "برای", "بر", "به", "بود", "بودم", "بودی", "بودند", "بودیم", "بودید",
  "باشد", "باشند", "باشیم", "باید", "پس", "تا", "تو", "چرا", "چون", "چه", "خود", "در", "درباره", "را", "روی", "زیر", "سپس", "شما",
  "که", "کی", "ما", "من", "میان", "نه", "نیز", "نیست", "نیستم", "نیستند", "هست", "هستم", "هستند", "هم", "همه", "هر", "هیچ", "و", "ولی", "یا", "یک",
]);

const PRESENT_STEMS: Record<string, string[]> = {
  "آمدن": ["آی"], "آوردن": ["آور"], "بردن": ["بر"], "بودن": ["باش", "هست"], "توانستن": ["توان"], "خوردن": ["خور"],
  "خواستن": ["خواه"], "خواندن": ["خوان"], "داشتن": ["دار"], "دانستن": ["دان"], "دادن": ["ده"], "دیدن": ["بین"],
  "رفتن": ["رو"], "رسیدن": ["رس"], "ساختن": ["ساز"], "شدن": ["شو"], "کردن": ["کن"], "گرفتن": ["گیر"],
  "گفتن": ["گو"], "نشستن": ["نشین"], "نوشتن": ["نویس"],
};

const VERB_ENDINGS = ["", "م", "ی", "د", "یم", "ید", "ند", "ه", "هام", "های", "هایم", "هاید", "هاند"];
const NOMINAL_SUFFIXES = ["هایمان", "هایتان", "هایشان", "هایم", "هایت", "هایش", "هایی", "های", "ها", "مان", "تان", "شان", "ام", "ات", "اش", "ان", "ی"];

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يىك]/gu, (character) => ARABIC_TO_PERSIAN[character] ?? character)
    .replace(/[\u064b-\u065f\u0670\u200c\s]+/gu, "");
}

function tokens(value: string) {
  return value.match(PERSIAN_TOKEN)?.map(normalize).filter(Boolean) ?? [];
}

function withoutVerbPrefix(token: string) {
  if (token.startsWith("نمی") && token.length > 3) return token.slice(3);
  if (token.startsWith("می") && token.length > 2) return token.slice(2);
  if (token.startsWith("ب") && token.length > 2) return token.slice(1);
  if (token.startsWith("ن") && token.length > 2) return token.slice(1);
  return token;
}

function matchesStem(token: string, stem: string) {
  const candidate = withoutVerbPrefix(token);
  return VERB_ENDINGS.some((ending) => candidate === `${stem}${ending}`);
}

function nominalBases(token: string) {
  const bases = new Set([token]);
  for (const suffix of NOMINAL_SUFFIXES) {
    if (token.endsWith(suffix) && token.length > suffix.length + 1) bases.add(token.slice(0, -suffix.length));
  }
  return bases;
}

export function unselectedContentWords(text: string, selectedVocabulary: string[]) {
  const selectedTokens = new Set(selectedVocabulary.flatMap(tokens));
  const verbStems = new Set<string>();

  for (const token of selectedTokens) {
    if (!token.endsWith("ن") || token.length < 3) continue;
    verbStems.add(token.slice(0, -1));
    for (const stem of PRESENT_STEMS[token] ?? []) verbStems.add(stem);
  }

  const unknown = new Set<string>();
  for (const token of tokens(text)) {
    if (GRAMMAR_WORDS.has(token) || selectedTokens.has(token)) continue;
    if ([...nominalBases(token)].some((base) => selectedTokens.has(base))) continue;
    if ([...verbStems].some((stem) => matchesStem(token, stem))) continue;
    unknown.add(token);
  }
  return [...unknown];
}
