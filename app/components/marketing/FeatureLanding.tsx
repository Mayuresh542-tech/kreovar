import {headers} from "next/headers";
import {featureSchema,serializeSchema} from "../../lib/publicSchema";
import {PRODUCT_ANSWERS} from "../../lib/productAnswers";
import PlanFacts from "./PlanFacts";
import Link from "next/link";
import BrandMark from "../BrandMark";
import LegalLinks from "../LegalLinks";
import CaptionDemo from "./CaptionDemo";
import {FEATURE_PAGES,type FeaturePage} from "../../lib/featurePages";
const action="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600";
export default async function FeatureLanding({page}:{page:FeaturePage}){
 const answer=PRODUCT_ANSWERS[page.path],nonce=(await headers()).get("x-nonce")||undefined;
 const schema=featureSchema(page);
 return <div className="min-h-screen bg-slate-50 text-slate-900">
 <header className="border-b border-slate-200 bg-white"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5"><Link href="/" className="flex items-center gap-2 font-bold text-xl"><BrandMark/>Kreovar</Link><div className="flex flex-wrap items-center gap-5 text-sm font-medium"><Link href="/pricing">Pricing</Link><Link href="/how-to-use">How it works</Link><Link href="/login">Sign in</Link></div></nav></header>
 <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeSchema(schema)}}/><main className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
 <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500"><Link href="/" className="hover:underline">Home</Link><span aria-hidden="true"> / </span><span aria-current="page">{page.label}</span></nav>
 <section className="max-w-3xl"><p className="text-xs font-bold tracking-widest text-blue-600">{page.eyebrow}</p><h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{page.heading}</h1><p className="mt-6 text-lg leading-relaxed text-slate-600">{page.intro}</p><div className="mt-8 flex flex-wrap items-center gap-5"><Link href={page.tool} className={action}>{page.cta} <span aria-hidden="true" className="ml-2">→</span></Link><Link href="/pricing" className="text-sm font-semibold text-slate-600 hover:underline">Compare Free and Pro</Link></div><p className="mt-4 text-sm text-slate-500">Sign in to use the studio. Plan allowances apply.</p></section>
 <section aria-labelledby="direct-answer" className="mt-12 max-w-3xl"><h2 id="direct-answer" className="text-2xl font-bold">{answer.question}</h2><p className="mt-4 leading-relaxed text-slate-600">{answer.answer}</p></section>
 {page.path==="/caption-generator"&&<section aria-labelledby="caption-demo" className="mt-12 max-w-3xl rounded-3xl border border-slate-200 bg-white p-5 sm:p-8"><h2 id="caption-demo" className="mb-5 text-xl font-semibold">Try a caption style</h2><CaptionDemo/></section>}
 <section aria-label="Features" className="mt-16 grid gap-5 md:grid-cols-3">{page.features.map((f,i)=><article key={f.title} className="rounded-3xl border border-slate-200 bg-white p-7"><p className="mb-5 text-sm font-bold text-blue-600">0{i+1}</p><h2 className="text-xl font-semibold">{f.title}</h2><p className="mt-3 leading-relaxed text-slate-600">{f.text}</p></article>)}</section>
 <section className="mt-16 rounded-3xl bg-slate-900 p-7 text-white sm:p-10"><h2 className="text-2xl font-bold">From start to finish</h2><ol className="mt-6 grid gap-6 md:grid-cols-3">{page.steps.map((step,i)=><li key={step} className="leading-relaxed"><span className="mb-3 block text-sm font-bold text-blue-300">Step {i+1}</span>{step}</li>)}</ol></section>
 <section className="mt-12 max-w-3xl"><h2 className="text-xl font-semibold">What to know before you start</h2><p className="mt-3 leading-relaxed text-slate-600">{answer.limits}</p><Link href="/how-to-use" className="mt-4 inline-block font-semibold text-blue-700 underline">Follow the step-by-step guide</Link></section><PlanFacts/>
 <section className="mx-auto mt-16 max-w-3xl"><h2 className="text-3xl font-bold">Questions, answered.</h2><Link href="/faq" className="mt-4 inline-block py-3 text-sm font-semibold text-blue-700 underline">More Kreovar questions and answers</Link><div className="mt-7 divide-y divide-slate-200">{page.faqs.map(f=><details key={f.q} className="group py-5"><summary className="cursor-pointer text-lg font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">{f.q}</summary><p className="mt-3 leading-relaxed text-slate-600">{f.a}</p></details>)}</div></section>
 <section className="mt-16 border-t border-slate-200 pt-10"><h2 className="text-2xl font-bold">Keep creating in one studio.</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{FEATURE_PAGES.filter(other=>other.path!==page.path).map(other=><Link key={other.path} href={other.path} className="rounded-2xl border border-slate-200 bg-white p-6 font-semibold transition-colors hover:border-blue-400">Explore {other.label} <span aria-hidden="true">→</span></Link>)}</div></section>
 </main><footer className="border-t border-slate-200 bg-white px-5 py-8"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 text-sm text-slate-500"><Link href="/" className="font-semibold text-slate-900">Kreovar</Link><LegalLinks/></div></footer></div>;
}
