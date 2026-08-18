import { normalizePersian } from "./persian";

export type AdvancedWord = {
  displayForm: string;
  definition: string;
  romanization: string;
  topic: string;
};

const FALLBACK_ADVANCED: AdvancedWord[] = [
  { displayForm: "تحریم", definition: "sanction", romanization: "tahrim", topic: "diplomacy" },
  { displayForm: "مذاکره", definition: "negotiation", romanization: "mozākere", topic: "diplomacy" },
  { displayForm: "توافق", definition: "agreement", romanization: "tavāfoq", topic: "diplomacy" },
  { displayForm: "قطعنامه", definition: "resolution", romanization: "qat'nāme", topic: "international relations" },
  { displayForm: "حاکمیت", definition: "sovereignty / governance", romanization: "hākemiyat", topic: "government" },
  { displayForm: "ائتلاف", definition: "coalition", romanization: "etelāf", topic: "politics" },
  { displayForm: "بودجه", definition: "budget", romanization: "budje", topic: "economics" },
  { displayForm: "تورم", definition: "inflation", romanization: "tavarram", topic: "economics" },
  { displayForm: "نرخ بهره", definition: "interest rate", romanization: "nerkh-e bahre", topic: "economics" },
  { displayForm: "صادرات", definition: "exports", romanization: "sāderāt", topic: "economics" },
  { displayForm: "واردات", definition: "imports", romanization: "vāredāt", topic: "economics" },
  { displayForm: "بازدارندگی", definition: "deterrence", romanization: "bāzdārandegi", topic: "security" },
  { displayForm: "دیپلماسی", definition: "diplomacy", romanization: "diplomāsi", topic: "diplomacy" },
  { displayForm: "سیاست‌گذاری", definition: "policymaking", romanization: "siyāsat-gozāri", topic: "government" },
  { displayForm: "قوه قضائیه", definition: "judiciary", romanization: "qovve-ye qazā'iye", topic: "law" },
  { displayForm: "اصلاحات", definition: "reforms", romanization: "eslāhāt", topic: "politics" },
  { displayForm: "همه‌پرسی", definition: "referendum", romanization: "hame-porsi", topic: "politics" },
  { displayForm: "نماینده", definition: "representative", romanization: "namāyande", topic: "politics" },
  { displayForm: "منافع ملی", definition: "national interests", romanization: "manāfe'-e melli", topic: "international relations" },
  { displayForm: "مشروعیت", definition: "legitimacy", romanization: "mashru'iyat", topic: "government" },
  { displayForm: "دکترین", definition: "doctrine", romanization: "doktrin", topic: "security" },
  { displayForm: "تنش‌زدایی", definition: "de-escalation / détente", romanization: "tanesh-zodāyi", topic: "diplomacy" },
  { displayForm: "موازنه قوا", definition: "balance of power", romanization: "movāzene-ye qovā", topic: "international relations" },
  { displayForm: "تمامیت ارضی", definition: "territorial integrity", romanization: "tamāmiyat-e arzi", topic: "international relations" },
  { displayForm: "بازنگری", definition: "revision / review", romanization: "bāznegari", topic: "policy" },
  { displayForm: "اختیارات", definition: "authorities / powers", romanization: "ekhtiyārāt", topic: "government" },
  { displayForm: "اجرایی", definition: "executive / implementation-related", romanization: "ejrāyi", topic: "government" },
  { displayForm: "قانون‌گذاری", definition: "legislation / lawmaking", romanization: "qānun-gozāri", topic: "law" },
  { displayForm: "نظارت", definition: "oversight / supervision", romanization: "nezārat", topic: "government" },
  { displayForm: "شفافیت", definition: "transparency", romanization: "shafāfiyat", topic: "government" },
  { displayForm: "پاسخگویی", definition: "accountability", romanization: "pāsokhguyi", topic: "government" },
  { displayForm: "کسری بودجه", definition: "budget deficit", romanization: "kasri-ye budje", topic: "economics" },
  { displayForm: "رکود", definition: "recession / stagnation", romanization: "rokud", topic: "economics" },
  { displayForm: "رشد اقتصادی", definition: "economic growth", romanization: "roshd-e eqtesādi", topic: "economics" },
  { displayForm: "بهره‌وری", definition: "productivity", romanization: "bahre-vari", topic: "economics" },
  { displayForm: "سرمایه‌گذاری", definition: "investment", romanization: "sarmāye-gozāri", topic: "economics" },
  { displayForm: "زنجیره تأمین", definition: "supply chain", romanization: "zanjire-ye ta'min", topic: "economics" },
  { displayForm: "محدودیت", definition: "restriction / limitation", romanization: "mahdudiyat", topic: "policy" },
  { displayForm: "تهدید", definition: "threat", romanization: "tahdid", topic: "security" },
  { displayForm: "آتش‌بس", definition: "ceasefire", romanization: "ātash-bas", topic: "security" }
];

export function fallbackAdvanced(existing: Set<string>, count = 5): AdvancedWord[] {
  return FALLBACK_ADVANCED.filter((w) => !existing.has(normalizePersian(w.displayForm))).slice(0, count);
}
