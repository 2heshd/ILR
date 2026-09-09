import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('both audio routes disable retries and share a bounded cancellation signal',()=>{
  for(const route of ['speech','speech-timings']){
    const source=readFileSync(new URL(`../app/api/${route}/route.ts`,import.meta.url),'utf8');
    assert.match(source,/timeout: 20_000, maxRetries: 0/);
    assert.match(source,/AbortSignal.any\(\[request.signal, AbortSignal.timeout\(20_000\)\]\)/);
    assert.equal((source.match(/\}, \{ signal \}\)/g)||[]).length,route==='speech'?1:2);
    assert.match(source,/status: 504/);
  }
});
