export type PersianVoiceRegion = "tehran" | "mashhad" | "isfahan" | "shiraz" | "babol" | "ardabil";
export type PersianVoiceGender = "male" | "female";
export type PersianVoiceProfileId = `${PersianVoiceRegion}-${PersianVoiceGender}`;

export type PersianVoiceRegionOption = {
  id: PersianVoiceRegion;
  label: string;
  accentTag: string;
  coachAccent: string;
  experimental: boolean;
};

export type PersianVoiceGenderOption = {
  id: PersianVoiceGender;
  label: string;
  name: string;
};

export const PERSIAN_VOICE_REGIONS: PersianVoiceRegionOption[];
export const PERSIAN_VOICE_GENDERS: PersianVoiceGenderOption[];
export const DEFAULT_PERSIAN_VOICE_PROFILE: PersianVoiceProfileId;

export function normalizePersianVoiceProfile(value: unknown): PersianVoiceProfileId;
export function persianVoiceProfile(value: unknown): {
  id: PersianVoiceProfileId;
  regionId: PersianVoiceRegion;
  regionLabel: string;
  gender: PersianVoiceGender;
  genderLabel: string;
  name: string;
  accentTag: string;
  coachAccent: string;
  experimental: boolean;
};
