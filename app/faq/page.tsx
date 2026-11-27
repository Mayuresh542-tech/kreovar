import Link from 'next/link';
import { headers } from 'next/headers';
import BrandMark from '../components/BrandMark';
import LegalLinks from '../components/LegalLinks';
import { QuestionList } from '../components/marketing/PublicAnswers';
import { COMMON_QUESTIONS, faqEntries } from '../lib/productAnswers';
import { FEATURE_PAGES } from '../lib/featurePages';
import { faqSchema, serializeSchema } from '../lib/publicSchema';
import { publicMetadata } from '../lib/seo';

export const metadata = publicMetadata('/faq');

export default async function Page() {
  const nonce = (await headers()).get('x-nonce') || undefined,
    entries = faqEntries();
  return (
    <div className="vx-pearl-backdrop min-h-screen text-[#142440]">
      <header className="vx-public-glass-header sticky top-0 z-30">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-4">
          <Link href="/" className="flex min-h-11 items-center gap-2 text-xl font-bold text-[#142440]"><BrandMark />Kreovar</Link>
          <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-700">
            <Link href="/how-to-use" className="py-2 hover:text-[#1D4FB1] hover:underline">How it works</Link>
            <Link href="/pricing" className="py-2 hover:text-[#1D4FB1] hover:underline">Pricing</Link>
            <Link href="/login" className="py-2 hover:text-[#1D4FB1] hover:underline">Sign in</Link>
          </div>
        </nav>
      </header>
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(faqSchema()) }} />
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="text-sm text-[#52647e]">
          <Link href="/" className="underline">Home</Link><span aria-hidden="true"> / </span><span aria-current="page" className="text-[#142440] font-medium">Questions and answers</span>
        </nav>
        <p className="mt-8 text-sm font-semibold text-[#1D4FB1]">Before your next video</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#142440] sm:text-5xl">Kreovar questions, answered.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#52647e]">Find clear answers about AI and manual editing, captions, voiceovers, plans and video limits.</p>
        <nav aria-label="On this page" className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[#1D4FB1]">
          <a href="#studio" className="py-2 underline underline-offset-4">Studio and plans</a>
          {FEATURE_PAGES.map((page) => <a key={page.path} href={'#' + page.path.slice(1)} className="py-2 underline underline-offset-4">{page.label}</a>)}
        </nav>
        <section id="studio" aria-labelledby="studio-title" className="vx-frosted-surface mt-8 scroll-mt-20 rounded-3xl p-6 sm:p-8">
          <h2 id="studio-title" className="text-2xl font-bold text-[#142440]">Studio, plans and exports</h2>
          <QuestionList items={COMMON_QUESTIONS} />
          <Link href="/pricing" className="mt-4 inline-block py-2 font-semibold text-[#1D4FB1] underline">Compare all plan allowances</Link>
        </section>
        {FEATURE_PAGES.map((page) => (
          <section key={page.path} id={page.path.slice(1)} aria-labelledby={page.path.slice(1) + '-title'} className="vx-frosted-surface mt-8 scroll-mt-20 rounded-3xl p-6 sm:p-8">
            <h2 id={page.path.slice(1) + '-title'} className="text-2xl font-bold text-[#142440]">{page.label}</h2>
            <QuestionList items={entries.filter((entry) => entry.id.startsWith(page.path.slice(1) + '-'))} />
            <Link href={page.path} className="mt-4 inline-block py-2 font-semibold text-[#1D4FB1] underline">Explore {page.label}</Link>
          </section>
        ))}
        <section className="vx-creation-hero mt-10 !grid-cols-1">
          <div>
            <h2 className="text-2xl font-bold text-white">Need a hand getting started?</h2>
            <p className="mt-3 leading-7 text-slate-200">Follow the walkthrough or contact support about your account, project or subscription.</p>
            <div className="mt-5 flex flex-wrap gap-5 text-white">
              <Link href="/how-to-use" className="py-2 font-semibold underline underline-offset-4">Step-by-step guide</Link>
              <Link href="/contact" className="py-2 font-semibold underline underline-offset-4">Contact support</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="vx-public-glass-header border-t border-slate-200/80 px-5 py-8"><LegalLinks /></footer>
    </div>
  );
}
