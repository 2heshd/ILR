import OpenAI, { toFile } from "openai";
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

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const speech = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "marin",
      input: speechText,
      instructions: "Read only the supplied Persian text. Speak in natural educated Iranian Persian at a clear, slightly slower-than-normal broadcast pace for an intermediate learner. Keep natural phrasing and rhythm. Never describe punctuation, translate the text, or add commentary.",
      speed: 0.88,
      response_format: "mp3",
    });
    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    const transcription = await client.audio.transcriptions.create({
      file: await toFile(audioBuffer, "persian-speech.mp3", { type: "audio/mpeg" }),
      model: "whisper-1",
      language: "fa",
      prompt: speechText.slice(0, 800) || undefined,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
      temperature: 0,
    });

    const words = (transcription.words ?? [])
      .map(({ word, start, end }) => ({ word: word.trim(), start, end }))
      .filter(({ word, start, end }) => word && Number.isFinite(start) && Number.isFinite(end) && end >= start);

    if (!words.length) {
      return Response.json({ error: "No word timestamps were detected in the audio." }, { status: 422 });
    }

    // Keep the audio binary. Base64 makes an already-large narration roughly 33%
    // larger and forces the browser to decode one enormous JSON string before it
    // can play anything. Prefix it with a tiny JSON metadata block instead.
    const metadata = Buffer.from(JSON.stringify({
      mimeType: "audio/mpeg",
      words,
      duration: transcription.duration,
    }));
    const metadataLength = Buffer.allocUnsafe(4);
    metadataLength.writeUInt32BE(metadata.length);
    const payload = Buffer.concat([metadataLength, metadata, audioBuffer]);

    return new Response(payload, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(payload.length),
        "Cache-Control": "private, max-age=604800",
      },
    });
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "Word alignment failed.");
  }
}
