import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest={product:'cursos',commitSha:commit,schemaVersion:'015',contentVersion:'course-v1',createdAt:new Date().toISOString(),requiredChecks:['npm test','npm run build','preview-generation-matrix','authenticated-sync','owner-access','production-smoke']};
writeFileSync('release-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Wrote release-manifest.json for ${commit}`);
