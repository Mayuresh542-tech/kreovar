export type PlanId = "free" | "pro" | "creator" | "studio";

export interface PlanConfig {
  id: PlanId;
  name: string;
  price: number;
  yearlyPrice: number;
  currency: string;
  displayPrice: string;
  yearlyDisplayPrice: string;
  billingPeriod: "monthly" | "forever";
  monthlyCredits: number;
  description: string;
  badge?: string;
  highlight?: boolean;
  features: string[];
  directCheckoutEnabled: boolean;
  whopCheckoutEnabled: boolean;
  whopCheckoutUrl: string;
}

export type BillingCycle = "monthly" | "yearly";
export const WHOP_DEFAULT_CHECKOUT_URL = "https://whop.com/veelox-studio-0b8d/kreovar/";
export const WHOP_YEARLY_CHECKOUT_URL = "https://whop.com/veelox-studio-0b8d/kreovar-yearly/";
export function getWhopCheckoutUrl(cycle: BillingCycle): string {
  return cycle === "yearly" ? WHOP_YEARLY_CHECKOUT_URL : WHOP_DEFAULT_CHECKOUT_URL;
}

const FREE_PLAN: PlanConfig = {
  id: "free",
  name: "Free",
  price: 0,
  yearlyPrice: 0,
  currency: "USD",
  displayPrice: "$0",
  yearlyDisplayPrice: "$0",
  billingPeriod: "forever",
  monthlyCredits: 0,
  description: "Monthly allowances to try the content tools and manual editor.",
  features: ["3 Content Kits per month", "1,000 voiceover characters per month", "2 minutes of automatic captions per month", "1 AI editing plan per month", "2 active projects", "3 exports at 720p per month", "10 B-roll / SFX downloads per month", "All caption styles and manual editing", "Videos up to 60 seconds"],
  directCheckoutEnabled: false,
  whopCheckoutEnabled: false,
  whopCheckoutUrl: "",
};

const PRO_PLAN: PlanConfig = {
  id: "pro",
  name: "Pro",
  price: 19,
  yearlyPrice: 190,
  currency: "USD",
  displayPrice: "$19",
  yearlyDisplayPrice: "$190",
  billingPeriod: "monthly",
  monthlyCredits: 0, // Legacy balances remain separate from feature allowances.
  description: "The primary plan for solo creators and teams producing weekly viral content.",
  highlight: true,
  badge: "MOST POPULAR",
  features: ["30 Content Kits per month", "20,000 voiceover characters per month", "30 minutes of automatic captions per month", "10 AI editing plans per month", "20 active projects", "Unlimited exports up to 1080p", "100 B-roll / SFX downloads per month", "All caption styles and manual editing", "Videos up to 60 seconds", "Allowances reset monthly on both billing plans"],
  directCheckoutEnabled: true,
  whopCheckoutEnabled: true,
  whopCheckoutUrl: WHOP_DEFAULT_CHECKOUT_URL,
};

export const PLANS: Record<PlanId, PlanConfig> = {
  free: FREE_PLAN,
  pro: PRO_PLAN,
  // Backward compatibility aliases for existing DB records & webhook event handlers
  creator: {
    ...PRO_PLAN,
    id: "creator",
    name: "Pro",
  },
  studio: {
    ...PRO_PLAN,
    id: "studio",
    name: "Pro",
  },
};

export function getPlan(id: string): PlanConfig | null {
  const normalized = id.toLowerCase().trim() as PlanId;
  if (normalized === "free") return PLANS.free;
  if (normalized === "pro" || normalized === "creator" || normalized === "studio") {
    return PLANS.pro;
  }
  return null;
}

export function getAllPlans(): PlanConfig[] {
  // Return ONLY the two modern plans for the UI
  return [PLANS.free, PLANS.pro];
}
