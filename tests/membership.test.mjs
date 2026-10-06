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

test('pending accounts do not share expenses and archived membership preserves previous months',()=>{
const data={members:[{id:'active',joinedAt:'2026-01-01'},{id:'pending',joinedAt:'2026-01-01',status:'pending',periods:[]},{id:'left',joinedAt:'2026-01-01',status:'deleted',periods:[{start:'2026-01-01',end:'2026-10-06'}]}],meals:[],deposits:[],expenses:[{date:'2026-10-01',category:'gas',amount:100},{date:'2026-11-01',category:'gas',amount:100}]};const october=calculate(data,'2026-10'),november=calculate(data,'2026-11');assert.equal(october.statements.length,2);assert.equal(october.statements[0].sharedCost,50);assert.equal(november.statements.length,1);assert.equal(november.statements[0].sharedCost,100);
});

test('recorded future meals and deposits still reconcile after member removal without new shared charges',()=>{const data={members:[{id:'owner',joinedAt:'2026-01-01'},{id:'left',joinedAt:'2026-01-01',status:'deleted',periods:[{start:'2026-01-01',end:'2026-10-06'}]}],meals:[{memberId:'left',date:'2026-11-01',breakfast:1,lunch:1,dinner:0}],deposits:[{memberId:'left',date:'2026-11-01',amount:200}],expenses:[{date:'2026-11-01',category:'food',amount:100},{date:'2026-11-01',category:'gas',amount:50}]};const summary=calculate(data,'2026-11');assert.equal(summary.totalMeals,2);assert.equal(summary.statements.find(s=>s.memberId==='left').sharedCost,0);assert.equal(summary.statements.reduce((n,s)=>n+s.deposits,0),summary.totalDeposits);assert.equal(summary.statements.reduce((n,s)=>n+s.totalCost,0),summary.totalExpenses);});
