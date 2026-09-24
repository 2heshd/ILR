export const PERSIAN_VOICE_REGIONS = [
  {
    id: "tehran",
    label: "Tehran",
    accentTag: "",
    coachAccent: "an educated contemporary Tehrani Iranian Persian accent",
    experimental: false,
  },
  {
    id: "mashhad",
    label: "Mashhad",
    accentTag: "strong Mashhadi Khorasani Iranian Persian accent",
    coachAccent: "a recognizable Mashhadi Khorasani Iranian Persian accent",
    experimental: true,
  },
  {
    id: "isfahan",
    label: "Isfahan",
    accentTag: "strong Esfahani Iranian Persian accent",
    coachAccent: "a recognizable Esfahani Iranian Persian accent",
    experimental: true,
  },
  {
    id: "shiraz",
    label: "Shiraz",
    accentTag: "strong Shirazi Iranian Persian accent",
    coachAccent: "a recognizable Shirazi Iranian Persian accent",
    experimental: true,
  },
  {
    id: "babol",
    label: "Babol",
    accentTag: "strong Baboli Mazandarani-influenced Iranian Persian accent",
    coachAccent: "a recognizable Baboli, Mazandarani-influenced Iranian Persian accent",
    experimental: true,
  },
  {
    id: "ardabil",
    label: "Ardabil",
    accentTag: "strong Ardebili Azerbaijani-influenced Iranian Persian accent",
    coachAccent: "a recognizable Ardebili, Azerbaijani-influenced Iranian Persian accent",
    experimental: true,
  },
];

export const PERSIAN_VOICE_GENDERS = [
  { id: "male", label: "Male", name: "Arman" },
  { id: "female", label: "Female", name: "Mina" },
];

export const DEFAULT_PERSIAN_VOICE_PROFILE = "tehran-male";

const regionById = new Map(PERSIAN_VOICE_REGIONS.map((region) => [region.id, region]));
const genderById = new Map(PERSIAN_VOICE_GENDERS.map((gender) => [gender.id, gender]));

export function normalizePersianVoiceProfile(value) {
  if (value === "female") return "tehran-female";
  if (value === "male") return DEFAULT_PERSIAN_VOICE_PROFILE;
  const [region, gender, extra] = String(value || "").split("-");
  return !extra && regionById.has(region) && genderById.has(gender)
    ? `${region}-${gender}`
    : DEFAULT_PERSIAN_VOICE_PROFILE;
}

export function persianVoiceProfile(value) {
  const id = normalizePersianVoiceProfile(value);
  const [regionId, genderId] = id.split("-");
  const region = regionById.get(regionId);
  const gender = genderById.get(genderId);
  return {
    id,
    regionId,
    regionLabel: region.label,
    gender: genderId,
    genderLabel: gender.label,
    name: gender.name,
    accentTag: region.accentTag,
    coachAccent: region.coachAccent,
    experimental: region.experimental,
  };
}

export function accentDirectedSpeechText(text, voice) {
  const profile = persianVoiceProfile(voice);
  if (!profile.accentTag) return { text, prefix: "" };
  const prefix = `[${profile.accentTag}] `;
  return { text: `${prefix}${text}`, prefix };
}

export function stripSpeechDirectionFromAlignment(alignment, prefix) {
  if (!alignment || !prefix) return alignment;
  const characters = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  if (!Array.isArray(characters) || characters.slice(0, prefix.length).join("") !== prefix) return alignment;
  return {
    ...alignment,
    characters: characters.slice(prefix.length),
    character_start_times_seconds: Array.isArray(starts) ? starts.slice(prefix.length) : starts,
    character_end_times_seconds: Array.isArray(ends) ? ends.slice(prefix.length) : ends,
  };
}
