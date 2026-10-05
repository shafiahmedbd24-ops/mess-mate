import {NextRequest,NextResponse} from 'next/server';
import {adminAuth,db} from '@/lib/admin';
import {calculate,eligibleForMonth} from '@/lib/calculation.mjs';
import type {Member,Ledger,Role} from '@/lib/types';
export const runtime='nodejs';
const roles:Role[]=['member','manager','admin'];
async function identity(req:NextRequest){
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)throw new Error('UNAUTHORIZED');
 const decoded=await adminAuth().verifyIdToken(token,true);if(!decoded.email_verified)throw new Error('VERIFY_EMAIL');
 const ref=db().collection('members').doc(decoded.uid);
 const user=await db().runTransaction(async tx=>{const snap=await tx.get(ref);const existing=snap.data() as Member|undefined;
 if(existing)return {...existing,id:decoded.uid,role:decoded.uid===process.env.SUPER_ADMIN_UID?'super_admin':existing.role} as Member;
 const record:Member={id:decoded.uid,name:decoded.name||decoded.email?.split('@')[0]||'Member',email:decoded.email||'',role:decoded.uid===process.env.SUPER_ADMIN_UID?'super_admin':'member',joinedAt:new Date().toISOString()};tx.set(ref,record);return record;});return user;
}
function failure(e:unknown){const message=e instanceof Error?e.message:'SERVER_ERROR';const known=['UNAUTHORIZED','VERIFY_EMAIL','FORBIDDEN','INVALID_INPUT','MEMBER_NOT_FOUND','MEMBER_NOT_ELIGIBLE','ENTRY_NOT_FOUND','MEAL_CONFLICT'];return NextResponse.json({error:message==='ENTRY_NOT_FOUND'?'এন্ট্রিটি আর পাওয়া যাচ্ছে না। পেজ রিফ্রেশ করুন।':message==='MEAL_CONFLICT'?'এই সদস্য ও তারিখের মিল আগে থেকেই আছে। সেই এন্ট্রিটি এডিট করুন।':message==='MEMBER_NOT_ELIGIBLE'?'সদস্য যে মাসে যুক্ত হয়েছেন, তার আগের মাসে মিল বা জমা দেওয়া যাবে না।':message==='MEMBER_NOT_FOUND'?'নির্বাচিত সদস্যকে পাওয়া যায়নি। পেজ রিফ্রেশ করে আবার সদস্য নির্বাচন করুন।':known.includes(message)?message:'সার্ভারের সংযোগ ব্যর্থ হয়েছে। Firebase configuration পরীক্ষা করুন।'},{status:message==='UNAUTHORIZED'?401:message==='FORBIDDEN'||message==='VERIFY_EMAIL'?403:known.includes(message)?400:500});}
export async function GET(req:NextRequest){try{const user=await identity(req),month=req.nextUrl.searchParams.get('month')||new Date().toISOString().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('INVALID_INPUT');
 const names=['members','meals','expenses','deposits'] as const;const snapshots=await Promise.all(names.map(n=>db().collection(n).get()));
 const data=Object.fromEntries(names.map((n,i)=>[n,snapshots[i].docs.map(d=>({...d.data(),id:d.id}))])) as Ledger;
 const summary=calculate(data,month);if(user.role==='member')return NextResponse.json({user,members:[user],meals:data.meals.filter(x=>x.memberId===user.id&&x.date.startsWith(month)),expenses:[],deposits:data.deposits.filter(x=>x.memberId===user.id&&x.date.startsWith(month)),summary:{mealRate:summary.mealRate,statements:summary.statements.filter((x:{memberId:string})=>x.memberId===user.id)}});
 return NextResponse.json({...data,user,summary});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{const user=await identity(req);const {action,payload}=await req.json();if(user.role==='member')throw new Error('FORBIDDEN');const p=payload||{};
 if(action==='role'){if(user.role!=='super_admin')throw new Error('FORBIDDEN');if(!roles.includes(p.role)||p.memberId===process.env.SUPER_ADMIN_UID)throw new Error('INVALID_INPUT');const ref=db().collection('members').doc(p.memberId);if(!(await ref.get()).exists)throw new Error('MEMBER_NOT_FOUND');const batch=db().batch();batch.update(ref,{role:p.role});batch.set(db().collection('audit').doc(),{action,actor:user.id,target:p.memberId,role:p.role,at:new Date().toISOString()});await batch.commit();return NextResponse.json({ok:true});}
 if(action==='delete'){
  const collections={meal:'meals',expense:'expenses',deposit:'deposits'};
  if(!Object.hasOwn(collections,p.kind)||typeof p.id!=='string'||!p.id||p.id.includes('/'))throw new Error('INVALID_INPUT');
  const collection=collections[p.kind as keyof typeof collections],ref=db().collection(collection).doc(p.id);
  await db().runTransaction(async tx=>{const existing=await tx.get(ref);if(!existing.exists)throw new Error('ENTRY_NOT_FOUND');
   const before=existing.data()!;const at=new Date().toISOString();
   tx.set(db().collection('deletedEntries').doc(),{collection,originalId:ref.id,record:before,deletedBy:user.id,deletedAt:at});
   tx.delete(ref);tx.set(db().collection('audit').doc(),{action:'delete',actor:user.id,target:ref.path,at,before});
  });return NextResponse.json({ok:true});
 }
 if(!['meal','expense','deposit'].includes(action))throw new Error('INVALID_INPUT');
 if(p.id!==undefined&&(typeof p.id!=='string'||!p.id||p.id.includes('/')))throw new Error('INVALID_INPUT');
 if(typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||new Date(p.date+'T00:00:00Z').toISOString().slice(0,10)!==p.date)throw new Error('INVALID_INPUT');
 let record:Record<string,unknown>,collection:string,id:string|undefined;
 if(action==='meal'||action==='deposit'){if(typeof p.memberId!=='string')throw new Error('INVALID_INPUT');const member=await db().collection('members').doc(p.memberId).get();if(!member.exists)throw new Error('MEMBER_NOT_FOUND');if(!eligibleForMonth(member.data()!.joinedAt as string,p.date.slice(0,7)))throw new Error('MEMBER_NOT_ELIGIBLE');}
 if(action==='meal'){if(![p.breakfast,p.lunch,p.dinner].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10&&n*2===Math.round(n*2)))throw new Error('INVALID_INPUT');collection='meals';id=p.memberId+'_'+p.date;record={memberId:p.memberId,date:p.date,breakfast:p.breakfast,lunch:p.lunch,dinner:p.dinner};}
 else {if(typeof p.amount!=='number'||!Number.isFinite(p.amount)||p.amount<=0||p.amount>10000000||Math.abs(p.amount*100-Math.round(p.amount*100))>0.00001)throw new Error('INVALID_INPUT');
 if(action==='expense'){if(!['food','gas','salary','other'].includes(p.category)||typeof p.title!=='string'||!p.title.trim()||p.title.length>120)throw new Error('INVALID_INPUT');collection='expenses';record={date:p.date,amount:p.amount,category:p.category,title:p.title.trim(),createdBy:user.id};}
 else{if(typeof p.note!=='string'||p.note.length>200)throw new Error('INVALID_INPUT');collection='deposits';record={memberId:p.memberId,date:p.date,amount:p.amount,note:p.note};}}
 const ref=id?db().collection(collection).doc(id):p.id?db().collection(collection).doc(p.id):db().collection(collection).doc();
 await db().runTransaction(async tx=>{
  const oldRef=p.id?db().collection(collection).doc(p.id):ref;
  const existing=await tx.get(oldRef);if(p.id&&!existing.exists)throw new Error('ENTRY_NOT_FOUND');
  if(oldRef.path!==ref.path){const destination=await tx.get(ref);if(destination.exists)throw new Error('MEAL_CONFLICT');}
  const before=existing.data()||null;
  if(action==='expense'&&before)record.createdBy=before.createdBy;
  if(oldRef.path!==ref.path)tx.delete(oldRef);
  tx.set(ref,record);tx.set(db().collection('audit').doc(),{action:before?'edit':'create',kind:action,actor:user.id,target:ref.path,previousTarget:oldRef.path,at:new Date().toISOString(),before,record});
 });return NextResponse.json({ok:true});}catch(e){return failure(e);}}

