import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleForMonth,calculate} from '../lib/calculation.mjs';
test('first-month backdated deposit is included in statement and fund',()=>{
 const member={id:'owner',joinedAt:'2026-10-05T12:00:00Z'};
 assert.equal(eligibleForMonth(member.joinedAt,'2026-10'),true);
 const summary=calculate({members:[member],meals:[],expenses:[],deposits:[{memberId:'owner',date:'2026-10-01',amount:2000}]},'2026-10');
 assert.equal(summary.statements[0].deposits,2000);
 assert.equal(summary.statements[0].balance,2000);
 assert.equal(summary.fund,2000);
});
test('months before joining remain ineligible; later months are allowed',()=>{
 assert.equal(eligibleForMonth('2026-10-05','2026-09'),false);
 assert.equal(eligibleForMonth('2026-10-05','2026-11'),true);
});
