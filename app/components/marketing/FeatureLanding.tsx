import { headers } from "next/headers";
import { featureSchema, serializeSchema } from "../../lib/publicSchema";
import { PRODUCT_ANSWERS } from "../../lib/productAnswers";
import PlanFacts from "./PlanFacts";
import Link from "next/link";
import BrandMark from "../BrandMark";
import LegalLinks from "../LegalLinks";
import CaptionDemo from "./CaptionDemo";
import CreatorObject3D from "../3d/CreatorObject3D";
import SpatialTiltCard from "../3d/SpatialTiltCard";
import { FEATURE_PAGES, type FeaturePage } from "../../lib/featurePages";

const action =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[#1D4FB1] px-6 py-3 font-semibold text-white shadow-sm transition-all hover:bg-[#163f8e] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600";

export default async function FeatureLanding({ page }: { page: FeaturePage }) {
  const answer = PRODUCT_ANSWERS[page.path],
    nonce = (await headers()).get("x-nonce") || undefined;
  const schema = featureSchema(page);
  const objectVariant =
    page.path === "/ai-video-editor" ? "cinema-lens" : "studio-mic";

  return (
    <div className="vx-pearl-backdrop min-h-screen text-[#142440]">
      <header className="vx-public-glass-header sticky top-0 z-30">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-[#142440]">
            <BrandMark />
            Kreovar
          </Link>
          <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-700">
            <Link href="/pricing" className="hover:text-[#1D4FB1] transition-colors">Pricing</Link>
            <Link href="/how-to-use" className="hover:text-[#1D4FB1] transition-colors">How it works</Link>
            <Link href="/login" className="hover:text-[#1D4FB1] transition-colors">Sign in</Link>
          </div>
        </nav>
      </header>

      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(schema) }} />

      <main className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-[#52647e]">
          <Link href="/" className="hover:underline">Home</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page" className="text-[#142440] font-medium">{page.label}</span>
        </nav>

        <section className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3 py-1 text-xs font-bold tracking-widest text-[#1D4FB1] shadow-2xs backdrop-blur-sm">
              {page.eyebrow}
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-[#142440] sm:text-5xl lg:text-6xl">
              {page.heading}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-[#52647e]">{page.intro}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link href={page.tool} className={action}>
                {page.cta} <span aria-hidden="true" className="ml-2">→</span>
              </Link>
              <Link href="/pricing" className="text-sm font-semibold text-[#142440] hover:text-[#1D4FB1] hover:underline">
                Compare Free and Pro
              </Link>
            </div>
            <p className="mt-4 text-sm text-[#52647e]">Sign in to use the studio. Plan allowances apply.</p>
          </div>

          <div className="lg:col-span-5">
            <div className="vx-3d-viewport h-72 sm:h-80">
              <CreatorObject3D variant={objectVariant} height={320} />
            </div>
          </div>
        </section>

        <section aria-labelledby="direct-answer" className="vx-frosted-surface mt-14 max-w-3xl rounded-3xl p-6 sm:p-8">
          <h2 id="direct-answer" className="text-2xl font-bold text-[#142440]">{answer.question}</h2>
          <p className="mt-4 leading-relaxed text-[#52647e]">{answer.answer}</p>
        </section>

        {page.path === "/caption-generator" && (
          <section aria-labelledby="caption-demo" className="vx-frosted-surface mt-12 max-w-3xl rounded-3xl p-5 sm:p-8">
            <h2 id="caption-demo" className="mb-5 text-xl font-semibold text-[#142440]">Try a caption style</h2>
            <CaptionDemo />
          </section>
        )}

        <section aria-label="Features" className="vx-stagger-row mt-14 grid gap-5 md:grid-cols-3">
          {page.features.map((f, i) => (
            <SpatialTiltCard key={f.title} className="vx-frosted-surface rounded-3xl p-7">
              <article>
                <p className="mb-5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 font-mono text-xs font-bold text-[#1D4FB1] border border-blue-200/70">
                  0{i + 1}
                </p>
                <h2 className="text-xl font-semibold text-[#142440]">{f.title}</h2>
                <p className="mt-3 leading-relaxed text-[#52647e]">{f.text}</p>
              </article>
            </SpatialTiltCard>
          ))}
        </section>

        <section className="vx-creation-hero mt-16 !grid-cols-1">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white">From start to finish</h2>
            <ol className="mt-6 grid gap-6 md:grid-cols-3">
              {page.steps.map((step, i) => (
                <li key={step} className="rounded-2xl border border-white/15 bg-white/5 p-5 leading-relaxed text-slate-100 backdrop-blur-sm">
                  <span className="mb-2.5 block font-mono text-xs font-bold uppercase tracking-wider text-sky-300">
                    Step {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="vx-frosted-surface mt-12 max-w-3xl rounded-3xl p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-[#142440]">What to know before you start</h2>
          <p className="mt-3 leading-relaxed text-[#52647e]">{answer.limits}</p>
          <Link href="/how-to-use" className="mt-4 inline-block font-semibold text-[#1D4FB1] underline">
            Follow the step-by-step guide
          </Link>
        </section>

        <PlanFacts />

        <section className="mx-auto mt-16 max-w-3xl vx-frosted-surface rounded-3xl p-6 sm:p-8">
          <h2 className="text-3xl font-bold text-[#142440]">Questions, answered.</h2>
          <Link href="/faq" className="mt-4 inline-block py-2 text-sm font-semibold text-[#1D4FB1] underline">
            More Kreovar questions and answers
          </Link>
          <div className="mt-5 divide-y divide-slate-200/70">
            {page.faqs.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer text-lg font-semibold text-[#142440] focus-visible:outline-2 focus-visible:outline-blue-600">
                  {f.q}
                </summary>
                <p className="mt-3 leading-relaxed text-[#52647e]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-slate-200/80 pt-10">
          <h2 className="text-2xl font-bold text-[#142440]">Keep creating in one studio.</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURE_PAGES.filter((other) => other.path !== page.path).map((other) => (
              <SpatialTiltCard key={other.path} className="vx-frosted-surface rounded-2xl">
                <Link
                  href={other.path}
                  className="block p-6 font-semibold text-[#142440] transition-colors hover:text-[#1D4FB1]"
                >
                  Explore {other.label} <span aria-hidden="true">→</span>
                </Link>
              </SpatialTiltCard>
            ))}
          </div>
        </section>
      </main>

      <footer className="vx-public-glass-header border-t border-slate-200/80 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 text-sm text-[#52647e]">
          <Link href="/" className="font-semibold text-[#142440]">Kreovar</Link>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
