// Entries may be backdated within a member's first accounting month.
export function eligibleForMonth(joinedAt, month) { return joinedAt.slice(0,7) <= month; }
// Currency allocation uses integer paisa and largest remainders, so totals reconcile exactly.
export function allocate(total, weights) {
 const sum=weights.reduce((a,b)=>a+b,0); if(!sum)return weights.map(()=>0);
 const cents=Math.round(total*100); const raw=weights.map(w=>cents*w/sum); const result=raw.map(Math.floor);
 let left=cents-result.reduce((a,b)=>a+b,0);
 const order=raw.map((v,i)=>({i,r:v-result[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
 for(let i=0;i<left;i++)result[order[i].i]++;
 return result.map(v=>v/100);
}
export function calculate(data,month){
 const members=data.members.filter(m=>eligibleForMonth(m.joinedAt,month));
 const meals=data.meals.filter(x=>x.date.startsWith(month)); const expenses=data.expenses.filter(x=>x.date.startsWith(month)); const deposits=data.deposits.filter(x=>x.date.startsWith(month));
 const round=n=>Math.round(n*100)/100;
 const counts=members.map(m=>meals.filter(x=>x.memberId===m.id).reduce((s,x)=>s+x.breakfast+x.lunch+x.dinner,0));
 const totalMeals=counts.reduce((a,b)=>a+b,0), foodExpenses=round(expenses.filter(x=>x.category==='food').reduce((s,x)=>s+x.amount,0)),sharedExpenses=round(expenses.filter(x=>x.category!=='food').reduce((s,x)=>s+x.amount,0));
 const food=allocate(foodExpenses,counts),shared=allocate(sharedExpenses,members.map(()=>1));
 const statements=members.map((m,i)=>{const paid=round(deposits.filter(x=>x.memberId===m.id).reduce((s,x)=>s+x.amount,0));const cost=round(food[i]+shared[i]);return {memberId:m.id,meals:counts[i],foodCost:food[i],sharedCost:shared[i],totalCost:cost,deposits:paid,balance:round(paid-cost)};});
 const totalDeposits=round(deposits.reduce((s,x)=>s+x.amount,0)),totalExpenses=round(foodExpenses+sharedExpenses);
 return {totalMeals,foodExpenses,sharedExpenses,totalExpenses,totalDeposits,fund:round(totalDeposits-totalExpenses),mealRate:totalMeals?foodExpenses/totalMeals:0,unallocatedFood:totalMeals?0:foodExpenses,statements};
}
