import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_KIT_COST, VOICE_SYNTHESIS_COST, FEATURE_CREDIT_COSTS } from "../../config/credits";

import { isAdminEmail } from "../admin";

// Numeric compatibility for existing credit checks; flagged admins are never charged.
export const UNLIMITED_CREDIT_BALANCE = 2147483647;

export async function hasUnlimitedCredits(userId: string): Promise<boolean> {
  const { data, error } = await getDb().auth.admin.getUserById(userId);
  if (error) throw new Error("Could not verify credit entitlement.");
  return isAdminEmail(data.user?.email) && data.user?.app_metadata?.unlimited_credits === true;
}

export const VIDEO_RENDER_COST = FEATURE_CREDIT_COSTS.VIDEO_DRAFT;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getDb(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase configuration in creditService");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CreditBalanceResult {
  unlimited?: boolean;
  credits: number;
  plan: string;
  status: string;
}

export interface DeductCreditsResult {
  success: boolean;
  creditsRemaining: number;
  transactionId?: string;
  error?: string;
}

/**
 * Ensures user has an active subscription record (defaults to free plan with 30 credits).
 */
export async function ensureUserSubscription(userId: string): Promise<CreditBalanceResult> {
  const db = getDb();
  const unlimited = await hasUnlimitedCredits(userId);

  const { data: existing, error } = await db
    .from("subscriptions")
    .select("credits, plan, status, source")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Could not load your subscription. Please retry.");
  if (existing?.source === "whop") {
    const { data: fresh, error: refreshError } = await db.rpc("refresh_kreovar_whop_credits", { p_user_id: userId });
    if (refreshError || !fresh) throw new Error("Could not refresh your subscription. Please retry.");
    return { credits: unlimited ? UNLIMITED_CREDIT_BALANCE : fresh.credits, unlimited, plan: fresh.plan, status: fresh.status };
  }
  if (existing) {
    return {
      credits: unlimited ? UNLIMITED_CREDIT_BALANCE : existing.credits ?? 30,
      unlimited,
      plan: existing.plan ?? "free",
      status: existing.status ?? "active",
    };
  }

  // Insert default free subscription
  const { data: created, error: createError } = await db
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan: "free",
        status: "active",
        credits: 30,
        source: "direct",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    )
    .select("credits, plan, status")
    .maybeSingle();
  if (createError) throw new Error("Could not initialize your subscription. Please retry.");
  const current = created || (await db.from("subscriptions").select("credits, plan, status").eq("user_id", userId).single()).data;
  if (!current) throw new Error("Could not confirm your subscription. Please retry.");

  return {
    credits: unlimited ? UNLIMITED_CREDIT_BALANCE : current.credits ?? 30,
    unlimited,
    plan: current.plan ?? "free",
    status: current.status ?? "active",
  };
}

/**
 * Checks the user's current credit balance.
 */
export async function getUserCreditBalance(userId: string): Promise<CreditBalanceResult> {
  return ensureUserSubscription(userId);
}

/**
 * Atomically reserves/deducts 5 credits for Content Kit generation.
 * Enforces server-side rule: balance >= 5 credits.
 * Prevents race conditions and negative balances via atomic SQL / PostgreSQL function.
 */
export async function deductCreditsForContentKit(
  userId: string,
  topic?: string
): Promise<DeductCreditsResult> {
  if (await hasUnlimitedCredits(userId)) return { success: true, creditsRemaining: UNLIMITED_CREDIT_BALANCE };
  const db = getDb();

  // Ensure subscription row exists
  await ensureUserSubscription(userId);

  // 1. Try atomic PostgreSQL RPC function first
  try {
    const { data, error } = await db.rpc("deduct_credits", {
      p_user_id: userId,
      p_amount: CONTENT_KIT_COST,
      p_action: "content_kit",
      p_reference_id: topic || null,
    });

    if (!error && data) {
      if (!data.success) {
        return {
          success: false,
          creditsRemaining: data.credits_remaining ?? 0,
          error: "You need 5 credits to generate a Content Kit.",
        };
      }

      return {
        success: true,
        creditsRemaining: data.credits_remaining,
        transactionId: data.transaction_id,
      };
    }
  } catch (rpcErr) {
    console.warn("[creditService] RPC deduct_credits fallback to direct atomic query:", rpcErr);
  }

  // 2. Fallback: Direct atomic update with WHERE credits >= 5
  // This guarantees race condition safety if RPC fails
  const { data: currentSub } = await db
    .from("subscriptions")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const currentCredits = currentSub?.credits ?? 0;
  if (currentCredits < CONTENT_KIT_COST) {
    return {
      success: false,
      creditsRemaining: currentCredits,
      error: "You need 5 credits to generate a Content Kit.",
    };
  }

  const { data: updatedSub, error: updateErr } = await db
    .from("subscriptions")
    .update({
      credits: currentCredits - CONTENT_KIT_COST,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("credits", currentCredits)
    .gte("credits", CONTENT_KIT_COST)
    .select("credits")
    .single();

  if (updateErr || !updatedSub) {
    // Another concurrent request consumed the credits
    const { data: rechecked } = await db
      .from("subscriptions")
      .select("credits")
      .eq("user_id", userId)
      .single();

    return {
      success: false,
      creditsRemaining: rechecked?.credits ?? 0,
      error: "You need 5 credits to generate a Content Kit.",
    };
  }

  // Record transaction ledger entry
  const { data: txRecord } = await db
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: -CONTENT_KIT_COST,
      type: "usage",
      feature: "content_kit",
      action: "content_kit",
      credits_used: CONTENT_KIT_COST,
      status: "pending",
      reference_id: topic || null,
    })
    .select("id")
    .single();

  return {
    success: true,
    creditsRemaining: updatedSub.credits,
    transactionId: txRecord?.id,
  };
}

/**
 * Marks a pending credit transaction as completed and links the generated content_kit_id.
 */
export async function completeCreditTransaction(
  transactionId?: string,
  contentKitId?: string
): Promise<void> {
  if (!transactionId) return;
  const db = getDb();

  try {
    // Try RPC
    await db.rpc("complete_credit_transaction", {
      p_transaction_id: transactionId,
      p_reference_id: contentKitId || null,
    });
  } catch {
    // Fallback direct update
    await db
      .from("credit_transactions")
      .update({
        status: "completed",
        reference_id: contentKitId || null,
        content_kit_id: contentKitId || null,
      })
      .eq("id", transactionId);
  }
}

/**
 * Automatically refunds 5 credits if AI generation fails or times out.
 * Records the refund transaction.
 */
export async function refundCreditsForContentKit(
  userId: string,
  transactionId?: string,
  reason?: string
): Promise<{ success: boolean; creditsRemaining: number }> {
  if (await hasUnlimitedCredits(userId)) return { success: true, creditsRemaining: UNLIMITED_CREDIT_BALANCE };
  const db = getDb();

  // 1. Try atomic PostgreSQL RPC function
  try {
    const { data, error } = await db.rpc("refund_credits", {
      p_user_id: userId,
      p_amount: CONTENT_KIT_COST,
      p_action: "content_kit",
      p_transaction_id: transactionId || null,
      p_reason: reason || "generation_failed",
    });

    if (!error && data && data.success) {
      return {
        success: true,
        creditsRemaining: data.credits_remaining,
      };
    }
  } catch (rpcErr) {
    console.warn("[creditService] RPC refund_credits fallback to direct query:", rpcErr);
  }

  // 2. Direct fallback
  const { data: sub } = await db
    .from("subscriptions")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const newCredits = (sub?.credits ?? 0) + CONTENT_KIT_COST;

  await db
    .from("subscriptions")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (transactionId) {
    await db
      .from("credit_transactions")
      .update({ status: "failed" })
      .eq("id", transactionId);
  }

  await db.from("credit_transactions").insert({
    user_id: userId,
    amount: CONTENT_KIT_COST,
    type: "refund",
    feature: "content_kit",
    action: "content_kit",
    credits_used: -CONTENT_KIT_COST,
    status: "refunded",
    reference_id: transactionId || reason || "auto_refund",
  });

  return {
    success: true,
    creditsRemaining: newCredits,
  };
}

/**
 * Atomically reserves/deducts credits for Voiceover generation (5 credits).
 * Server-side enforced, prevents race conditions and negative balances.
 */
export async function deductCreditsForVoice(
  userId: string,
  referenceText?: string
): Promise<DeductCreditsResult> {
  if (await hasUnlimitedCredits(userId)) return { success: true, creditsRemaining: UNLIMITED_CREDIT_BALANCE };
  const db = getDb();
  await ensureUserSubscription(userId);

  // 1. Try atomic PostgreSQL RPC function
  try {
    const { data, error } = await db.rpc("deduct_credits", {
      p_user_id: userId,
      p_amount: VOICE_SYNTHESIS_COST,
      p_action: "voice_generation",
      p_reference_id: referenceText ? referenceText.slice(0, 100) : null,
    });

    if (!error && data) {
      if (!data.success) {
        return {
          success: false,
          creditsRemaining: data.credits_remaining ?? 0,
          error: `You need ${VOICE_SYNTHESIS_COST} credits to generate a Voiceover.`,
        };
      }

      return {
        success: true,
        creditsRemaining: data.credits_remaining,
        transactionId: data.transaction_id,
      };
    }
  } catch (rpcErr) {
    console.warn("[creditService] RPC deduct_credits fallback for voice:", rpcErr);
  }

  // 2. Direct atomic update with WHERE credits >= VOICE_SYNTHESIS_COST
  const { data: currentSub } = await db
    .from("subscriptions")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const currentCredits = currentSub?.credits ?? 0;
  if (currentCredits < VOICE_SYNTHESIS_COST) {
    return {
      success: false,
      creditsRemaining: currentCredits,
      error: `You need ${VOICE_SYNTHESIS_COST} credits to generate a Voiceover.`,
    };
  }

  const { data: updatedSub, error: updateErr } = await db
    .from("subscriptions")
    .update({
      credits: currentCredits - VOICE_SYNTHESIS_COST,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("credits", currentCredits)
    .gte("credits", VOICE_SYNTHESIS_COST)
    .select("credits")
    .single();

  if (updateErr || !updatedSub) {
    const { data: rechecked } = await db
      .from("subscriptions")
      .select("credits")
      .eq("user_id", userId)
      .single();

    return {
      success: false,
      creditsRemaining: rechecked?.credits ?? 0,
      error: `You need ${VOICE_SYNTHESIS_COST} credits to generate a Voiceover.`,
    };
  }

  const { data: txRecord } = await db
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: -VOICE_SYNTHESIS_COST,
      type: "usage",
      feature: "voice_synthesis",
      action: "voice_generation",
      credits_used: VOICE_SYNTHESIS_COST,
      status: "pending",
      reference_id: referenceText ? referenceText.slice(0, 100) : null,
    })
    .select("id")
    .single();

  return {
    success: true,
    creditsRemaining: updatedSub.credits,
    transactionId: txRecord?.id,
  };
}

/**
 * Automatically refunds credits if Voiceover generation fails or times out.
 */
export async function refundCreditsForVoice(
  userId: string,
  transactionId?: string,
  reason?: string
): Promise<{ success: boolean; creditsRemaining: number }> {
  if (await hasUnlimitedCredits(userId)) return { success: true, creditsRemaining: UNLIMITED_CREDIT_BALANCE };
  const db = getDb();

  try {
    const { data, error } = await db.rpc("refund_credits", {
      p_user_id: userId,
      p_amount: VOICE_SYNTHESIS_COST,
      p_action: "voice_generation",
      p_transaction_id: transactionId || null,
      p_reason: reason || "voice_generation_failed",
    });

    if (!error && data && data.success) {
      return {
        success: true,
        creditsRemaining: data.credits_remaining,
      };
    }
  } catch (rpcErr) {
    console.warn("[creditService] RPC refund_credits fallback for voice:", rpcErr);
  }

  // Direct fallback
  const { data: sub } = await db
    .from("subscriptions")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const newCredits = (sub?.credits ?? 0) + VOICE_SYNTHESIS_COST;

  await db
    .from("subscriptions")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (transactionId) {
    await db
      .from("credit_transactions")
      .update({ status: "failed" })
      .eq("id", transactionId);
  }

  await db.from("credit_transactions").insert({
    user_id: userId,
    amount: VOICE_SYNTHESIS_COST,
    type: "refund",
    feature: "voice_synthesis",
    action: "voice_generation",
    credits_used: -VOICE_SYNTHESIS_COST,
    status: "refunded",
    reference_id: transactionId || reason || "auto_refund_voice",
  });

  return {
    success: true,
    creditsRemaining: newCredits,
  };
}

/**
 * Atomically reserves/deducts credits for Video Compilation/Render (25 credits).
 * Server-side enforced, prevents race conditions and negative balances.
 */
export async function deductCreditsForVideoRender(
  userId: string,
  projectId?: string
): Promise<DeductCreditsResult> {
  if (await hasUnlimitedCredits(userId)) return { success: true, creditsRemaining: UNLIMITED_CREDIT_BALANCE };
  const db = getDb();
  await ensureUserSubscription(userId);

  // 1. Try atomic PostgreSQL RPC function
  try {
    const { data, error } = await db.rpc("deduct_credits", {
      p_user_id: userId,
      p_amount: VIDEO_RENDER_COST,
      p_action: "video_render",
      p_reference_id: projectId || null,
    });

    if (!error && data) {
      if (!data.success) {
        return {
          success: false,
          creditsRemaining: data.credits_remaining ?? 0,
          error: `You need ${VIDEO_RENDER_COST} credits to render a full AI video.`,
        };
      }

      return {
        success: true,
        creditsRemaining: data.credits_remaining,
        transactionId: data.transaction_id,
      };
    }
  } catch (rpcErr) {
    console.warn("[creditService] RPC deduct_credits fallback for video render:", rpcErr);
  }

  // 2. Direct atomic update with WHERE credits >= VIDEO_RENDER_COST
  const { data: currentSub } = await db
    .from("subscriptions")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const currentCredits = currentSub?.credits ?? 0;
  if (currentCredits < VIDEO_RENDER_COST) {
    return {
      success: false,
      creditsRemaining: currentCredits,
      error: `You need ${VIDEO_RENDER_COST} credits to render a full AI video.`,
    };
  }

  const { data: updatedSub, error: updateErr } = await db
    .from("subscriptions")
    .update({
      credits: currentCredits - VIDEO_RENDER_COST,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("credits", currentCredits)
    .gte("credits", VIDEO_RENDER_COST)
    .select("credits")
    .single();

  if (updateErr || !updatedSub) {
    const { data: rechecked } = await db
      .from("subscriptions")
      .select("credits")
      .eq("user_id", userId)
      .single();

    return {
      success: false,
      creditsRemaining: rechecked?.credits ?? 0,
      error: `You need ${VIDEO_RENDER_COST} credits to render a full AI video.`,
    };
  }

  const { data: txRecord } = await db
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: -VIDEO_RENDER_COST,
      type: "usage",
      feature: "video_render",
      action: "render_video",
      credits_used: VIDEO_RENDER_COST,
      status: "pending",
      reference_id: projectId || null,
    })
    .select("id")
    .single();

  return {
    success: true,
    creditsRemaining: updatedSub.credits,
    transactionId: txRecord?.id,
  };
}

/**
 * Automatically refunds credits if Video Rendering fails or aborts.
 */
export async function refundCreditsForVideoRender(
  userId: string,
  transactionId?: string,
  reason?: string
): Promise<{ success: boolean; creditsRemaining: number }> {
  if (await hasUnlimitedCredits(userId)) return { success: true, creditsRemaining: UNLIMITED_CREDIT_BALANCE };
  const db = getDb();

  try {
    const { data, error } = await db.rpc("refund_credits", {
      p_user_id: userId,
      p_amount: VIDEO_RENDER_COST,
      p_action: "video_render",
      p_transaction_id: transactionId || null,
      p_reason: reason || "video_render_failed",
    });

    if (!error && data && data.success) {
      return {
        success: true,
        creditsRemaining: data.credits_remaining,
      };
    }
  } catch (rpcErr) {
    console.warn("[creditService] RPC refund_credits fallback for video render:", rpcErr);
  }

  // Direct fallback
  const { data: sub } = await db
    .from("subscriptions")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const newCredits = (sub?.credits ?? 0) + VIDEO_RENDER_COST;

  await db
    .from("subscriptions")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (transactionId) {
    await db
      .from("credit_transactions")
      .update({ status: "failed" })
      .eq("id", transactionId);
  }

  await db.from("credit_transactions").insert({
    user_id: userId,
    amount: VIDEO_RENDER_COST,
    type: "refund",
    feature: "video_render",
    action: "render_video",
    credits_used: -VIDEO_RENDER_COST,
    status: "refunded",
    reference_id: transactionId || reason || "auto_refund_video_render",
  });

  return {
    success: true,
    creditsRemaining: newCredits,
  };
}
