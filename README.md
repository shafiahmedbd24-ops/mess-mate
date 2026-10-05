# MessMate — মেসের হিসাব, সহজে

Next.js App Router + TypeScript + Tailwind CSS + Firebase Authentication + Firestore। সব সংবেদনশীল ডেটা Next.js server API দিয়ে পরিচালিত হয়।

## ১. চালু করুন

Node.js 20.9 বা নতুন সংস্করণ ইনস্টল করুন। এই ফোল্ডারে টার্মিনাল খুলে:

```sh
npm install
npm run dev
```

http://localhost:3000 খুলে **ডেমো ড্যাশবোর্ড দেখুন** চাপুন। Firebase ছাড়াই ব্যবহার করতে পারবেন। ডেমো পরিবর্তন localStorage-এ থাকে, বাস্তব ডেটার সাথে মিশে না। ডেমো রোল নির্বাচন করে সদস্যের ড্যাশবোর্ড দেখুন।

## ২. Firebase তৈরি করুন

1. https://console.firebase.google.com থেকে একটি project তৈরি করুন।
2. Project settings → Your apps → Web app যোগ করুন।
3. `.env.example` কপি করে `.env.local` করুন। Web app config-এর apiKey, authDomain, projectId, appId সংশ্লিষ্ট `NEXT_PUBLIC_…` ভ্যারিয়েবলে বসান।
4. Authentication → Sign-in method → Email/Password Enable করুন।
5. Authentication → Settings → Authorized domains-এ localhost এবং আপনার Vercel domain যোগ করুন।
6. Firestore Database তৈরি করুন। Production mode নির্বাচন করুন।
7. Rules tab-এ `firestore.rules`-এর সম্পূর্ণ কোড বসিয়ে Publish করুন। Client access বন্ধ থাকে; token যাচাই করা server Admin SDK ডেটা পরিচালনা করে।
8. Project settings → Service accounts → Generate new private key। JSON ফাইলের project_id, client_email, private_key `.env.local`-এর server ভ্যারিয়েবলে বসান। Private key quotes-এর মধ্যে রাখুন, newline-গুলো `\n` হিসেবে লিখুন। এই JSON কখনো GitHub-এ আপলোড করবেন না।
9. Super Admin-এর অ্যাকাউন্ট অ্যাপ থেকে রেজিস্টার করুন। ইমেইলের লিংকে যাচাই করুন। Firebase Authentication → Users থেকে সেই account-এর UID কপি করে `SUPER_ADMIN_UID`-তে বসান। সার্ভার restart করুন, আবার login করুন।

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your-web-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_APP_ID=your-web-app-id
FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
SUPER_ADMIN_UID=your-owner-uid
```

Firebase configuration-এর পর ডেমো থেকে লগআউট করে বাস্তব account ব্যবহার করুন। নতুন সদস্য email verify করে প্রথম login করলে member profile তৈরি হয়।

## ৩. রোল ও অনুমতি

| রোল | অনুমতি |
|---|---|
| Member | নিজের মিল, জমা, খরচের বণ্টন, Due/Advance এবং CSV |
| Manager | সব সদস্যের হিসাব দেখা; মিল, খরচ ও জমা এন্ট্রি |
| Admin | Manager-এর সমস্ত পরিচালনার অনুমতি |
| Super Admin | সমস্ত পরিচালনার অনুমতি এবং অন্য সদস্যের রোল পরিবর্তন |

`SUPER_ADMIN_UID` server-only। অ্যাপ থেকে কাউকে Super Admin করা যায় না; নির্দিষ্ট মালিককে downgrade করা যায় না। Role server Firestore profile থেকে প্রতি request-এ যাচাই হয়। User-submitted role গ্রহণ করা হয় না। Verified email এবং valid Firebase ID token আবশ্যিক। Role/ledger পরিবর্তনের audit রেকর্ড server লেখে। Password Firebase Auth পরিচালনা করে; Firestore-এ সংরক্ষিত হয় না।

## ৪. হিসাবের নিয়ম

- খাদ্য, বাজার, চাল-ডাল: `food` → মোট খরচ ÷ মোট মিল = মিল রেট। সদস্যের মিল অনুযায়ী ভাগ।
- গ্যাস: `gas`, বুয়ার বেতন: `salary`, অন্যান্য: `other` → নির্বাচিত মাসের সদস্যদের মধ্যে সমান ভাগ।
- সকালের, দুপুরের ও রাতের মিল এক ওজনের। ০, ০.৫, ১…১০ পর্যন্ত এন্ট্রি দেওয়া যায়।
- একই সদস্য/তারিখে মিল এন্ট্রি করলে আগের এন্ট্রি সংশোধিত হয়; duplicate হয় না।
- মোট ব্যক্তিগত খরচ = খাবারের ভাগ + সমান খরচের ভাগ।
- ব্যালেন্স = জমা − ব্যক্তিগত খরচ। ঋণাত্মক হলে সদস্যের বকেয়া, ধনাত্মক হলে মেস ফেরত দেবে।
- ফান্ড = সব জমা − সব খরচ; ঋণাত্মক হলে খরচ জমার বেশি।
- পয়সা পর্যন্ত ভাগে rounding remainder বণ্টন করা হয়, তাই সব সদস্যের খরচ যোগ করলে মূল খরচের সঙ্গে মিলে। প্রদর্শিত মিল রেট rounded হলেও খরচ exact ratio দিয়ে বণ্টিত।
- মিল না থাকলে বাজারের খরচ এখনও বরাদ্দ করা হয় না; admin dashboard-এ সতর্কতা থাকে।
- মাসের মাঝখানে যোগ দেওয়া সদস্য সেই মাসের fixed expense-এর পূর্ণ ভাগ বহন করবেন। পরের মাসে যোগ দেওয়া সদস্য আগের মাসের অংশ নেবেন না।
- প্রতিটি মাস স্বতন্ত্র। আগের মাসের due/advance carry-forward এখন স্বয়ংক্রিয় নয়। মাস শেষের পর হিসাব export করুন।

## ৫. ফোল্ডার স্ট্রাকচার

```text
app/
  layout.tsx             বাংলা layout ও metadata
  globals.css            Tailwind ও responsive design
  page.tsx               login, dashboards, forms, reports
  api/ledger/route.ts     token verification, RBAC, validation, audit
lib/
  firebase.ts            browser Firebase Auth config
  admin.ts               server-only Firebase Admin config
  types.ts               typed data model
  calculation.mjs        month selection ও exact allocation
  demo.ts                demo sample data
tests/
  calculation.test.mjs   হিসাবের automated checks
firestore.rules           client access denial
firebase.json             rules deployment config
.env.example              configuration template
```

Firestore collections: `members`, `meals`, `expenses`, `deposits`, `audit`। Authentication UID member document ID। Meal ID: `UID_YYYY-MM-DD`। Expense ও deposit ID random। মিল, খরচ ও জমার তালিকা থেকে এডিট ও ডিলিট করা যায়। শুধুমাত্র Admin, Manager ও Super Admin পারবেন। ডিলিটের আগে confirmation dialog দেখানো হয়। ডিলিট হওয়া এন্ট্রি `deletedEntries` collection-এ ব্যাকআপ থাকে; বর্তমানে অ্যাপ থেকে restore করার UI নেই। পরিবর্তনের before/after তথ্য `audit` collection-এ থাকে। একই দিনের অন্য মিলের উপর এডিট দিয়ে overwrite করা যায় না।

## ৬. GitHub → Vercel

1. GitHub-এ নতুন private repository তৈরি করুন। এই project-এর source upload/push করুন। `.env.local`, service-account JSON, `node_modules`, `.next` upload করবেন না। `.gitignore` দেওয়া আছে।
2. Vercel → Add New Project → GitHub repository Import করুন। Framework Next.js।
3. Settings → Environment Variables-এ `.env.local`-এর সব ভ্যারিয়েবল বসান। Server credential-এর নামে `NEXT_PUBLIC_` prefix দেবেন না।
4. Deploy করুন। Firebase Authorized domains-এ deployment domain যোগ করুন।
5. পরে GitHub-এ push করলে Vercel redeploy করবে। Environment variable পরিবর্তনের পরে redeploy প্রয়োজন।

## ৭. যাচাই

```sh
npm test
npm run typecheck
npm run build
```

বাস্তব Firebase project যুক্ত করার পরে owner, manager, member account দিয়ে login পরীক্ষা করুন। Member যেন অন্য কারও ডেটা না পায় এবং direct POST-এ `FORBIDDEN` পায়। Email verification, password reset, role update, page refresh, mobile entry এবং CSV পরীক্ষা করুন। Firebase/Vercel account না যুক্ত করা পর্যন্ত cloud integration end-to-end যাচাই করা যাবে না।

## ভবিষ্যৎ উন্নয়ন

মাস বন্ধ/লক, carry-forward, সদস্য deactivate করার ঐতিহাসিক নিয়ম, receipt upload, notification, Firebase emulator দিয়ে permission tests এবং pagination যোগ করা যেতে পারে। বর্তমান সংস্করণ একটি মেসের জন্য; বড় ব্যবহারকারীর ক্ষেত্রে server-এর full collection read-এর বদলে মাসভিত্তিক query/index ও stored summaries প্রয়োজন।

Official references: https://nextjs.org/docs/app/getting-started/installation এবং https://firebase.google.com/docs/firestore/solutions/role-based-access । Admin SDK Firestore rules bypass করে, তাই server endpoint-এ identity ও role check করা হয়েছে।

