const DEFAULT_MODEL = "eleven_v3";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_VOICE = "male";

export class ElevenLabsSpeechError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ElevenLabsSpeechError";
    this.status = status;
  }
}

export function normalizeElevenLabsVoice(voice) {
  return voice === "female" ? "female" : DEFAULT_VOICE;
}

export function elevenLabsVoiceId(voice = DEFAULT_VOICE) {
  return normalizeElevenLabsVoice(voice) === "female"
    ? process.env.ELEVENLABS_FEMALE_VOICE_ID
    : process.env.ELEVENLABS_VOICE_ID;
}

export function elevenLabsSpeechConfigured(voice = DEFAULT_VOICE) {
  return Boolean(process.env.ELEVENLABS_API_KEY && elevenLabsVoiceId(voice));
}

function speechUrl(withTimestamps, voice) {
  const voiceId = elevenLabsVoiceId(voice);
  if (!process.env.ELEVENLABS_API_KEY || !voiceId) {
    throw new ElevenLabsSpeechError("ElevenLabs speech is not configured.", 503);
  }
  const suffix = withTimestamps ? "/with-timestamps" : "";
  return `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}${suffix}?output_format=${DEFAULT_OUTPUT_FORMAT}`;
}

async function elevenLabsRequest(text, withTimestamps, signal, voice) {
  const response = await fetch(speechUrl(withTimestamps, voice), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
      language_code: "fa",
    }),
  });

  if (!response.ok) {
    throw new ElevenLabsSpeechError("ElevenLabs speech generation failed.", response.status);
  }
  return response;
}

export async function createElevenLabsSpeech(text, signal, voice = DEFAULT_VOICE) {
  const response = await elevenLabsRequest(text, false, signal, voice);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 500) throw new ElevenLabsSpeechError("ElevenLabs returned an empty audio file.", 502);
  return audio;
}

export async function createElevenLabsSpeechWithTimestamps(text, signal, voice = DEFAULT_VOICE) {
  const response = await elevenLabsRequest(text, true, signal, voice);
  const data = await response.json();
  if (typeof data.audio_base64 !== "string" || !data.alignment) {
    throw new ElevenLabsSpeechError("ElevenLabs returned incomplete timing data.", 502);
  }
  const audio = Buffer.from(data.audio_base64, "base64");
  if (audio.length < 500) throw new ElevenLabsSpeechError("ElevenLabs returned an empty audio file.", 502);
  return { audio, alignment: data.alignment };
}

const WORD_CHARACTER = /[\p{L}\p{M}\p{N}\u200c]/u;

export function characterAlignmentToWords(alignment) {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)
    || characters.length !== starts.length || characters.length !== ends.length) return [];

  const words = [];
  let word = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (word) words.push({ word, start, end });
    word = "";
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = String(characters[index] ?? "");
    const characterStart = Number(starts[index]);
    const characterEnd = Number(ends[index]);
    if (!WORD_CHARACTER.test(character) || !Number.isFinite(characterStart) || !Number.isFinite(characterEnd)) {
      flush();
      continue;
    }
    if (!word) start = characterStart;
    word += character;
    end = characterEnd;
  }
  flush();
  return words;
}

export function elevenLabsErrorResponse(error, fallback) {
  const status = error instanceof ElevenLabsSpeechError ? error.status : 500;
  if (status === 401) return Response.json({ error: "The ElevenLabs API key was rejected." }, { status });
  if (status === 402) return Response.json({ error: "ElevenLabs credits are empty. Add credits, then try again." }, { status });
  if (status === 429) return Response.json({ error: "ElevenLabs is rate-limiting audio. Wait briefly and try again." }, { status });
  if (status === 422) return Response.json({ error: "The configured ElevenLabs voice or model could not render this Persian text." }, { status });
  return Response.json({ error: fallback }, { status: status >= 400 && status < 600 ? status : 500 });
}
