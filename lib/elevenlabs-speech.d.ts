export type ElevenLabsCharacterAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type TimedWord = { word: string; start: number; end: number };

export class ElevenLabsSpeechError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export function elevenLabsSpeechConfigured(): boolean;
export function createElevenLabsSpeech(text: string, signal: AbortSignal): Promise<Buffer>;
export function createElevenLabsSpeechWithTimestamps(text: string, signal: AbortSignal): Promise<{
  audio: Buffer;
  alignment: ElevenLabsCharacterAlignment;
}>;
export function characterAlignmentToWords(alignment: ElevenLabsCharacterAlignment | null | undefined): TimedWord[];
export function elevenLabsErrorResponse(error: unknown, fallback: string): Response;
