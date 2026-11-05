import type { Metadata } from "next";

/** A fixed trusted origin: request hosts and tracking parameters never become canonicals. */
export const SITE_URL = "https://kreovar.online";
export const SITE_DESCRIPTION = "Create content and edit short videos with Kreovar. Discover viral ideas, write scripts, generate voiceovers, add styled animated captions, and edit multi-track video in one browser-based studio.";

export const PRIVATE_ROBOTS = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
} as const;

export const PUBLIC_ROBOTS = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-video-preview": -1,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
} as const;

export interface PageMetadataConfig {
  title: string;
  description: string;
  keywords?: string[];
  isPublic?: boolean;
}

/** Comprehensive metadata registry for every single page in Kreovar */
export const ALL_PAGES_METADATA: Record<string, PageMetadataConfig> = {
  // Public Landing, Features & Marketing
  "/": {
    title: "Kreovar | AI Content Studio & Online Video Editor",
    description: SITE_DESCRIPTION,
    keywords: ["AI video editor", "content creation studio", "short video maker", "auto caption generator", "AI voiceover", "online video editor", "TikTok video editor", "Reels video editor"],
    isPublic: true,
  },
  "/ai-video-editor": {
    title: "AI Video Editor for Short Videos & Reels",
    description: "Edit short videos with Kreovar's AI assistant and multi-track manual timeline. Arrange clips, add auto-captions, voiceovers, and B-roll, then export your video.",
    keywords: ["AI video editor", "timeline video editor", "short form video editor", "edit with AI", "TikTok editor", "Reels editor"],
    isPublic: true,
  },
  "/caption-generator": {
    title: "AI Caption Generator & Auto Subtitle Editor",
    description: "Generate and edit video captions in Kreovar. Preview caption templates, adjust size, position and words per line, and download subtitles or a captioned video.",
    keywords: ["auto caption generator", "video subtitle generator", "animated captions", "SRT subtitle download", "closed captions maker"],
    isPublic: true,
  },
  "/ai-voiceover": {
    title: "AI Voiceover Generator & Text to Speech",
    description: "Turn text into realistic AI voiceovers with Kreovar. Choose natural voices, adjust speaking speed, preview generated audio, and sync directly with your content.",
    keywords: ["AI voiceover generator", "text to speech online", "realistic AI voices", "narrator voice generator", "video voiceover"],
    isPublic: true,
  },
  "/pricing": {
    title: "Pricing & Plans — Free and Pro Comparison",
    description: "Compare Kreovar Free and Pro plans for AI content tools, captions, voiceovers, and video editing. See monthly allowances, export limits, and transparent pricing.",
    keywords: ["Kreovar pricing", "AI video editor pricing", "free video editor", "pro video editor plan"],
    isPublic: true,
  },
  "/how-to-use": {
    title: "How to Use Kreovar — Step-by-Step Video Creation Guide",
    description: "Learn the Kreovar workflow: create a project, import footage, use AI content tools, style animated captions, arrange the timeline, and export your short video.",
    keywords: ["how to use Kreovar", "video editing tutorial", "short video creation guide", "AI editor guide"],
    isPublic: true,
  },
  "/faq": {
    title: "FAQ: Video Editing, Captions, Voiceovers & Plans",
    description: "Answers to common Kreovar questions about AI and manual video editing, caption downloads, voiceovers, Free and Pro pricing, and video export limits.",
    keywords: ["Kreovar FAQ", "video editing questions", "caption generator help", "voiceover limits"],
    isPublic: true,
  },
  "/about": {
    title: "About Kreovar — Modern AI Video Creation Platform",
    description: "Learn what Kreovar provides, how its short-video editing tools work, and how we help creators produce high-retention content efficiently.",
    keywords: ["about Kreovar", "Kreovar story", "AI video platform", "content creator tools"],
    isPublic: true,
  },
  "/contact": {
    title: "Contact Kreovar — Support & Inquiries",
    description: "Contact Kreovar support for account, project, subscription, and privacy questions. Find the official support email and helpful information.",
    keywords: ["contact Kreovar", "Kreovar support", "customer service", "help desk"],
    isPublic: true,
  },
  "/trust": {
    title: "Service Information, Trust & Cloud Limits",
    description: "Understand Kreovar plans, payment processing, cancellation, refunds, media handling, and current video editing limits before you sign up.",
    keywords: ["Kreovar trust", "security compliance", "service information", "cloud rendering limits"],
    isPublic: true,
  },
  "/terms": {
    title: "Terms of Service",
    description: "Read the official terms for using Kreovar and its AI content creation and video editing tools.",
    keywords: ["terms of service", "user agreement", "legal terms"],
    isPublic: true,
  },
  "/privacy": {
    title: "Privacy Policy",
    description: "Learn how Kreovar handles account information, uploaded media, generated assets, and service data securely.",
    keywords: ["privacy policy", "data security", "data protection"],
    isPublic: true,
  },
  "/cookies": {
    title: "Cookie Policy",
    description: "Learn how Kreovar uses sign-in cookies and browser storage, how long data can remain on your device, and how to manage preferences.",
    keywords: ["cookie policy", "browser storage", "session cookies"],
    isPublic: true,
  },
  "/refund": {
    title: "Refund & Return Policy",
    description: "Read Kreovar's three-day first-payment refund window, subscription renewal policy, and cancellation information.",
    keywords: ["refund policy", "cancellation policy", "money back guarantee"],
    isPublic: true,
  },

  // Auth & Onboarding
  "/login": {
    title: "Sign In to Your Studio",
    description: "Sign in to access your Kreovar video projects, AI scriptwriter, saved captions, and voiceover library.",
  },
  "/signup": {
    title: "Create Your Kreovar Account",
    description: "Sign up for Kreovar to start creating short-form videos with AI editing, automatic captions, and natural voiceovers.",
  },
  "/forgot-password": {
    title: "Forgot Password",
    description: "Reset your Kreovar account password securely via email.",
  },
  "/reset-password": {
    title: "Reset Account Password",
    description: "Set a new secure password for your Kreovar account.",
  },
  "/confirm-email": {
    title: "Confirm Your Email",
    description: "Verify your email address to activate your Kreovar account.",
  },
  "/auth/callback": {
    title: "Authenticating",
    description: "Verifying your authentication credentials. Please wait...",
  },

  // Studio Application Pages
  "/dashboard": {
    title: "Studio Dashboard",
    description: "Your creative command center for recent video projects, credit balances, quick generation tools, and analytics.",
  },
  "/projects": {
    title: "My Projects",
    description: "Browse, open, organize, and manage all your active and exported video projects in Kreovar.",
  },
  "/projects/[id]": {
    title: "Project Overview",
    description: "View project details, asset links, export settings, and timeline history.",
  },
  "/editor": {
    title: "Online Video Editor",
    description: "Powerful browser-based video editing studio with multi-track timeline, AI assistant, transitions, and audio sync.",
  },
  "/editor/[id]": {
    title: "Edit Video Project",
    description: "Full-screen video editor timeline. Arrange video clips, sync captions, tweak voiceovers, and export your video.",
  },
  "/create": {
    title: "Quick Create Video",
    description: "Rapidly start a new video project with guided presets for TikTok, Reels, YouTube Shorts, or custom aspect ratios.",
  },
  "/script": {
    title: "AI Script Writer",
    description: "Generate viral, hook-driven video scripts tailored to your niche, audience, and preferred tone of voice.",
  },
  "/voice": {
    title: "Voice Studio",
    description: "Generate and preview natural AI voiceovers, adjust speed and tone, and download high-quality audio files.",
  },
  "/captions": {
    title: "Caption Studio",
    description: "Transcribe spoken audio, edit subtitles word-by-word, and style dynamic word-by-word animated captions.",
  },
  "/caption-templates": {
    title: "Caption Templates",
    description: "Explore trending animated subtitle styles, font pairings, text animations, and color schemes.",
  },
  "/preset-editor": {
    title: "Caption Preset Editor",
    description: "Customize caption styling parameters, typography, glow, shadow, and word highlight animations.",
  },
  "/broll": {
    title: "B-Roll Video Library",
    description: "Search and import curated stock B-roll clips directly onto your editing timeline.",
  },
  "/sfx": {
    title: "Sound Effects Library",
    description: "Discover high-impact whooshes, risers, pop sounds, and transitions to elevate your short-form video pacing.",
  },
  "/raw-footage": {
    title: "Raw Footage Storage",
    description: "Manage your uploaded raw video clips and media recordings in high-speed cloud storage.",
  },
  "/images": {
    title: "AI Image Generator",
    description: "Generate custom visual assets, backgrounds, and concept art using state-of-the-art AI diffusion models.",
  },
  "/thumbnails": {
    title: "Thumbnail Studio",
    description: "Design click-worthy video cover images and thumbnails optimized for social feeds.",
  },
  "/motion-graphics": {
    title: "Motion Graphics",
    description: "Add overlays, lower thirds, subscribe stickers, call-to-action animations, and motion elements.",
  },
  "/typography": {
    title: "Typography Studio",
    description: "Explore font collections, text styles, and kinetic typography animations for short videos.",
  },
  "/assets": {
    title: "Media Asset Library",
    description: "Centralized media library containing your uploaded footage, generated audio, audio effects, and images.",
  },
  "/saved": {
    title: "Saved Content & Kits",
    description: "Access your saved content ideas, viral hooks, script drafts, and favorite templates.",
  },
  "/trends": {
    title: "Viral Trend Radar",
    description: "Monitor trending topics, viral audio, sound bites, and formats across social video platforms.",
  },
  "/ideas": {
    title: "Content Idea Generator",
    description: "Brainstorm high-engagement video concepts, content pillars, and viral hooks for your brand.",
  },
  "/planner": {
    title: "Content Planner & Calendar",
    description: "Plan your weekly and monthly social video release schedule with organized project milestones.",
  },
  "/competitors": {
    title: "Competitor Research",
    description: "Analyze successful creator formats, pacing, and hooks to find viral opportunities in your niche.",
  },
  "/suggestions": {
    title: "Smart Suggestions",
    description: "AI-powered recommendations to optimize your video retention, hook phrasing, and caption readability.",
  },
  "/templates": {
    title: "Video Templates",
    description: "Pre-assembled video editing templates designed for fast social media turnaround.",
  },
  "/analytics": {
    title: "Video Analytics",
    description: "Track your video export metrics, credit utilization, and generation history.",
  },
  "/alerts": {
    title: "Notifications & Alerts",
    description: "System updates, generation completion alerts, and account notifications.",
  },
  "/upgrade": {
    title: "Upgrade to Pro",
    description: "Unlock unlimited video exports, premium AI voices, priority cloud rendering, and 1080p 60fps quality.",
  },
  "/affiliates": {
    title: "Affiliate Partner Program",
    description: "Earn recurring commissions by sharing Kreovar with your audience and creator community.",
  },
  "/settings": {
    title: "Account Settings",
    description: "Manage your personal profile, email preferences, security credentials, and interface theme.",
  },
  "/settings/billing": {
    title: "Billing & Subscription",
    description: "View active plan details, download invoices, manage payment methods, or modify your subscription.",
  },
  "/settings/billing/test": {
    title: "Billing Sandbox",
    description: "Developer testing environment for sandbox payment flows.",
  },
  "/checkout": {
    title: "Secure Checkout",
    description: "Complete your subscription upgrade with encrypted credit card or Whop checkout.",
  },
  "/checkout/[plan]": {
    title: "Plan Checkout",
    description: "Review your selected Kreovar plan features and complete checkout.",
  },
  "/checkout/return": {
    title: "Payment Confirmation",
    description: "Your payment was processed successfully. Welcome to Kreovar Pro!",
  },

  // Admin Portal
  "/admin": {
    title: "Admin Portal",
    description: "Administrative dashboard for system monitoring, user operations, and service metrics.",
  },
  "/admin-unlock": {
    title: "Admin Verification",
    description: "Secure verification required to access administrative controls.",
  },
  "/admin/control-center": {
    title: "Admin Control Center",
    description: "Global controls for platform features, maintenance toggles, and system alerts.",
  },
  "/admin/analytics": {
    title: "Admin Business Analytics",
    description: "Platform growth metrics, user signups, retention rates, and active subscriptions.",
  },
  "/admin/users": {
    title: "Admin User Management",
    description: "Search, inspect, and manage user accounts, permissions, and active subscriptions.",
  },
  "/admin/usage": {
    title: "Admin Resource Usage",
    description: "Monitor API quotas, generation job volume, and cloud rendering workload.",
  },
  "/admin/providers": {
    title: "Admin Provider Configurations",
    description: "Configure third-party AI model endpoints, fallback providers, and API rate limits.",
  },
  "/admin/settings": {
    title: "Admin System Settings",
    description: "Manage global platform configurations, security policies, and environment flags.",
  },
  "/admin/system": {
    title: "Admin System Health",
    description: "Real-time health status of database clusters, storage buckets, and rendering queues.",
  },
  "/admin/whop": {
    title: "Admin Whop Integration",
    description: "Monitor Whop membership events, webhooks, and license entitlement syncs.",
  },
};

/** Reverse lookup map linking legacy component labels to their exact canonical paths */
const LABEL_TO_PATH_MAP: Record<string, string> = {
  "Admin": "/admin",
  "Admin Verification": "/admin-unlock",
  "Unavailable": "/affiliates",
  "Alerts": "/alerts",
  "Analytics": "/analytics",
  "Asset Library": "/assets",
  "Authentication": "/auth/callback",
  "B-roll Library": "/broll",
  "Caption Templates": "/caption-templates",
  "Caption Studio": "/captions",
  "Checkout": "/checkout",
  "Competitor Analysis": "/competitors",
  "Confirm Email": "/confirm-email",
  "Create": "/create",
  "Dashboard": "/dashboard",
  "Video Editor": "/editor",
  "Forgot Password": "/forgot-password",
  "Content Ideas": "/ideas",
  "AI Images": "/images",
  "Sign In": "/login",
  "Motion Graphics": "/motion-graphics",
  "Planner": "/planner",
  "Reference Preset Editor": "/preset-editor",
  "Projects": "/projects",
  "Raw Footage": "/raw-footage",
  "Reset Password": "/reset-password",
  "Saved Content": "/saved",
  "Script Writer": "/script",
  "Settings": "/settings",
  "Sound Effects": "/sfx",
  "Create Account": "/signup",
  "Suggestions": "/suggestions",
  "Templates": "/templates",
  "Thumbnails": "/thumbnails",
  "Content Workflow": "/trends",
  "Upgrade": "/upgrade",
  "Voice Studio": "/voice",
};

export const PUBLIC_PAGES = Object.entries(ALL_PAGES_METADATA)
  .filter(([, cfg]) => cfg.isPublic)
  .map(([path, cfg]) => ({
    path,
    title: cfg.title,
    description: cfg.description,
  }));

export const PRIVATE_PAGES = Object.entries(ALL_PAGES_METADATA)
  .filter(([, cfg]) => !cfg.isPublic)
  .reduce<Record<string, string>>((acc, [path, cfg]) => {
    acc[path] = cfg.title;
    return acc;
  }, {});

export function isPrivateRoute(path: string) {
  return ["/api", ...Object.keys(PRIVATE_PAGES)].some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  );
}

/** Standard Geo meta tags for AEO and GEO engine indexing */
export const GEO_METADATA = {
  "geo.region": "US",
  "geo.placename": "Worldwide",
  "geo.position": "37.7749;-122.4194",
  "ICBM": "37.7749, -122.4194",
};

/** Generates canonical, indexable metadata for public landing, feature, and legal pages */
export function publicMetadata(path: string): Metadata {
  const cfg = ALL_PAGES_METADATA[path] || {
    title: "Kreovar | AI Content Studio & Online Video Editor",
    description: SITE_DESCRIPTION,
  };

  const title = path === "/" ? { absolute: cfg.title } : cfg.title;
  const shareTitle = path === "/" ? cfg.title : `${cfg.title} | Kreovar`;
  const canonicalUrl = new URL(path, SITE_URL).href;

  return {
    title,
    description: cfg.description,
    keywords: cfg.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: PUBLIC_ROBOTS,
    openGraph: {
      type: "website",
      siteName: "Kreovar",
      locale: "en_US",
      title: shareTitle,
      description: cfg.description,
      url: canonicalUrl,
      images: [
        {
          url: `${SITE_URL}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: "Kreovar content creation and video editing studio",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: cfg.description,
      images: [`${SITE_URL}/opengraph-image`],
    },
    other: {
      ...GEO_METADATA,
    },
  };
}

/** Generates canonical, noindex metadata for authenticated, app, or admin pages */
export function privateMetadata(
  titleOrPath: string,
  customDescription?: string,
  customPath?: string
): Metadata {
  const isDirectPath = titleOrPath.startsWith("/");
  const resolvedPath = isDirectPath
    ? titleOrPath
    : customPath || LABEL_TO_PATH_MAP[titleOrPath] || `/${titleOrPath.toLowerCase().replace(/[\s_]+/g, "-")}`;

  const cfg = ALL_PAGES_METADATA[resolvedPath];

  const rawTitle = cfg?.title || (!isDirectPath ? titleOrPath : "Kreovar Studio");
  const description = customDescription || cfg?.description || `${rawTitle} — Kreovar Studio`;
  const canonicalUrl = new URL(resolvedPath, SITE_URL).href;

  return {
    title: rawTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: PRIVATE_ROBOTS,
    openGraph: {
      type: "website",
      siteName: "Kreovar",
      title: `${rawTitle} | Kreovar`,
      description,
      url: canonicalUrl,
    },
    twitter: {
      card: "summary",
      title: `${rawTitle} | Kreovar`,
      description,
    },
  };
}
