import { headers } from "next/headers";
import { publicMetadata, SITE_URL } from "../lib/seo";
import { serializeSchema } from "../lib/publicSchema";
import PricingClient from "./PricingClient";

export const metadata = publicMetadata("/pricing");

function pricingSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Kreovar Video Creation Studio",
    description: "AI content studio and online video editor for short videos, reels, and TikToks with automated captions and voiceovers.",
    brand: {
      "@type": "Brand",
      name: "Kreovar",
    },
    offers: [
      {
        "@type": "Offer",
        name: "Free Plan",
        price: "0",
        priceCurrency: "USD",
        url: `${SITE_URL}/pricing`,
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: "Pro Plan",
        price: "19",
        priceCurrency: "USD",
        billingDuration: "P1M",
        url: `${SITE_URL}/pricing`,
        availability: "https://schema.org/InStock",
      },
    ],
  };
}

export default async function PricingPage() {
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeSchema(pricingSchema()) }}
      />
      <PricingClient />
    </>
  );
}
