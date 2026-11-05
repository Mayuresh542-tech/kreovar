import policies from '../config/policies.json';
import { SOCIAL_PROFILES } from '../config/social';
import { SITE_URL, SITE_DESCRIPTION } from './seo';

export const BRAND_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": SITE_URL + "/#organization",
      name: "Kreovar",
      url: SITE_URL,
      sameAs: [SOCIAL_PROFILES.instagram],
      logo: SITE_URL + "/icon.png",
      email: policies.supportEmail,
      areaServed: "Worldwide",
      knowsAbout: [
        "AI Video Editing",
        "Automatic Subtitle Generation",
        "Text to Speech Voiceovers",
        "Multi-track Timeline Video Editing",
        "Short-form Content Creation",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: policies.supportEmail,
        url: SITE_URL + "/contact",
        availableLanguage: ["English"],
      },
    },
    {
      "@type": "WebSite",
      "@id": SITE_URL + "/#website",
      name: "Kreovar",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": SITE_URL + "/#organization" },
      inLanguage: "en-US",
    },
  ],
};
