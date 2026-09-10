import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('review words leave room for Persian glyph overhangs',()=>{
  const css=fs.readFileSync(new URL('../app/overrides.css',import.meta.url),'utf8');
  const rule=css.slice(css.lastIndexOf('.today-grid .dashboard-primary .hero-fa'));
  assert.match(rule,/padding:\.2em \.34em \.3em/);
  assert.match(rule,/text-align:center/);
  assert.match(rule,/overflow:visible/);
  assert.match(rule,/overflow-wrap:anywhere/);
});
