import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_TTS_VOICE,TTS_VOICES,resolveTtsVoice} from '../lib/tts-voices.ts';

test('Cursos exposes exactly twelve unique studio voices',()=>{
 assert.equal(TTS_VOICES.length,12);
 assert.equal(new Set(TTS_VOICES).size,12);
 assert.ok(TTS_VOICES.includes(DEFAULT_TTS_VOICE));
});

test('speech routes reject arbitrary client voice names',()=>{
 assert.equal(resolveTtsVoice('cedar'),'cedar');
 assert.equal(resolveTtsVoice('not-a-real-voice'),DEFAULT_TTS_VOICE);
 assert.equal(resolveTtsVoice(undefined),DEFAULT_TTS_VOICE);
});
