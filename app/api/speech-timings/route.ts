import OpenAI, { toFile } from "openai";
import { captionsCoverText, reconcileCaptionSpellings } from '@/lib/caption-integrity';
import { characterAlignmentToWords, createElevenLabsSpeechWithTimestamps, elevenLabsErrorResponse, elevenLabsSpeechConfigured, normalizeElevenLabsVoice } from '@/lib/elevenlabs-speech';
import { openAiErrorResponse } from "@/lib/openai-error";
import { isPlayablePersianText, sanitizePersianSpeechText } from "@/lib/persian-speech";
import { persianVoiceProfile } from "@/lib/persian-voices.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { text, voice: requestedVoice } = (await request.json()) as { text?: string; voice?: unknown };
  const voice = normalizeElevenLabsVoice(requestedVoice);
  const profile = persianVoiceProfile(voice);
  if (!elevenLabsSpeechConfigured(voice) && !process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Persian speech is not configured." }, { status: 503 });
  }

  if (!isPlayablePersianText(text)) {
    return Response.json({ error: "A valid Persian transcript is required." }, { status: 400 });
  }
  const speechText = sanitizePersianSpeechText(text);
  // One deadline spans narration AND alignment, not a new allowance per call.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);

  try {
    let audioBuffer: Buffer;
    let words: {word:string;start:number;end:number}[];
    let duration: number | undefined;
    if (elevenLabsSpeechConfigured(voice)) {
      const speech = await createElevenLabsSpeechWithTimestamps(speechText, signal, voice);
      audioBuffer = speech.audio;
      words = characterAlignmentToWords(speech.alignment);
      duration = words.at(-1)?.end;
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
      const speech = await client.audio.speech.create({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: profile.gender === "female" ? "marin" : "cedar",
        input: speechText,
        instructions: `Read only the supplied Persian text. Speak with ${profile.coachAccent} at a clear, slightly slower-than-normal pace for an intermediate learner. Keep natural Iranian Persian phrasing and rhythm. Never describe punctuation, translate the text, or add commentary.`,
        speed: 0.88,
        response_format: "mp3",
      }, { signal });
      audioBuffer = Buffer.from(await speech.arrayBuffer());
      const transcription = await client.audio.transcriptions.create({
        file: await toFile(audioBuffer, "persian-speech.mp3", { type: "audio/mpeg" }),
        model: "whisper-1",
        language: "fa",
        prompt: speechText.slice(0, 800) || undefined,
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
        temperature: 0,
      }, { signal });
      words = reconcileCaptionSpellings(speechText, (transcription.words ?? [])
        .map(({ word, start, end }) => ({ word: word.trim(), start, end }))
        .filter(({ word, start, end }) => word && Number.isFinite(start) && Number.isFinite(end) && end >= start));
      duration = transcription.duration;
    }

    if (!captionsCoverText(speechText,words)) {
      return Response.json({ error: "The captions did not match the complete transcript. Please retry, or use Full audio.",
        ...(process.env.VERCEL_ENV === 'preview' && process.env.PRACTICE_AUDIT === '1' ? {expected:speechText,words} : {}),
      }, { status: 422 });
    }

    // Keep the audio binary. Base64 makes an already-large narration roughly 33%
    // larger and forces the browser to decode one enormous JSON string before it
    // can play anything. Prefix it with a tiny JSON metadata block instead.
    const metadata = Buffer.from(JSON.stringify({
      mimeType: "audio/mpeg",
      words,
      duration,
    }));
    const metadataLength = Buffer.allocUnsafe(4);
    metadataLength.writeUInt32BE(metadata.length);
    const payload = Buffer.concat([metadataLength, metadata, audioBuffer]);

    return new Response(payload, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(payload.length),
        "Cache-Control": "private, max-age=604800",
        "X-Speech-Voice": voice,
      },
    });
  } catch (error) {
    if (signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError) {
      return Response.json({ error: "Audio alignment took too long. Your practice is unchanged; retry or use Full audio." }, { status: 504 });
    }
    console.error(error);
    if (elevenLabsSpeechConfigured(voice)) return elevenLabsErrorResponse(error, "Word alignment failed.");
    return openAiErrorResponse(error, "Word alignment failed.");
  }
}
