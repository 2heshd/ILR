const ARABIC_TO_PERSIAN: Record<string, string> = { ي: "ی", ى: "ی", ك: "ک" };
const PERSIAN_TOKEN = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u200C]+/gu;

const GRAMMAR_WORDS = new Set([
  "از", "اگر", "اما", "او", "این", "آن", "آنها", "ای", "است", "با", "برای", "بر", "به", "بود", "بودم", "بودی", "بودند", "بودیم", "بودید",
  "باشد", "باشند", "باشیم", "باید", "پس", "تا", "تو", "چرا", "چون", "چه", "خود", "در", "درباره", "را", "روی", "زیر", "سپس", "شما",
  "که", "کی", "ما", "من", "میان", "نه", "نیز", "نیست", "نیستم", "نیستند", "هست", "هستم", "هستی", "هستند", "هستیم", "هستید", "هم", "همه", "هر", "هیچ", "و", "ولی", "یا", "یک",
  "بعد", "قبل", "هنوز", "فقط", "حتی", "دیگر", "وقتی", "اگرچه", "بنابراین", "زیرا", "چطور", "چگونه", "کدام", "چقدر", "چند", "نیستی", "نیستیم", "نیستید", "باشم", "باشی", "باشید",
  "رو", "یه", "چی", "اینا", "اونا", "اینو", "اونو", "همون", "همین", "دیگه", "واسه", "توی",
  "همچنین", "همان", "اون", "آنجا", "اینجا", "چیزی", "کسی", "یکی", "یکدیگر", "خودم", "خودت", "خودش", "خودمان", "خودتان", "خودشان", "برایم", "برایت", "برایش", "برایمان", "برایتان", "برایشان",
  "نبود", "نبودم", "نبودی", "نبودیم", "نبودید", "نبودند", "نباشد", "نباشم", "نباشی", "نباشیم", "نباشید", "نباشند",
  "شده", "شد", "شدم", "شدی", "شدیم", "شدید", "شدند", "شود", "شوم", "شوی", "شویم", "شوید", "شوند",
  "شدهام", "شدهای", "شدهاست", "شدهایم", "شدهاید", "شدهاند",
  // Basic numerals and productive counters provide concrete question details;
  // they are grammatical scaffolding rather than the lesson's lexical focus.
  "صفر", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده", "بیست", "صد", "هزار", "میلیون",
  "نفر", "تا", "بار",
]);

const PRESENT_STEMS: Record<string, string[]> = {
  "آمدن": ["آی"], "آوردن": ["آور"], "بردن": ["بر"], "بودن": ["باش", "هست"], "توانستن": ["توان"], "خوردن": ["خور"],
  "خواستن": ["خواه"], "خواندن": ["خوان"], "خریدن": ["خر"], "داشتن": ["دار"], "دانستن": ["دان"], "دادن": ["ده"], "دیدن": ["بین"],
  "رفتن": ["رو"], "رسیدن": ["رس"], "ساختن": ["ساز"], "شدن": ["شو"], "کردن": ["کن"], "گرفتن": ["گیر"],
  "گفتن": ["گو"], "نشستن": ["نشین"], "نوشتن": ["نویس"],
  "فهمیدن": ["فهم"], "خوابیدن": ["خواب"], "ایستادن": ["ایست"], "ماندن": ["مان"],
  "پوشیدن": ["پوش"], "شنیدن": ["شنو"], "پرسیدن": ["پرس"], "فروختن": ["فروش"], "فرستادن": ["فرست"],
  "یافتن": ["یاب"], "زدن": ["زن"], "گذشتن": ["گذر"], "گذاشتن": ["گذار"], "پرداختن": ["پرداز"],
  "گشتن":["گرد"], "برگشتن":["برگرد"], "بازگشتن":["بازگرد"],
  // Present stems explicitly recorded in the course's dictionary entries.
  "ریختن":["ریز"], "افتادن":["افت"], "بستن":["بند"], "شکستن":["شکن"],
};

// Additional infinitives attested in the course catalog. This only licenses
// past-stem inflections of SELECTED entries, not guessed present stems or
// arbitrary nouns ending in ن. Present stems still require a known mapping/hint.
const COURSE_PAST_LEMMAS = new Set([
  'برداشتن','بستن','پختن','برگرداندن','شکستن','کشتن','پیوستن','شناختن',
  'افتادن','انداختن','ریختن','مردن','سوختن','افزودن','لرزاندن','باختن',
  'درگذشتن','کاشتن','ربودن','رساندن','گذراندن','گنجاندن','نداشتن',
  'برآمدن','کاستن','سوزاندن','پذیرفتن','بافتن','شمردن','درآوردن',
  'واداشتن','دریافتن','نمودن','گشودن','نهادن','آزمودن','چرخاندن',
  'فراخواندن','سپردن','درخشیدن','ستودن','آویختن','آموختن','زیستن',
  'برانگیختن','انباشتن','راندن','فرمودن','برشمردن','برخاستن','انگاشتن',
  'شکاندن','دوختن','شتافتن',
]);

// Explicit attested spoken forms only; never globally replace letters.
const SPOKEN_FORMS: Record<string,string> = {
  "خونه":"خانه", "خونهها":"خانهها", "اونا":"آنها", "اینا":"اینها",
};
const SPOKEN_VERBS: Record<string,string[]> = {
  "رفتن":["میرم","میری","میره","میریم","میرین","میرن"],
  "آمدن":["میام","میای","میاد","میایم","میاین","میان","اومدم","اومدی","اومد","اومدیم","اومدین","اومدن"],
  "خواستن":["میخوام","میخوای","میخواد","میخوایم","میخواین","میخوان"],
  "گفتن":["میگم","میگی","میگه","میگیم","میگین","میگن"],
  "شدن":["میشم","میشی","میشه","میشیم","میشین","میشن"],
  "دادن":["میدم","میدی","میده","میدیم","میدین","میدن"],
};

const VERB_ENDINGS = ["", "م", "ی", "د", "یم", "ید", "ند", "ه", "هام", "های", "هایم", "هاید", "هاند"];
const NOMINAL_SUFFIXES = ["هایمان", "هایتان", "هایشان", "هایم", "هایت", "هایش", "هایی", "های", "ها", "مان", "تان", "شان", "اند", "ام", "ات", "اش", "ان", "ای", "ی", "م", "ت", "ش"];

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يىك]/gu, (character) => ARABIC_TO_PERSIAN[character] ?? character)
    .replace(/[\u064b-\u065f\u0670\u200c\s]+/gu, "");
}

function tokens(value: string) {
  return value.replace(/[\u064b-\u065f\u0670]/gu, "").replace(/ـ/gu,'').replace(/(^|\s)(ن?می)\s+(?=[\u0600-\u06ff])/gu,'$1$2‌').match(PERSIAN_TOKEN)?.map(normalize).filter(Boolean) ?? [];
}

function withoutVerbPrefix(token: string) {
  if (token.startsWith("نمی") && token.length > 3) return token.slice(3);
  if (token.startsWith("می") && token.length > 2) return token.slice(2);
  if (token.startsWith("ب") && token.length > 2) return token.slice(1);
  if (token.startsWith("ن") && token.length > 2) return token.slice(1);
  return token;
}

function matchesStem(token: string, stem: string) {
  // ن and ب can be part of the stem itself (نوشت، نشین، برد).
  // Check the intact form as well as the possible grammatical prefix.
  const candidates = [token, withoutVerbPrefix(token)];
  if(candidates.some(candidate => VERB_ENDINGS.some((ending) => candidate === `${stem}${ending}`)))return true;
  // In prefixed verbs the aspect marker follows the preverb: برمی‌گردد.
  for(const preverb of ['بر','باز','فرا','وا']){
    if(stem.startsWith(preverb)&&stem.length>preverb.length+1){
      const bare=stem.slice(preverb.length);
      if(['می','نمی'].some(prefix=>VERB_ENDINGS.some(ending=>token===`${preverb}${prefix}${bare}${ending}`)))return true;
    }
  }
  return false;
}

function nominalBases(token: string) {
  const bases = new Set([token]);
  for (const suffix of NOMINAL_SUFFIXES) {
    if (token.endsWith(suffix) && token.length > suffix.length + 1) bases.add(token.slice(0, -suffix.length));
  }
  // A linking ی precedes possessives after a final vowel: زانو → زانویش.
  // Require the actual vowel-final base; never strip ی from arbitrary nouns.
  for (const suffix of ['م','ت','ش','مان','تان','شان']) {
    if (token.endsWith(`ی${suffix}`)) {
      const base = token.slice(0, -(suffix.length + 1));
      if (base.length > 1 && /[او]$/u.test(base)) bases.add(base);
    }
  }
  return bases;
}

export function unselectedContentWords(text: string, selectedVocabulary: string[]) {
  // ChiMishe stores verb metadata as "خواندَن (خوان)". The parenthesis is
  // a present-stem hint, NOT another word in the compound verb.
  const selectedItems = selectedVocabulary.flatMap(value=>value.replace(/\([^)]*\)/gu,'').split(/[،؛/]/u).map(tokens)).filter(item=>item.length);
  const selectedTokens = new Set(selectedVocabulary.flatMap(tokens));
  // Joined/spaced dictionary spellings are equivalent (خانه‌دار / خانه دار).
  // Only join complete selected entries, never arbitrary passage words.
  for (const item of selectedItems) selectedTokens.add(item.join(''));
  const standaloneVerbs = new Set(selectedItems.filter((item) => item.length === 1 && item[0].endsWith("ن")).map((item) => item[0]));
  const licensedCompounds = new Set(selectedItems
    .filter((item) => item.length > 1 && item.at(-1)?.endsWith("ن"))
    .map((item) => `${item.at(-2)}|${item.at(-1)}`));
  const verbStems = new Map<string, Set<string>>();

  const stemHints=new Map<string,string[]>();
  for(const value of selectedVocabulary){
    const main=tokens(value.replace(/\([^)]*\)/gu,''));
    const lemma=main.at(-1);
    const hint=value.match(/\(([^)]+)\)/u)?.[1];
    if(lemma?.endsWith('ن')&&hint&&main.length&&tokens(hint).length===1)stemHints.set(lemma,tokens(hint));
  }

  for (const token of selectedTokens) {
    if (!PRESENT_STEMS[token] && !stemHints.has(token) && !COURSE_PAST_LEMMAS.has(token) && !token.endsWith("یدن")) continue;
    verbStems.set(token, new Set([token.slice(0, -1), ...(PRESENT_STEMS[token] ?? stemHints.get(token) ?? [])]));
  }

  const unknown = new Set<string>();
  // Do not let compound recognition cross a sentence/clause boundary.
  for (const clause of text.split(/[.!?؟؛،\n]/u)) {
  const passageTokens = tokens(clause);
  for (const [index, token] of passageTokens.entries()) {
    if (GRAMMAR_WORDS.has(token) || selectedTokens.has(token)) continue;
    // The existing copula/auxiliary allowance also applies with aspect/negation.
    // Do not generalize this to lexical verbs such as رفتن or داشتن.
    if (['می','نمی'].some(prefix => token.startsWith(prefix)
      && /^(بود|باش|شد|شو)/u.test(token.slice(prefix.length))
      && GRAMMAR_WORDS.has(token.slice(prefix.length)))) continue;
    if (SPOKEN_FORMS[token] && selectedTokens.has(SPOKEN_FORMS[token])) continue;
    if ([...nominalBases(token)].some((base) => selectedTokens.has(base))) continue;
    const verbLemma = [...verbStems].find(([lemma, stems]) => [...stems].some((stem) => matchesStem(token, stem)) || (SPOKEN_VERBS[lemma]??[]).some(form=>token===form||token===`ن${form}`))?.[0];
    if (verbLemma) {
      if (standaloneVerbs.has(verbLemma)) continue;
      // The object marker can intervene: تصمیم را گرفت. It does not
      // introduce a new verb, but arbitrary intervening words must not
      // license a different light-verb use elsewhere in the sentence.
      const previousIndex = passageTokens[index - 1] === 'را' ? index - 2 : index - 1;
      const previous = passageTokens[previousIndex] ?? "";
      const licensed = [...nominalBases(previous)].some((base) => licensedCompounds.has(`${base}|${verbLemma}`));
      if (licensed) continue;
      // Report the actual surface form, not an invented previous-word compound.
      unknown.add(token);
      continue;
    }
    unknown.add(token);
  }
  }
  return [...unknown];
}
