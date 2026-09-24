import OpenAI from "openai";
import { createElevenLabsSpeech, elevenLabsErrorResponse, elevenLabsSpeechConfigured, normalizeElevenLabsVoice } from "@/lib/elevenlabs-speech";
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
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);

  try {
    if (elevenLabsSpeechConfigured(voice)) {
      const audio = await createElevenLabsSpeech(speechText, signal, voice);
      return new Response(Uint8Array.from(audio), {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=604800", "X-Speech-Provider": "elevenlabs", "X-Speech-Voice": voice },
      });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
    const audio = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: profile.gender === "female" ? "marin" : "cedar",
      input: speechText,
      instructions: `Read only the supplied Persian text. Speak with ${profile.coachAccent} at a clear, slightly slower-than-normal pace for an intermediate learner. Keep natural Iranian Persian phrasing and rhythm. Never describe punctuation, say the words dot or ellipsis, translate the text, or add commentary.`,
      speed: 0.88,
      response_format: "mp3",
    }, { signal });
    return new Response(await audio.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=604800" },
    });
  } catch (error) {
    if (signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError) {
      return Response.json({ error: "Audio took too long. Your practice is unchanged; please try again." }, { status: 504 });
    }
    console.error(error);
    if (elevenLabsSpeechConfigured(voice)) return elevenLabsErrorResponse(error, "Speech generation failed.");
    return openAiErrorResponse(error, "Speech generation failed.");
  }
}
