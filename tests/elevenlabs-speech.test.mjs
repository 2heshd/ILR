import test from 'node:test';
import assert from 'node:assert/strict';
import {characterAlignmentToWords} from '../lib/elevenlabs-speech.js';

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
