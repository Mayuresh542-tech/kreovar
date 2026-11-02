import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { verifyWhopSignature, processWhopWebhook } from "@/app/lib/server/whopService";

export const dynamic = "force-dynamic";

async function postHandler(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("webhook-signature") ||
      req.headers.get("whop-signature") ||
      req.headers.get("x-whop-signature");

    // 1. Verify signature
    const isValid = verifyWhopSignature(rawBody, signature, undefined, Object.fromEntries(req.headers.entries()));
    if (!isValid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Determine event ID for idempotency
    const eventId =
      payload.event_id ||
      payload.id ||
      `body_${createHash("sha256").update(rawBody).digest("hex")}`;

    // 2. Process event idempotently
    const result = await processWhopWebhook(payload, eventId);

    return NextResponse.json({
      received: true,
      processed: !result.duplicate,
      message: result.message,
    });
  } catch (err: any) {
    console.error("[Whop Webhook Error]: Verification or subscription update failed.");
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
