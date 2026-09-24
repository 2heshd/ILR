import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('both audio routes share a bounded cancellation signal and prefer ElevenLabs',()=>{
  for(const route of ['speech','speech-timings']){
    const source=readFileSync(new URL(`../app/api/${route}/route.ts`,import.meta.url),'utf8');
    assert.match(source,/normalizeElevenLabsVoice\(requestedVoice\)/);
    assert.match(source,/elevenLabsSpeechConfigured\(voice\)/);
    assert.match(source,/AbortSignal.any\(\[request.signal, AbortSignal.timeout\(25_000\)\]\)/);
    assert.match(source,/status: 504/);
  }
  const provider=readFileSync(new URL('../lib/elevenlabs-speech.js',import.meta.url),'utf8');
  assert.match(provider,/model_id: process\.env\.ELEVENLABS_MODEL_ID \|\| DEFAULT_MODEL/);
  assert.match(provider,/ELEVENLABS_FEMALE_VOICE_ID/);
  assert.match(provider,/language_code: "fa"/);
  assert.match(provider,/signal,/);
  assert.match(provider,/\/with-timestamps/);
});

test('flashcards and listening wait for native server audio before device fallback',()=>{
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  const flashcard=page.slice(page.indexOf('async function playCurrentWord'),page.indexOf('async function rateKnown'));
  const listening=page.slice(page.indexOf('async function playListening'),page.indexOf('async function playGistSentence'));
  assert.match(flashcard,/cached \?\? await prepareSpeech/);
  assert.doesNotMatch(flashcard,/!cached && playWithDeviceVoice/);
  assert.match(listening,/cached \?\? await prepareSpeech/);
  assert.doesNotMatch(listening,/!cached && playWithDeviceVoice/);
  assert.equal((page.match(/aligned-regional-voice-v2-/g)||[]).length,2);
  assert.equal((page.match(/voice: persianVoice/g)||[]).length,2);
  assert.match(page,/cursos-persian-voice/);
  assert.match(page,/Persian accent region/);
  assert.match(page,/Persian voice gender/);
  assert.match(page,/Each region and gender has its own ElevenLabs voice/);
});
