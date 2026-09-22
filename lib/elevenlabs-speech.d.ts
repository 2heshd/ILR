export type ElevenLabsCharacterAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type TimedWord = { word: string; start: number; end: number };
export type ElevenLabsVoice = "male" | "female";

export class ElevenLabsSpeechError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export function normalizeElevenLabsVoice(voice: unknown): ElevenLabsVoice;
export function elevenLabsVoiceId(voice?: ElevenLabsVoice): string | undefined;
export function elevenLabsSpeechConfigured(voice?: ElevenLabsVoice): boolean;
export function createElevenLabsSpeech(text: string, signal: AbortSignal, voice?: ElevenLabsVoice): Promise<Buffer>;
export function createElevenLabsSpeechWithTimestamps(text: string, signal: AbortSignal, voice?: ElevenLabsVoice): Promise<{
  audio: Buffer;
  alignment: ElevenLabsCharacterAlignment;
}>;
export function characterAlignmentToWords(alignment: ElevenLabsCharacterAlignment | null | undefined): TimedWord[];
export function elevenLabsErrorResponse(error: unknown, fallback: string): Response;
