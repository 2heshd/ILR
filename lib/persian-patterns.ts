// Reviewed examples, not suffix-only guesses: a matching ending is not proof.
export const PERSIAN_PATTERNS=[
  {form:'ـش',rule:'A present verb stem plus ـش can form an action or result noun.',examples:['آموزش','دانش','پرسش','کوشش','کاهش','افزایش','پژوهش'],example:'پرسیدن → پرس + ش → پرسش (question)'},
  {form:'ـگی',rule:'Often forms a quality or state noun; a final ه may change before ـگی.',examples:['زندگی','خستگی','آلودگی','وابستگی','آمادگی'],example:'خسته → خستگی (tiredness)'},
  {form:'ـگاه',rule:'Can name a place associated with an activity. It is not always a place marker.',examples:['دانشگاه','آموزشگاه','فرودگاه','پایگاه','نمایشگاه','آزمایشگاه','استراحتگاه'],example:'آموزش + گاه → آموزشگاه (training center)'},
  {form:'ـگر',rule:'Often names someone who performs an activity or works in a field.',examples:['کارگر','پژوهشگر','تحلیلگر','بازیگر'],example:'پژوهش + گر → پژوهشگر (researcher)'},
  {form:'ـمند',rule:'Often describes having a quality, state, or resource.',examples:['نیازمند','علاقه‌مند','ثروتمند','هنرمند'],example:'ثروت + مند → ثروتمند (wealthy)'},
  {form:'ـناک',rule:'Often describes being full of, causing, or associated with something.',examples:['خطرناک','دردناک','ترسناک'],example:'خطر + ناک → خطرناک (dangerous)'},
  {form:'بیـ',rule:'A productive prefix meaning without or lacking.',examples:['بی‌کار','بیکار','بی‌سواد','بی‌نظم','بی‌تجربه'],example:'بی + تجربه → بی‌تجربه (inexperienced)'},
  {form:'ناـ',rule:'Can negate an adjective; do not assume every word starting نا has this prefix.',examples:['ناممکن','ناامید','نادرست','ناتوان'],example:'نا + ممکن → ناممکن (impossible)'},
  {form:'ـی',rule:'May form a relational adjective; its role depends on the whole word and context.',examples:['سیاسی','اقتصادی','اجتماعی','فرهنگی','دولتی'],example:'اقتصاد + ی → اقتصادی (economic)'},
];
const normalize=(word:string)=>word.replace(/[\s‌َُِّ]/gu,'').replace(/ك/gu,'ک').replace(/ي/gu,'ی');
export function patternHints(word:string){return PERSIAN_PATTERNS.filter(pattern=>pattern.examples.some(example=>normalize(example)===normalize(word)));}
