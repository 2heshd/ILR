import { createHash } from "node:crypto";
import { openAiErrorResponse } from "@/lib/openai-error";
import { persianVoiceProfile } from "@/lib/persian-voices.js";

export const runtime = "nodejs";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";

function tutorInstructions(level: number, topic: string, accent: string) {
  return `You are a native Iranian Persian conversation partner and a precise speaking coach for a DLI learner.

Run a natural LIVE voice conversation in contemporary Iranian Persian. Use ${accent} and Iranian vocabulary, pronunciation, rhythm, and grammar—not Dari or Arabic pronunciation. Keep the regional accent recognizable but the words intelligible to a learner. The learner's target is ILR ${level}. The topic is: ${topic}.

Conversation behavior:
- Start with a brief Persian greeting and one interesting question about the topic.
- Keep your turns short: normally one to three sentences, so the learner speaks most of the time.
- Match the learner's level while still sounding like a native adult. Use everyday spoken Persian unless the topic clearly calls for a formal register.
- Ask follow-up questions, react to the meaning, and allow interruptions. Do not turn the exchange into a lecture or quiz.
- Stay primarily in Persian. Use one short English explanation only when the learner is confused or a grammar explanation would otherwise be unclear.

Coaching behavior:
- Listen to the actual audio, not only a transcript. Notice grammar, word choice, intelligibility, stress, rhythm, vowels, and consonants.
- Correct errors selectively. Do not interrupt the flow for every minor or stylistic difference.
- When an error affects meaning, sounds distinctly non-Iranian, or repeats, first respond naturally to what the learner meant. Then say «یه اصلاح کوچیک» and give the corrected Persian.
- For pronunciation, name the exact word or sound, model it slowly once and naturally once, and ask for one retry when useful. Never claim laboratory-level phonetic certainty.
- For grammar, contrast the learner's form with the corrected form and give a very short reason. Track repeated errors and revisit them later.
- Never give generic praise. Say specifically what sounded natural or improved.
- If the learner asks for an English translation or explanation, provide it briefly and return to Persian.

This is practice, not an official ILR assessment. Never invent an error you did not hear.`;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Live speaking is not configured." }, { status: 503 });
  }

  const sdp = await request.text();
  if (!sdp.startsWith("v=0") || sdp.length > 100_000) {
    return Response.json({ error: "A valid WebRTC offer is required." }, { status: 400 });
  }

  const url = new URL(request.url);
  const level = Math.max(1, Math.min(4, Number(url.searchParams.get("level")) || 1));
  const topic = String(url.searchParams.get("topic") || "everyday life").trim().slice(0, 120) || "everyday life";
  const profile = persianVoiceProfile(url.searchParams.get("voice"));
  const voice = profile.gender === "male" ? "cedar" : "marin";
  const anonymousId = String(request.headers.get("x-cursos-user") || "anonymous").slice(0, 128);
  const safetyId = createHash("sha256").update(`cursos-realtime:${anonymousId}`).digest("hex");

  const session = {
    type: "realtime",
    model: REALTIME_MODEL,
    output_modalities: ["audio"],
    instructions: tutorInstructions(level, topic, profile.coachAccent),
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe", language: "fa" },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice },
    },
  };

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": safetyId,
      },
      body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error("Realtime session failed", response.status, body.slice(0, 500));
      return Response.json({ error: "The live Persian coach could not connect." }, { status: response.status });
    }
    return new Response(body, {
      headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(error);
    return openAiErrorResponse(error, "The live Persian coach could not connect.");
  }
}
