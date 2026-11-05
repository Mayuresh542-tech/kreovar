import Link from "next/link";
import { SOCIAL_PROFILES } from "../config/social";

export default function LegalLinks() {
  return (
    <div className="w-full space-y-6 text-xs text-slate-500">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-left py-4 border-b border-slate-100">
        <div>
          <h4 className="font-semibold text-slate-900 mb-2.5">Creation Tools</h4>
          <ul className="space-y-1.5">
            <li>
              <Link href="/ai-video-editor" className="hover:text-blue-600 hover:underline">
                AI Video Editor
              </Link>
            </li>
            <li>
              <Link href="/caption-generator" className="hover:text-blue-600 hover:underline">
                Caption Generator
              </Link>
            </li>
            <li>
              <Link href="/ai-voiceover" className="hover:text-blue-600 hover:underline">
                AI Voiceover Studio
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-slate-900 mb-2.5">Resources &amp; Guides</h4>
          <ul className="space-y-1.5">
            <li>
              <Link href="/how-to-use" className="hover:text-blue-600 hover:underline">
                How to Use Kreovar
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-blue-600 hover:underline">
                Pricing &amp; Plans
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-blue-600 hover:underline">
                Questions &amp; Answers
              </Link>
            </li>
            <li>
              <a href="/llms.txt" className="hover:text-blue-600 hover:underline">
                LLM Directory (llms.txt)
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-slate-900 mb-2.5">Company &amp; Trust</h4>
          <ul className="space-y-1.5">
            <li>
              <Link href="/about" className="hover:text-blue-600 hover:underline">
                About Kreovar
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-blue-600 hover:underline">
                Contact Support
              </Link>
            </li>
            <li>
              <Link href="/trust" className="hover:text-blue-600 hover:underline">
                Service Information
              </Link>
            </li>
            <li>
              <a
                href={SOCIAL_PROFILES.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 hover:underline"
              >
                Instagram ↗
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-slate-900 mb-2.5">Legal Policies</h4>
          <ul className="space-y-1.5">
            <li>
              <Link href="/terms" className="hover:text-blue-600 hover:underline">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-blue-600 hover:underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/cookies" className="hover:text-blue-600 hover:underline">
                Cookie Policy
              </Link>
            </li>
            <li>
              <Link href="/refund" className="hover:text-blue-600 hover:underline">
                Refund &amp; Return Policy
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-[11px] text-slate-400">
        <p>© {new Date().getFullYear()} Kreovar. All rights reserved.</p>
        <p>Built for creators, video editors, and short-form storytellers.</p>
      </div>
    </div>
  );
}
