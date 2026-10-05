import type {Metadata} from 'next';
import localFont from 'next/font/local';
import './globals.css';
const notoSerifBengali=localFont({src:'./fonts/NotoSerifBengali.ttf',variable:'--font-bengali-serif',weight:'100 900',display:'swap',preload:true,fallback:['Georgia'],adjustFontFallback:false});
export const metadata:Metadata={title:'MessMate • মেসের হিসাব, সহজে',description:'মিল, বাজার, জমা ও মাসিক হিসাব এক জায়গায়।'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="bn" className={notoSerifBengali.variable}><body>{children}</body></html>;}

