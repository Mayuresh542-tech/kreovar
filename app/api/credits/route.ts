import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserCreditBalance } from "../../lib/server/creditService";
import { calculateContentKitAllowance, CONTENT_KIT_COST } from "../../config/credits";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getHandler(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { credits, plan, status, unlimited } = await getUserCreditBalance(authData.user.id);

    return NextResponse.json({
      credits,
      unlimited: unlimited === true,
      plan,
      status,
      contentKitCost: CONTENT_KIT_COST,
      contentKitAllowance: calculateContentKitAllowance(credits),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch credits" }, { status: 500 });
  }
}

export const GET = withSafeResponse(getHandler);
