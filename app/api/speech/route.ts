import OpenAI from "openai";
import { openAiErrorResponse } from "@/lib/openai-error";
import { isPlayablePersianText, sanitizePersianSpeechText } from "@/lib/persian-speech";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const { text } = (await request.json()) as { text?: string };
  if (!isPlayablePersianText(text)) {
    return Response.json({ error: "A valid Persian transcript is required." }, { status: 400 });
  }
  const speechText = sanitizePersianSpeechText(text);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
    const audio = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "marin",
      input: speechText,
      instructions: "Read only the supplied Persian text. Speak in natural educated Iranian Persian at a clear, slightly slower-than-normal broadcast pace for an intermediate learner. Keep natural phrasing and rhythm. Never describe punctuation, say the words dot or ellipsis, translate the text, or add commentary.",
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
    return openAiErrorResponse(error, "Speech generation failed.");
  }
}
