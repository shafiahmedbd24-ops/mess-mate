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
 const record:Member={id:decoded.uid,name:decoded.name||decoded.email?.split('@')[0]||'Member',email:decoded.email||'',role:decoded.uid===process.env.SUPER_ADMIN_UID?'super_admin':'member',status:decoded.uid===process.env.SUPER_ADMIN_UID?'active':'pending',periods:decoded.uid===process.env.SUPER_ADMIN_UID?[{start:new Date().toISOString()}]:[],joinedAt:new Date().toISOString()};tx.set(ref,record);return record;});return user;
}
function failure(e:unknown){const message=e instanceof Error?e.message:'SERVER_ERROR';const known=['UNAUTHORIZED','VERIFY_EMAIL','FORBIDDEN','INVALID_INPUT','MEMBER_NOT_FOUND','MEMBER_NOT_ELIGIBLE','ENTRY_NOT_FOUND','MEAL_CONFLICT','MEMBERSHIP_REQUIRED','REQUEST_CLOSED','MEAL_CHANGED','MEAL_SHEET_CHANGED'];return NextResponse.json({error:message==='MEAL_SHEET_CHANGED'?'এই দিনের মিল অন্য কেউ পরিবর্তন করেছেন। সর্বশেষ মিল লোড করে আবার সংশোধন করুন।':message==='MEMBERSHIP_REQUIRED'?'এই সদস্য বর্তমানে মেসে যুক্ত নেই।':message==='REQUEST_CLOSED'?'রিকোয়েস্টটি ইতিমধ্যে নিষ্পত্তি হয়েছে।':message==='MEAL_CHANGED'?'রিকোয়েস্ট পাঠানোর পর এই দিনের মিল পরিবর্তন হয়েছে। রিকোয়েস্ট প্রত্যাখ্যান করে নতুন রিকোয়েস্ট নিন।':message==='ENTRY_NOT_FOUND'?'এন্ট্রিটি আর পাওয়া যাচ্ছে না। পেজ রিফ্রেশ করুন।':message==='MEAL_CONFLICT'?'এই সদস্য ও তারিখের মিল আগে থেকেই আছে। সেই এন্ট্রিটি এডিট করুন।':message==='MEMBER_NOT_ELIGIBLE'?'সদস্য যে মাসে যুক্ত হয়েছেন, তার আগের মাসে মিল বা জমা দেওয়া যাবে না।':message==='MEMBER_NOT_FOUND'?'নির্বাচিত সদস্যকে পাওয়া যায়নি। পেজ রিফ্রেশ করে আবার সদস্য নির্বাচন করুন।':known.includes(message)?message:'সার্ভারের সংযোগ ব্যর্থ হয়েছে। Firebase configuration পরীক্ষা করুন।'},{status:message==='UNAUTHORIZED'?401:message==='FORBIDDEN'||message==='VERIFY_EMAIL'?403:known.includes(message)?400:500});}
export async function GET(req:NextRequest){try{const user=await identity(req),month=req.nextUrl.searchParams.get('month')||new Date().toISOString().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('INVALID_INPUT');
 const names=['members','meals','expenses','deposits'] as const;const snapshots=await Promise.all(names.map(n=>db().collection(n).get()));
 const data=Object.fromEntries(names.map((n,i)=>[n,snapshots[i].docs.map(d=>({...d.data(),id:d.id}))])) as Ledger;
 const requestQuery=user.role==='member'||!isActive(user)?db().collection('mealRequests').where('memberId','==',user.id):db().collection('mealRequests');const requestSnap=await requestQuery.get();data.requests=requestSnap.docs.map(d=>({...d.data(),id:d.id})) as Ledger['requests'];
 if(!isActive(user))return NextResponse.json({user,members:[user],meals:[],expenses:[],deposits:[],requests:[],summary:calculate({members:[],meals:[],expenses:[],deposits:[]},month)});
 const summary=calculate(data,month);if(user.role==='member')return NextResponse.json({user,members:[user],requests:data.requests,meals:data.meals.filter(x=>x.memberId===user.id&&x.date.startsWith(month)),expenses:[],deposits:data.deposits.filter(x=>x.memberId===user.id&&x.date.startsWith(month)),summary:{mealRate:summary.mealRate,statements:summary.statements.filter((x:{memberId:string})=>x.memberId===user.id)}});
 return NextResponse.json({...data,user,summary});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{const user=await identity(req);const {action,payload}=await req.json();const p=payload||{};
 const managed=await memberAction(user,action,p);if(managed)return managed;
 if(!isActive(user))throw new Error('MEMBERSHIP_REQUIRED');if(user.role==='member')throw new Error('FORBIDDEN');
 if(action==='mealsBulk')return await saveDailyMeals(user,p);
 if(action==='role'){if(user.role!=='super_admin')throw new Error('FORBIDDEN');if(!roles.includes(p.role)||p.memberId===process.env.SUPER_ADMIN_UID)throw new Error('INVALID_INPUT');const ref=db().collection('members').doc(p.memberId);const target=await ref.get();if(!target.exists)throw new Error('MEMBER_NOT_FOUND');if(!isActive(target.data() as Member))throw new Error('MEMBERSHIP_REQUIRED');const batch=db().batch();batch.update(ref,{role:p.role});batch.set(db().collection('audit').doc(),{action,actor:user.id,target:p.memberId,role:p.role,at:new Date().toISOString()});await batch.commit();return NextResponse.json({ok:true});}
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
 if(action==='meal'||action==='deposit'){if(typeof p.memberId!=='string')throw new Error('INVALID_INPUT');const member=await db().collection('members').doc(p.memberId).get();if(!member.exists)throw new Error('MEMBER_NOT_FOUND');if(!isActive(member.data() as Member))throw new Error('MEMBERSHIP_REQUIRED');if(!accountingEligible(member.data() as Member,p.date.slice(0,7)))throw new Error('MEMBER_NOT_ELIGIBLE');}
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


function isActive(m:Member){return m.role==='super_admin'||!m.status||m.status==='active';}
const localDate=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
function validDate(date:unknown){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;}
function mealValues(p:any){return [p.breakfast,p.lunch,p.dinner].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10&&n*2===Math.round(n*2));}
function fingerprint(m:any){return m?JSON.stringify([m.breakfast,m.lunch,m.dinner]):'none';}
async function memberAction(user:Member,action:string,p:any){
 if(!['profile','memberUpdate','requestMeal','reviewRequest','cancelRequest'].includes(action))return null;
 const database=db(),at=new Date().toISOString();
 const audit=(tx:any,target:string,before:any,after:any)=>tx.set(database.collection('audit').doc(),{action,actor:user.id,target,at,before,record:after});
 if(action==='profile'||action==='memberUpdate'){
  const id=action==='profile'?user.id:p.memberId;if(typeof id!=='string'||!id||id.includes('/'))throw new Error('INVALID_INPUT');
  if(p.name!==undefined&&(typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>80))throw new Error('INVALID_INPUT');
  if(action==='memberUpdate'&&(!isActive(user)||!['admin','super_admin'].includes(user.role)))throw new Error('FORBIDDEN');
  if(action==='memberUpdate'&&(p.status!==undefined&&!['active','excluded','deleted'].includes(p.status)))throw new Error('INVALID_INPUT');
  if(p.name===undefined&&p.status===undefined)throw new Error('INVALID_INPUT');
  const ref=database.collection('members').doc(id);
  await database.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new Error('MEMBER_NOT_FOUND');const before=snap.data() as Member;
   if(action==='memberUpdate'&&(id===user.id||id===process.env.SUPER_ADMIN_UID||before.role==='super_admin'))throw new Error('FORBIDDEN');
   if(action==='memberUpdate'&&user.role!=='super_admin'&&before.role!=='member')throw new Error('FORBIDDEN');
   const next={...before,...(p.name!==undefined?{name:p.name.trim()}:{})};
   if(action==='memberUpdate'&&p.status!==undefined){
    const periods=before.periods?before.periods.map(x=>({...x})):isActive(before)?[{start:before.joinedAt}]:[];
    if(p.status==='active'&&!isActive(before))periods.push({start:at});
    if(p.status!=='active')for(const period of periods)if(!period.end)period.end=at;
    next.periods=periods;next.status=p.status;if(p.status!=='active')next.role='member';
   }
   tx.set(ref,next);audit(tx,ref.path,before,next);
  });return NextResponse.json({ok:true});
 }
 if(!isActive(user))throw new Error('MEMBERSHIP_REQUIRED');
 if(action==='requestMeal'){
  if(!validDate(p.date)||p.date<localDate()||p.date>new Date(Date.now()+366*86400000).toISOString().slice(0,10)||!mealValues(p))throw new Error('INVALID_INPUT');
  const ref=database.collection('mealRequests').doc(user.id+'_'+p.date),mealRef=database.collection('meals').doc(user.id+'_'+p.date);
  await database.runTransaction(async tx=>{const old=await tx.get(ref),meal=await tx.get(mealRef);const before=old.data();
   if(before?.status==='approved')throw new Error('REQUEST_CLOSED');
   const record={memberId:user.id,date:p.date,breakfast:p.breakfast,lunch:p.lunch,dinner:p.dinner,status:'pending',createdAt:at,baseline:fingerprint(meal.data())};
   tx.set(ref,record);audit(tx,ref.path,before||null,record);
  });return NextResponse.json({ok:true});
 }
 if(typeof p.id!=='string'||!p.id||p.id.includes('/'))throw new Error('INVALID_INPUT');const ref=database.collection('mealRequests').doc(p.id);
 await database.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new Error('ENTRY_NOT_FOUND');const request=snap.data()!;if(request.status!=='pending')throw new Error('REQUEST_CLOSED');
  if(action==='cancelRequest'){if(request.memberId!==user.id)throw new Error('FORBIDDEN');const next={...request,status:'cancelled',reviewedAt:at};tx.set(ref,next);audit(tx,ref.path,request,next);return;}
  if(user.role==='member')throw new Error('FORBIDDEN');if(!['approved','rejected'].includes(p.status))throw new Error('INVALID_INPUT');
  const memberRef=database.collection('members').doc(request.memberId),mealRef=database.collection('meals').doc(request.memberId+'_'+request.date);
  const member=await tx.get(memberRef),meal=await tx.get(mealRef);
  if(p.status==='approved'){
   if(!member.exists||!isActive(member.data() as Member))throw new Error('MEMBERSHIP_REQUIRED');
   if(request.date<localDate())throw new Error('INVALID_INPUT');
   if(fingerprint(meal.data())!==request.baseline)throw new Error('MEAL_CHANGED');
   const record={memberId:request.memberId,date:request.date,breakfast:request.breakfast,lunch:request.lunch,dinner:request.dinner};
   tx.set(mealRef,record);audit(tx,mealRef.path,meal.data()||null,record);
  }
  const next={...request,status:p.status,reviewedAt:at,reviewedBy:user.id};tx.set(ref,next);audit(tx,ref.path,request,next);
 });return NextResponse.json({ok:true});
}

function accountingEligible(m:Member,month:string){return m.periods?m.periods.some(p=>p.start.slice(0,7)<=month&&(!p.end||p.end.slice(0,7)>=month)):eligibleForMonth(m.joinedAt,month);}

async function saveDailyMeals(user:Member,p:any){
 if(!validDate(p.date)||!Array.isArray(p.entries)||p.entries.length<1||p.entries.length>200)throw new Error('INVALID_INPUT');
 const ids=new Set<string>();
 for(const entry of p.entries){if(!entry||typeof entry.memberId!=='string'||!entry.memberId||entry.memberId.includes('/')||ids.has(entry.memberId)||!mealValues(entry)||typeof entry.baseline!=='string')throw new Error('INVALID_INPUT');ids.add(entry.memberId);}
 const database=db(),at=new Date().toISOString();
 await database.runTransaction(async tx=>{
  const actor=await tx.get(database.collection('members').doc(user.id));
  if(!actor.exists||!isActive(actor.data() as Member)||(user.id!==process.env.SUPER_ADMIN_UID&&(actor.data() as Member).role==='member'))throw new Error('FORBIDDEN');
  // Read every target before writing so failure cannot leave a partially saved day.
  const targets=await Promise.all(p.entries.map(async(entry:any)=>{const ref=database.collection('meals').doc(entry.memberId+'_'+p.date);return {entry,ref,member:await tx.get(database.collection('members').doc(entry.memberId)),meal:await tx.get(ref)};}));
  for(const target of targets){const {entry,member,meal}=target;
   if(!member.exists)throw new Error('MEMBER_NOT_FOUND');if(!isActive(member.data() as Member))throw new Error('MEMBERSHIP_REQUIRED');
   if(!accountingEligible(member.data() as Member,p.date.slice(0,7)))throw new Error('MEMBER_NOT_ELIGIBLE');
   if(fingerprint(meal.data())!==entry.baseline)throw new Error('MEAL_SHEET_CHANGED');
  }
  for(const {entry,ref,meal} of targets){const record={memberId:entry.memberId,date:p.date,breakfast:entry.breakfast,lunch:entry.lunch,dinner:entry.dinner};
   tx.set(ref,record);tx.set(database.collection('audit').doc(),{action:meal.exists?'edit':'create',kind:'meal',source:'daily-sheet',actor:user.id,target:ref.path,at,before:meal.data()||null,record});
  }
 });return NextResponse.json({ok:true,saved:p.entries.length});
}
