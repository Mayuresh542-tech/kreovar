import { headers } from "next/headers";
import { THEME_BOOTSTRAP } from "./lib/theme";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import "./ui-motion.css";
import "./mobile.css";
import "./studio-glass.css";
import "./theme.css";
import UiMotion from "./components/UiMotion";
import { SITE_URL, SITE_DESCRIPTION, PUBLIC_ROBOTS, GEO_METADATA } from "./lib/seo";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter-loaded" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono-loaded", preload: false });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Kreovar | AI Content Studio & Online Video Editor",
    template: "%s | Kreovar",
  },
  applicationName: "Kreovar",
  description: SITE_DESCRIPTION,
  robots: PUBLIC_ROBOTS,
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "Kreovar",
    title: "Kreovar — AI Content Studio & Online Video Editor",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Kreovar content creation and video editing studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kreovar — AI Content Studio & Online Video Editor",
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  other: {
    ...GEO_METADATA,
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable + " " + mono.variable + " h-full antialiased"}>
      <body className="min-h-full flex flex-col font-sans bg-[#FAFAFA] text-[#0F172A]">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <UiMotion>{children}</UiMotion>
      </body>
    </html>
  );
}
