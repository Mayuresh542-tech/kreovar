import Link from "next/link";
import {SOCIAL_PROFILES} from "../config/social";

export default function LegalLinks() {
  return <nav aria-label="Company and policies" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs leading-6 text-slate-500">
    <Link href="/about" className="underline-offset-4 hover:text-blue-600 hover:underline">About</Link>
    <Link href="/contact" className="underline-offset-4 hover:text-blue-600 hover:underline">Contact</Link>
    <Link href="/trust" className="underline-offset-4 hover:text-blue-600 hover:underline">Service information</Link>
    <Link href="/faq" className="underline-offset-4 hover:text-blue-600 hover:underline">Questions &amp; answers</Link>
    <Link href="/terms" className="underline-offset-4 hover:text-blue-600 hover:underline">Terms of Service</Link>
    <Link href="/privacy" className="underline-offset-4 hover:text-blue-600 hover:underline">Privacy Policy</Link>
    <Link href="/cookies" className="underline-offset-4 hover:text-blue-600 hover:underline">Cookie Policy</Link>
    <Link href="/refund" className="underline-offset-4 hover:text-blue-600 hover:underline">Refund &amp; Return Policy</Link>
    <a href={SOCIAL_PROFILES.instagram} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-blue-600 hover:underline">Instagram<span className="sr-only"> (opens in a new tab)</span></a>
  </nav>;
}
