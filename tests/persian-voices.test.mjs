import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSIAN_VOICE_GENDERS,
  PERSIAN_VOICE_REGIONS,
  accentDirectedSpeechText,
  normalizePersianVoiceProfile,
  persianVoiceProfile,
  stripSpeechDirectionFromAlignment,
} from '../lib/persian-voices.js';

test('six regions and two genders produce twelve safe voice profiles',()=>{
  assert.equal(PERSIAN_VOICE_REGIONS.length,6);
  assert.equal(PERSIAN_VOICE_GENDERS.length,2);
  const profiles=PERSIAN_VOICE_REGIONS.flatMap(region=>PERSIAN_VOICE_GENDERS.map(gender=>normalizePersianVoiceProfile(`${region.id}-${gender.id}`)));
  assert.equal(new Set(profiles).size,12);
});

test('regional profiles keep gender voice selection separate from accent direction',()=>{
  const profile=persianVoiceProfile('ardabil-female');
  assert.equal(profile.gender,'female');
  assert.equal(profile.regionLabel,'Ardabil');
  assert.match(profile.accentTag,/Ardebili/);
  assert.equal(profile.experimental,true);
});

test('accent directions are removed from ElevenLabs caption alignment',()=>{
  assert.deepEqual(accentDirectedSpeechText('سلام','tehran-female'),{text:'سلام',prefix:''});
  const directed=accentDirectedSpeechText('سلام دنیا','shiraz-male');
  assert.match(directed.text,/^\[strong Shirazi Iranian Persian accent\] /);
  const characters=[...directed.text];
  const alignment={
    characters,
    character_start_times_seconds:characters.map((_,index)=>index/10),
    character_end_times_seconds:characters.map((_,index)=>(index+1)/10),
  };
  const stripped=stripSpeechDirectionFromAlignment(alignment,directed.prefix);
  assert.equal(stripped.characters.join(''),'سلام دنیا');
  assert.equal(stripped.character_start_times_seconds[0],directed.prefix.length/10);
});
