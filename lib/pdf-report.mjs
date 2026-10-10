const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>new Intl.NumberFormat('bn-BD',{maximumFractionDigits:2}).format(n||0);
const money=n=>'৳ '+number(n);
const date=value=>new Intl.DateTimeFormat('bn-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dhaka'}).format(new Date(value+'T00:00:00Z'));
const table=(headers,rows)=>'<table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
export function buildAccountReport({member,month,meals=[],deposits=[],statement,statements=[],members=[],summary}){
 const monthLabel=new Intl.DateTimeFormat('bn-BD',{month:'long',year:'numeric',timeZone:'Asia/Dhaka'}).format(new Date(month+'-01T00:00:00Z'));
 const title=(member?member.name+' - ব্যক্তিগত হিসাব':'MessMate - মাসিক হিসাব')+' - '+month;
 let body='<header><b class="brand">MessMate</b><h1>'+escape(member?member.name+' — ব্যক্তিগত হিসাব':'মাসিক চূড়ান্ত হিসাব')+'</h1><p>হিসাবের মাস: '+escape(monthLabel)+'</p>'+(member?'<p>'+escape(member.email)+'</p>':'')+'</header>';
 if(member){
  const s=statement||{meals:0,deposits:0,foodCost:0,sharedCost:0,totalCost:0,balance:0};
  body+=table(['মোট মিল','মোট জমা','খাবার খরচ','অন্যান্য খরচ','মোট খরচ',s.balance<0?'বকেয়া':'অবশিষ্ট / পাওনা'],[[number(s.meals),money(s.deposits),money(s.foodCost),money(s.sharedCost),money(s.totalCost),money(Math.abs(s.balance))]]);
  const rows=meals.filter(m=>m.memberId===member.id&&m.date.startsWith(month+'-')).sort((a,b)=>a.date.localeCompare(b.date));
  const totals=rows.reduce((s,m)=>[s[0]+m.breakfast,s[1]+m.lunch,s[2]+m.dinner],[0,0,0]);
  body+='<h2>তারিখ অনুযায়ী মিল</h2>'+(rows.length?table(['তারিখ','সকাল','দুপুর','রাত','মোট'],[...rows.map(m=>[date(m.date),number(m.breakfast),number(m.lunch),number(m.dinner),number(m.breakfast+m.lunch+m.dinner)]),['মাসের মোট',...totals.map(number),number(totals.reduce((a,b)=>a+b,0))]]):'<p>এই মাসে কোনো মিল নেই।</p>');
  const paid=deposits.filter(d=>d.memberId===member.id&&d.date.startsWith(month+'-')).sort((a,b)=>a.date.localeCompare(b.date));
  body+='<h2>তারিখ অনুযায়ী জমা</h2>'+(paid.length?table(['তারিখ','নোট','পরিমাণ'],paid.map(d=>[date(d.date),d.note||'—',money(d.amount)])):'<p>এই মাসে কোনো জমা নেই।</p>');
 }else{
  if(summary)body+=table(['মোট মিল','মিল রেট','মোট জমা','মোট খরচ','অবশিষ্ট ফান্ড'],[[number(summary.totalMeals),money(summary.mealRate),money(summary.totalDeposits),money(summary.totalExpenses),money(summary.fund)]]);
  body+='<h2>সদস্যদের মাসিক হিসাব</h2>'+table(['সদস্য','মিল','খাবার খরচ','অন্যান্য খরচ','মোট খরচ','জমা','পাওনা','বকেয়া'],statements.map(s=>[members.find(m=>m.id===s.memberId)?.name||'সদস্য',number(s.meals),money(s.foodCost),money(s.sharedCost),money(s.totalCost),money(s.deposits),money(Math.max(s.balance,0)),money(Math.max(-s.balance,0))]));
 }
 body+='<footer>সব হিসাব নির্বাচিত মাসের। অপেক্ষায় থাকা মিল রিকোয়েস্ট হিসাবে অন্তর্ভুক্ত নয়। পূর্ববর্তী মাসের ব্যালেন্স স্বয়ংক্রিয়ভাবে যোগ হয় না।</footer>';
 return {title:title.replace(/[\\/:*?"<>|]/g,'-'),body,landscape:!member};
}
export function saveAccountPdf(options){
 const report=buildAccountReport(options),view=window.open('','_blank');
 if(!view)throw new Error('পিডিএফ খুলতে ব্রাউজারের পপআপ অনুমতি দিন, তারপর আবার চেষ্টা করুন।');
 let fonts='';for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules)if(rule.type===CSSRule.FONT_FACE_RULE)fonts+=rule.cssText;}catch{}}
 const family=getComputedStyle(document.body).fontFamily;
 view.document.open();view.document.write('<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>'+escape(report.title)+'</title><style>'+fonts+'\nbody{font-family:'+family+';color:#243d35;margin:0;padding:24px;font-size:12px}h1{font-size:21px;margin:8px 0}h2{font-size:16px;margin:24px 0 12px}header{border-bottom:2px solid #24785f;padding-bottom:14px;margin-bottom:20px}header p{margin:5px 0}.brand{color:#24785f;font-size:18px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #dce5df;padding:9px 7px;text-align:left;overflow-wrap:anywhere}th{background:#edf5ef}tr{break-inside:avoid}thead{display:table-header-group}footer{border-top:1px solid #dce5df;margin-top:24px;padding-top:12px;font-size:10px;color:#67776e}.print-tools{padding:14px;background:#edf5ef;margin-bottom:20px}.print-tools button{font:inherit;background:#24785f;color:#fff;border:0;border-radius:7px;padding:10px 16px;cursor:pointer}.print-tools p{margin:8px 0 0}@page{size:A4 '+(report.landscape?'landscape':'portrait')+';margin:14mm}@media print{body{padding:0}.print-tools{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="print-tools"><button id="save-pdf">পিডিএফ সেভ করুন</button><p>প্রিন্ট উইন্ডোতে “Save as PDF” বেছে সেভ করুন। ফাইলের নাম: '+escape(report.title)+'.pdf</p></div>'+report.body+'</body></html>');view.document.close();
 view.document.getElementById('save-pdf').onclick=()=>view.print();
 const ready=view.document.fonts?view.document.fonts.load('12px '+family).then(()=>view.document.fonts.ready):Promise.resolve();ready.then(()=>{if(!view.closed){view.focus();view.print();}});
}
