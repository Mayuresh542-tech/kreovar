import Link from 'next/link';
import { headers } from 'next/headers';
import BrandMark from './BrandMark';
import LegalLinks from './LegalLinks';
import SpatialTiltCard from './3d/SpatialTiltCard';
import policies from '../config/policies.json';
import { SITE_URL } from '../lib/seo';

const content = {
  about: {
    title: 'About Kreovar',
    intro: 'Kreovar is an online content creation and short-video editing studio. Use your own footage, work on captions and voiceovers, and review edits before exporting.',
    sections: [
      { title: 'What you can do', text: 'Create a project, upload your media, arrange and trim clips, add captions and audio, and export a short video. Content tools also help with ideas, scripts and AI voiceovers.' },
      { title: 'Built for creators and short-form video', text: 'Kreovar is engineered specifically for vertical short-form formats including TikTok, Instagram Reels, and YouTube Shorts. Our browser-based studio streamlines the tedious steps of video assembly, from word-level subtitle timing to multi-track clip sequencing, while ensuring creators maintain final creative authority.' },
      { title: 'Creator ownership and media privacy', text: 'You retain full ownership and commercial rights to your footage, audio recordings, and exported projects. Kreovar does not claim ownership over creator assets or utilize private user media for public model training.' },
      { title: 'AI assistance with your review', text: 'The AI editor plans and applies supported changes in saved stages. Review the resulting preview and use Undo when needed. Automatic captions and generated content can make mistakes. Check the wording, timing and final video before publishing.' },
      { title: 'Know the limits before starting', text: 'Video exports are limited to 5 minutes (300 seconds). AI tools use plan allowances and depend on service availability. Check Pricing for current features and limits; image and video generation are not included unless explicitly offered.' },
    ],
  },
  contact: {
    title: 'Contact Kreovar',
    intro: 'Contact Kreovar about an account, project, subscription or privacy request using the support email below.',
    sections: [
      { title: 'Account and project support', text: 'Include the email associated with your account, the affected project ID if available, your browser, and a description of what happened. An error message or a screenshot can help us investigate.' },
      { title: 'Billing, cancellation and refunds', text: 'For a payment issue, include your purchase reference and the email used at checkout. You can manage recurring subscriptions through your Whop account or purchase receipt. Refund eligibility is described in the Refund & Return Policy.' },
      { title: 'Privacy and security requests', text: 'Use the same email for privacy questions or to report an issue with the service. Do not send passwords, one-time codes, full card numbers or account access keys.' },
      { title: 'Turnaround times and operating hours', text: 'Our creator support team actively reviews inquiries Monday through Friday. We strive to provide meaningful, actionable replies within 24 to 48 business hours. For common setup and feature questions, our How to Use guide and FAQ provide instant answers.' },
      { title: 'Feedback and feature requests', text: 'Creator feedback directly shapes our product roadmap. If you have suggestions for new caption animation styles, editing tools, voice styles, or platform integrations, we welcome your feedback via our support email.' },
    ],
  },
  trust: {
    title: 'Service information',
    intro: 'Read what Kreovar provides, how subscriptions work and where to get help before creating an account or purchasing a plan.',
    sections: [
      { title: 'Official website and contact', text: 'Kreovar’s official website is kreovar.online. Our public support contact is listed below. You can read these pages and the policies without creating an account.' },
      { title: 'Plans and payments', text: 'Kreovar offers Free and Pro plans. Review the current allowances, billing cycle and total at checkout before paying. Payments are processed through Whop; recurring plans renew unless cancelled before the next renewal.' },
      { title: 'Cancellation and refunds', text: 'Manage cancellation through your Whop account or purchase receipt. The Refund & Return Policy explains eligibility and how to request help; it is separate from cancellation of future renewals.' },
      { title: 'Your media and AI results', text: 'You retain rights in the content you upload, subject to the permissions and terms described in our policies. AI captions, scripts and editing suggestions need your review. Keep independent copies of important media and check your exported video.' },
      { title: 'Capabilities and availability', text: 'Final video exports are limited to 5 minutes (300 seconds). Some tools use a plan allowance, and service or browser limitations can affect results. A feature described as unavailable or coming soon is not a promise of current access.' },
    ],
  },
};

export default async function ServiceInfoPage({ kind }: { kind: keyof typeof content }) {
  const page = content[kind], path = kind === 'trust' ? '/trust' : '/' + kind, nonce = (await headers()).get('x-nonce') || undefined;
  const schema = { '@context': 'https://schema.org', '@type': kind === 'about' ? 'AboutPage' : kind === 'contact' ? 'ContactPage' : 'WebPage', '@id': SITE_URL + path + '#webpage', name: page.title, url: SITE_URL + path, isPartOf: { '@id': SITE_URL + '/#website' }, about: { '@id': SITE_URL + '/#organization' } };
  const contact = <section className="vx-frosted-surface mt-8 rounded-2xl border-blue-200/80 p-6"><h2 className="text-lg font-semibold text-[#142440]">Get in touch</h2><a href={'mailto:' + policies.supportEmail} className="mt-3 inline-block break-all font-semibold text-[#1D4FB1] underline underline-offset-4">{policies.supportEmail}</a></section>;
  return (
    <div className="vx-pearl-backdrop min-h-screen text-[#142440]">
      <header className="vx-public-glass-header sticky top-0 z-30">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-5 px-5 py-4">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-[#142440]"><BrandMark size={28} />Kreovar</Link>
          <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-700"><Link href="/about" className="hover:text-[#1D4FB1]">About</Link><Link href="/contact" className="hover:text-[#1D4FB1]">Contact</Link><Link href="/pricing" className="hover:text-[#1D4FB1]">Pricing</Link></div>
        </nav>
      </header>
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
      <main className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <p className="text-sm font-semibold text-[#1D4FB1]">Kreovar</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#142440]">{page.title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-[#52647e]">{page.intro}</p>
        {kind === 'contact' && contact}
        <div className="vx-stagger-row mt-10 grid gap-5 sm:grid-cols-2">
          {page.sections.map((s) => (
            <SpatialTiltCard key={s.title} className="vx-frosted-surface rounded-2xl p-6">
              <section>
                <h2 className="text-lg font-semibold text-[#142440]">{s.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[#52647e]">{s.text}</p>
              </section>
            </SpatialTiltCard>
          ))}
        </div>
        {kind !== 'contact' && contact}
        <nav aria-label="Useful information" className="mt-8 flex flex-wrap gap-5 text-sm font-medium text-[#1D4FB1]">
          <Link href="/how-to-use" className="hover:underline">How Kreovar works</Link>
          <Link href="/pricing" className="hover:underline">Plans and limits</Link>
          <Link href="/refund" className="hover:underline">Refund policy</Link>
          <Link href="/privacy" className="hover:underline">Privacy policy</Link>
          <Link href="/trust" className="hover:underline">Service information</Link>
        </nav>
      </main>
      <footer className="vx-public-glass-header border-t border-slate-200/80 px-5 py-8"><LegalLinks /></footer>
    </div>
  );
}
