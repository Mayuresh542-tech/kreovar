import Link from 'next/link';
import {headers} from 'next/headers';
import BrandMark from '../components/BrandMark';
import LegalLinks from '../components/LegalLinks';
import {QuestionList} from '../components/marketing/PublicAnswers';
import {COMMON_QUESTIONS,faqEntries} from '../lib/productAnswers';
import {FEATURE_PAGES} from '../lib/featurePages';
import {faqSchema,serializeSchema} from '../lib/publicSchema';
import {publicMetadata} from '../lib/seo';

export const metadata=publicMetadata('/faq');
export default async function Page(){
 const nonce=(await headers()).get('x-nonce')||undefined,entries=faqEntries();
 return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-200 bg-white"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5"><Link href="/" className="flex min-h-11 items-center gap-2 text-xl font-bold"><BrandMark/>Kreovar</Link><div className="flex flex-wrap items-center gap-5 text-sm font-medium"><Link href="/how-to-use" className="py-3 hover:underline">How it works</Link><Link href="/pricing" className="py-3 hover:underline">Pricing</Link><Link href="/login" className="py-3 hover:underline">Sign in</Link></div></nav></header>
 <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeSchema(faqSchema())}}/>
 <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16"><nav aria-label="Breadcrumb" className="text-sm text-slate-600"><Link href="/" className="underline">Home</Link><span aria-hidden="true"> / </span><span aria-current="page">Questions and answers</span></nav><p className="mt-8 text-sm font-semibold text-blue-700">Before your next video</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Kreovar questions, answered.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Find clear answers about AI and manual editing, captions, voiceovers, plans and video limits.</p>
 <nav aria-label="On this page" className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-blue-700"><a href="#studio" className="py-3 underline underline-offset-4">Studio and plans</a>{FEATURE_PAGES.map(page=><a key={page.path} href={'#'+page.path.slice(1)} className="py-3 underline underline-offset-4">{page.label}</a>)}</nav>
 <section id="studio" aria-labelledby="studio-title" className="mt-8 scroll-mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 id="studio-title" className="text-2xl font-bold">Studio, plans and exports</h2><QuestionList items={COMMON_QUESTIONS}/><Link href="/pricing" className="mt-4 inline-block py-3 font-semibold text-blue-700 underline">Compare all plan allowances</Link></section>
 {FEATURE_PAGES.map(page=><section key={page.path} id={page.path.slice(1)} aria-labelledby={page.path.slice(1)+'-title'} className="mt-8 scroll-mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 id={page.path.slice(1)+'-title'} className="text-2xl font-bold">{page.label}</h2><QuestionList items={entries.filter(entry=>entry.id.startsWith(page.path.slice(1)+'-'))}/><Link href={page.path} className="mt-4 inline-block py-3 font-semibold text-blue-700 underline">Explore {page.label}</Link></section>)}
 <section className="mt-10 rounded-3xl bg-slate-900 p-7 text-white"><h2 className="text-2xl font-bold">Need a hand getting started?</h2><p className="mt-3 leading-7 text-slate-200">Follow the walkthrough or contact support about your account, project or subscription.</p><div className="mt-5 flex flex-wrap gap-5"><Link href="/how-to-use" className="py-3 font-semibold underline underline-offset-4">Step-by-step guide</Link><Link href="/contact" className="py-3 font-semibold underline underline-offset-4">Contact support</Link></div></section></main>
 <footer className="border-t border-slate-200 bg-white px-5 py-8"><LegalLinks/></footer></div>;
}
