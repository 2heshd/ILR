import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const { text } = (await request.json()) as { text?: string };
  if (!text || text.length > 4096) {
    return Response.json({ error: "Invalid text." }, { status: 400 });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audio = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input: text,
      instructions: "Speak in natural educated Iranian Persian at normal broadcast pace. Do not exaggerate pronunciation or pause unnaturally between words.",
      response_format: "mp3",
    });
    return new Response(await audio.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Speech generation failed." }, { status: 500 });
  }
}
