import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSIAN_VOICE_GENDERS,
  PERSIAN_VOICE_REGIONS,
  normalizePersianVoiceProfile,
  persianVoiceProfile,
} from '../lib/persian-voices.js';

test('six regions and two genders produce twelve safe voice profiles',()=>{
  assert.equal(PERSIAN_VOICE_REGIONS.length,6);
  assert.equal(PERSIAN_VOICE_GENDERS.length,2);
  const profiles=PERSIAN_VOICE_REGIONS.flatMap(region=>PERSIAN_VOICE_GENDERS.map(gender=>normalizePersianVoiceProfile(`${region.id}-${gender.id}`)));
  assert.equal(new Set(profiles).size,12);
});

test('regional profiles have their own voice names',()=>{
  const profile=persianVoiceProfile('ardabil-female');
  assert.equal(profile.gender,'female');
  assert.equal(profile.regionLabel,'Ardabil');
  assert.equal(profile.name,'Leyla');
  assert.match(profile.accentTag,/Ardebili/);
  assert.equal(profile.experimental,true);
});
