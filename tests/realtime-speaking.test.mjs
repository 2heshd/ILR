import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('live speaking uses the current Realtime WebRTC flow without exposing the API key',()=>{
  const route=readFileSync(new URL('../app/api/realtime-session/route.ts',import.meta.url),'utf8');
  const component=readFileSync(new URL('../components/SpeakingLab.tsx',import.meta.url),'utf8');
  assert.match(route,/gpt-realtime-2\.1/);
  assert.match(route,/\/v1\/realtime\/calls/);
  assert.match(route,/Authorization: `Bearer \$\{process\.env\.OPENAI_API_KEY\}`/);
  assert.match(route,/semantic_vad/);
  assert.match(route,/gpt-4o-mini-transcribe/);
  assert.match(route,/native Iranian Persian conversation partner/);
  assert.match(component,/new RTCPeerConnection\(\)/);
  assert.match(component,/getUserMedia/);
  assert.match(component,/response\.output_audio_transcript\.done/);
  assert.match(component,/conversation\.item\.input_audio_transcription\.completed/);
  assert.doesNotMatch(component,/OPENAI_API_KEY/);
});

test('speaking is conversation coaching rather than a one-shot recording grade',()=>{
  const component=readFileSync(new URL('../components/SpeakingLab.tsx',import.meta.url),'utf8');
  assert.match(component,/Live conversation coach/);
  assert.match(component,/grammar, word choice, rhythm, and pronunciation/);
  assert.match(component,/End &amp; save/);
  assert.doesNotMatch(component,/Get feedback/);
  assert.doesNotMatch(component,/MediaRecorder/);
});
