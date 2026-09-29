export const TTS_VOICES=['alloy','ash','ballad','coral','echo','nova','onyx','sage','shimmer','verse','marin','cedar'] as const;
export type TtsVoice=(typeof TTS_VOICES)[number];
export const DEFAULT_TTS_VOICE:TtsVoice='marin';
export function isTtsVoice(value:unknown):value is TtsVoice{return typeof value==='string'&&(TTS_VOICES as readonly string[]).includes(value);}
export function resolveTtsVoice(value:unknown):TtsVoice{return isTtsVoice(value)?value:DEFAULT_TTS_VOICE;}
