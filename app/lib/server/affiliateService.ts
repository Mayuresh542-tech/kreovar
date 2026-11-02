import { createAdminSupabaseClient } from "./admin";

export interface AffiliateRecord {
  id: string;
  user_id: string;
  referral_code: string;
  status: string;
  commission_rate: number;
  created_at: string;
}

/**
 * Get or create an affiliate account for a given user.
 */
export async function getOrCreateAffiliate(userId: string, email: string): Promise<AffiliateRecord> {
  const db = createAdminSupabaseClient();

  // 1. Check if user already has an affiliate record
  const { data: existing, error: fetchErr } = await db
    .from("affiliates")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  // 2. Generate clean referral code from email handle or random hex
  const handle = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const referralCode = `${handle || "CREATOR"}${randomSuffix}`;

  // 3. Create affiliate record
  const { data: created, error: insertErr } = await db
    .from("affiliates")
    .insert({
      user_id: userId,
      referral_code: referralCode,
      status: "active",
      commission_rate: 0.2, // 20% default affiliate commission
    })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return created;
}

/**
 * Record a referral when a referred user signs up.
 * Idempotent: each referred user can only have one referring affiliate.
 */
export async function recordAffiliateReferral(
  referralCode: string,
  referredUserId: string,
  source: string = "direct"
): Promise<boolean> {
  if (!referralCode || !referredUserId) return false;

  const db = createAdminSupabaseClient();
  const cleanCode = referralCode.trim().toUpperCase();

  // Find affiliate by referral_code
  const { data: affiliate } = await db
    .from("affiliates")
    .select("id, user_id")
    .eq("referral_code", cleanCode)
    .maybeSingle();

  if (!affiliate || affiliate.user_id === referredUserId) {
    // Affiliate not found or user cannot refer themselves
    return false;
  }

  // Insert referral record
  const { error } = await db.from("affiliate_referrals").upsert(
    {
      affiliate_id: affiliate.id,
      referred_user_id: referredUserId,
      referral_code: cleanCode,
      source,
    },
    { onConflict: "referred_user_id", ignoreDuplicates: true }
  );

  return !error;
}

/**
 * Record a pending affiliate commission when a subscription is paid or renewed.
 * Does NOT mark as paid automatically.
 */
export async function recordAffiliateCommission(
  referredUserId: string,
  subscriptionId: string,
  amount: number
): Promise<boolean> {
  if (!referredUserId || !amount || amount <= 0) return false;

  const db = createAdminSupabaseClient();

  // Check if this user was referred by an affiliate
  const { data: referral } = await db
    .from("affiliate_referrals")
    .select("affiliate_id")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (!referral) return false;

  // Get affiliate commission rate
  const { data: affiliate } = await db
    .from("affiliates")
    .select("commission_rate, status")
    .eq("id", referral.affiliate_id)
    .maybeSingle();

  if (!affiliate || affiliate.status !== "active") return false;

  const rate = affiliate.commission_rate ?? 0.2;
  const commissionAmount = Number((amount * rate).toFixed(2));

  // Insert pending commission
  const { error } = await db.from("affiliate_commissions").insert({
    affiliate_id: referral.affiliate_id,
    referred_user_id: referredUserId,
    subscription_id: subscriptionId,
    amount: commissionAmount,
    status: "pending", // Keep pending; payout handling is separate and future-ready
  });

  return !error;
}
