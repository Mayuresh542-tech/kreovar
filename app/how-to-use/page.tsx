import Link from "next/link";
import { headers } from "next/headers";
import BrandMark from "../components/BrandMark";
import LegalLinks from "../components/LegalLinks";
import PlanFacts from "../components/marketing/PlanFacts";
import { publicMetadata, SITE_URL } from "../lib/seo";
import { serializeSchema } from "../lib/publicSchema";

export const metadata = publicMetadata("/how-to-use");

const guides = [
  {
    id: "video",
    title: "Edit a short video",
    href: "/ai-video-editor",
    steps: [
      "Sign in and create a named project from Projects.",
      "Add your footage and open the project in the editor.",
      "Arrange, trim or split clips. Add text, captions and audio as needed.",
      "For AI assistance, describe the desired change and what should stay unchanged. The editor plans, applies, validates and saves supported changes in stages.",
      "Review the saved timeline in the preview. Use Undo for applied edits, or continue manually. If a stage fails, retry resumes from the unfinished step.",
      "Preview the full timeline and export. The final video must be 60 seconds or less.",
    ],
  },
  {
    id: "captions",
    title: "Create and style captions",
    href: "/caption-generator",
    steps: [
      "Open Caption Studio and select a video containing speech, up to 60 seconds and 100 MB.",
      "Generate captions, then correct transcript and timing errors.",
      "Choose a template and adjust position, size and words per line in the preview.",
      "Download SRT or TXT for text output, or export a video with captions baked in. SRT does not preserve visual styling.",
    ],
  },
  {
    id: "voice",
    title: "Generate a voiceover",
    href: "/ai-voiceover",
    steps: [
      "Open Voice Studio. No editing project is required.",
      "Paste a script and choose an available voice and speaking speed.",
      "Generate and listen to the audio. Check pronunciation before using it.",
      "Download the result or return to previous generations below playback.",
    ],
  },
];

function howToSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Create and Edit Short Videos with Kreovar",
    description: "Step-by-step guide to generating AI voiceovers, auto-captions, and editing short-form videos in Kreovar.",
    totalTime: "PT5M",
    step: guides.flatMap((guide) =>
      guide.steps.map((stepText, idx) => ({
        "@type": "HowToStep",
        position: idx + 1,
        name: `${guide.title} - Step ${idx + 1}`,
        text: stepText,
        url: `${SITE_URL}/how-to-use#${guide.id}`,
      }))
    ),
  };
}

export default async function Guide() {
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeSchema(howToSchema()) }}
      />
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 p-5">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <BrandMark />
            Kreovar
          </Link>
          <div className="flex gap-5 text-sm font-medium">
            <Link href="/pricing" className="hover:underline">Pricing</Link>
            <Link href="/faq" className="hover:underline">FAQ</Link>
            <Link href="/login" className="hover:underline">Sign in</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-12">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500 mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">How to Use</span>
        </nav>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">How to use Kreovar</h1>
        <p className="mt-5 max-w-2xl leading-relaxed text-slate-600">
          Kreovar combines independent content tools and a video editor. Generate voiceovers or captions on their own, or bring assets together in a project to edit a short video.
        </p>
        <nav aria-label="On this page" className="mt-7 flex flex-wrap gap-4 font-medium text-sm text-blue-700">
          {guides.map((g) => (
            <a key={g.id} href={"#" + g.id} className="underline underline-offset-4">
              {g.title}
            </a>
          ))}
        </nav>
        {guides.map((g) => (
          <section key={g.id} id={g.id} className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-2xl font-bold">{g.title}</h2>
            <ol className="mt-5 list-decimal space-y-4 pl-5 text-slate-600 leading-relaxed">
              {g.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-4 items-center">
              <Link href={g.href} className="font-semibold text-blue-700 underline underline-offset-4">
                Explore this tool →
              </Link>
              <Link href="/pricing" className="text-sm text-slate-500 hover:underline">
                View plan allowances
              </Link>
            </div>
          </section>
        ))}
        <section className="mt-10">
          <h2 className="text-2xl font-bold">What is available on the free plan?</h2>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Free includes limited monthly allowances and manual editing. Pro raises those allowances. The current details are below; generation and transcription also depend on service availability.
          </p>
        </section>
        <PlanFacts />
        <section className="mt-10 rounded-2xl bg-slate-900 p-8 text-white">
          <h2 className="text-xl font-semibold">Need help with your content?</h2>
          <p className="mt-2 text-slate-300 text-sm">
            Check out common questions in our FAQ or reach out to our dedicated support desk.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/faq" className="underline underline-offset-4">Read FAQ</Link>
            <Link href="/contact" className="underline underline-offset-4">Contact Support</Link>
            <a href="mailto:support@kreovar.online" className="underline underline-offset-4">support@kreovar.online</a>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 p-6 bg-white">
        <LegalLinks />
      </footer>
    </div>
  );
}
