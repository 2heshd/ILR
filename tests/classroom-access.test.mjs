import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canManageClasses,CLASSROOM_OWNER_ID} from '../lib/classroom-access.ts';
test('only the verified account ID authorizes classroom controls',()=>{
 assert.equal(canManageClasses({id:CLASSROOM_OWNER_ID}),true);
 for(const user of [null,undefined,{id:'other',username:'2heshd'},{id:'other',user_metadata:{username:'2heshd'}},{id:''}])assert.equal(canManageClasses(user),false);
});
test('classroom restriction covers database writes and both report functions',()=>{
 const sql=readFileSync(new URL('../db/013_classroom_owner_only.sql',import.meta.url),'utf8');
 assert.ok(sql.includes(CLASSROOM_OWNER_ID));assert.match(sql,/as restrictive for all to authenticated/);
 assert.match(sql,/with check\(public.learning_can_manage_classes\(\)\)/);
 assert.match(sql,/learning_class_report\(uuid\)/);assert.match(sql,/learning_class_comprehension_report\(uuid\)/);
 assert.match(sql,/if not public.learning_can_manage_classes\(\) or not exists/);
});
