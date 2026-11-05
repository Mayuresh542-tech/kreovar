import Link from "next/link";
import BrandMark from "./BrandMark";
import LegalLinks from "./LegalLinks";
import policies from "../config/policies.json";

export default function PolicyPage({slug}:{slug:string}) {
  const policy=policies.policies.find(item=>item.slug===slug);
  if(!policy) throw new Error("Unknown policy.");
  return <div className="min-h-screen bg-[#FAFAFA] text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/" aria-label="Kreovar home" className="inline-flex items-center gap-2 font-bold"><BrandMark size={28}/>Kreovar</Link><Link href="/projects" className="text-sm text-slate-600 hover:text-blue-600">Back to studio</Link>
    </div></header>
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <LegalLinks/>
      <article className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Kreovar policies</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{policy.title}</h1>
        <p className="mt-3 text-sm text-slate-500">Effective date: {policy.effectiveDate} · Version {policy.version}</p>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">{policy.description}</p>
        <a href={"/policies/"+policy.filename} download className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">Download PDF<span className="sr-only"> - {policy.title}</span></a>
        <nav aria-label="On this page" className="mt-8 rounded-xl bg-slate-50 p-5"><p className="text-sm font-semibold">On this page</p><ol className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">{policy.sections.map((section,index)=><li key={section.title}><a className="hover:text-blue-600 hover:underline" href={"#section-"+(index+1)}>{section.title}</a></li>)}</ol></nav>
        <div className="mt-8 space-y-8">{policy.sections.map((section,index)=><section id={"section-"+(index+1)} key={section.title} className="scroll-mt-6"><h2 className="text-lg font-semibold">{section.title}</h2>{section.paragraphs.map(text=><p key={text} className="mt-3 break-words text-sm leading-7 text-slate-600">{text}</p>)}</section>)}</div>
        {(slug==='privacy'||slug==='cookies')&&<p className="mt-8 text-sm text-slate-600">Read our <Link href={slug==='privacy'?'/cookies':'/privacy'} className="font-medium text-blue-700 underline underline-offset-4">{slug==='privacy'?'Cookie Policy':'Privacy Policy'}</Link> for related information.</p>}
        {slug==='privacy'&&<aside className="mt-8 border-t border-slate-100 pt-6 text-sm text-slate-600"><h2 className="font-semibold">Service privacy notices</h2><ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{[["Account & storage service","https://supabase.com/privacy"],["AI content service","https://groq.com/privacy-policy"],["Voice service","https://voice.ai/privacy"],["Optional AI service","https://policies.google.com/privacy"],["Payment service","https://whop.com/privacy/"],["Hosting service","https://www.netlify.com/privacy/"]].map(([label,url])=><li key={url}><a className="underline underline-offset-4" href={url} target="_blank" rel="noopener noreferrer">{label}</a></li>)}</ul></aside>}
        <aside className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-5"><h2 className="text-sm font-semibold">Questions about this policy?</h2><a href={"mailto:"+policies.supportEmail} className="mt-2 block break-all text-sm text-blue-700 underline underline-offset-4">{policies.supportEmail}</a></aside>
      </article>
    </main>
    <footer className="border-t border-slate-200 bg-white px-5 py-7"><LegalLinks/><p className="mt-3 text-center text-xs text-slate-400">© {new Date().getFullYear()} Kreovar</p></footer>
  </div>;
}
