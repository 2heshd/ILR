import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
test('reading and listening expose compact practice-mode selects',()=>{
 assert.equal((page.match(/aria-label="Reading practice mode"/g)||[]).length,1);
 assert.equal((page.match(/aria-label="Listening practice mode"/g)||[]).length,1);
 for(const label of ['Full text','Inference','Full audio','Gist','Rapid captions'])assert.ok(page.includes(`<option value=`)&&page.includes(`>${label}</option>`));
});
test('mode changes retain their complete reset paths',()=>{
 assert.match(page,/function changeReadingMode/);assert.match(page,/setSentenceGists\(\[\]\)/);
 assert.match(page,/function changeListeningMode/);assert.match(page,/releasePlayback\(\)/);
 for(const reset of ['setListensCount(0)','setTranscriptRevealStep(0)','setListeningGists([])','setGistSentenceListenCounts([])','setRapidCaptionListens(0)'])assert.ok(page.includes(reset));
});
