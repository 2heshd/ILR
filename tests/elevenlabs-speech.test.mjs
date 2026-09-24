import test from 'node:test';
import assert from 'node:assert/strict';
import {canFallBackToOpenAiSpeech, characterAlignmentToWords, ElevenLabsSpeechError, normalizeElevenLabsVoice} from '../lib/elevenlabs-speech.js';

test('ElevenLabs character timings become exact Persian word cues',()=>{
  const characters=[...'من کتاب\u200cها را دیدم.'];
  const alignment={
    characters,
    character_start_times_seconds:characters.map((_,index)=>index/10),
    character_end_times_seconds:characters.map((_,index)=>(index+1)/10),
  };
  assert.deepEqual(characterAlignmentToWords(alignment),[
    {word:'من',start:0,end:.2},
    {word:'کتاب\u200cها',start:.3,end:1},
    {word:'را',start:1.1,end:1.3},
    {word:'دیدم',start:1.4,end:1.8},
  ]);
});

test('invalid ElevenLabs alignments are rejected',()=>{
  assert.deepEqual(characterAlignmentToWords({characters:['م'],character_start_times_seconds:[],character_end_times_seconds:[.1]}),[]);
});

test('voice choices are normalized to a safe regional profile',()=>{
  assert.equal(normalizeElevenLabsVoice('female'),'tehran-female');
  assert.equal(normalizeElevenLabsVoice('male'),'tehran-male');
  assert.equal(normalizeElevenLabsVoice('shiraz-female'),'shiraz-female');
  assert.equal(normalizeElevenLabsVoice('arbitrary-voice-id'),'tehran-male');
  assert.equal(normalizeElevenLabsVoice(undefined),'tehran-male');
});

test('provider account failures permit an independent speech provider to recover audio',()=>{
  for(const status of [401,402,403,422,429]) {
    assert.equal(canFallBackToOpenAiSpeech(new ElevenLabsSpeechError('provider failed',status)),true);
  }
  assert.equal(canFallBackToOpenAiSpeech(new ElevenLabsSpeechError('server failed',500)),false);
  assert.equal(canFallBackToOpenAiSpeech(new Error('unrelated failure')),false);
});
