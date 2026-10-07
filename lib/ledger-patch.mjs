import {calculate} from './calculation.mjs';
// Merge only authoritative records returned after a successful server commit.
export function applyLedgerPatch(data,patch,month){
 const next={...data};
 for(const key of ['members','meals','expenses','deposits','requests']){
  const removed=new Set(patch.removed?.[key]||[]),updated=new Map((patch[key]||[]).map(row=>[row.id,row]));
  next[key]=[...(data[key]||[]).filter(row=>!removed.has(row.id)&&!updated.has(row.id)),...updated.values()];
 }
 next.user=patch.user||data.user;
 if(next.user.role!=='member')next.summary=calculate(next,month);
 return next;
}
