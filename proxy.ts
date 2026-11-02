import {controlledFeature} from "./app/lib/adminControls";
import {isPrivateRoute} from "./app/lib/seo";
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getAuthenticatedUser, getAdminClient, requireAdmin } from "./app/lib/server/adminAuth";
import { isSafeMutation, ratePolicy, requestBodyLimit, securityHeaders } from "./app/lib/server/requestSecurity";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const protection = securityHeaders(nonce, process.env.NODE_ENV === "development");
  const finish = (response: NextResponse) => {
    for (const [key, value] of Object.entries(protection)) response.headers.set(key, value);
    if(isPrivateRoute(path))response.headers.set("X-Robots-Tag","noindex, nofollow");
    if (req.nextUrl.protocol === "https:") response.headers.set("Strict-Transport-Security", "max-age=31536000");
    if (path.startsWith("/api/") || path === "/admin" || path.startsWith("/admin/")) response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const requestHeaders = new Headers(req.headers);
  // Never trust a nonce or verified identity header supplied by a client.
  requestHeaders.delete("x-verified-user-id");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", protection["Content-Security-Policy"]);
  try {
    if (path === "/admin" || path.startsWith("/admin/")) {
      const auth = await requireAdmin(req);
      if ("error" in auth) {
        if (auth.error.status === 401) return finish(NextResponse.redirect(new URL("/login", req.url)));
        if (auth.error.status === 403) { const body = await auth.error.json(); return finish(NextResponse.redirect(new URL(body.code === "MFA_REQUIRED" ? "/admin-unlock" : "/dashboard", req.url))); }
        return finish(auth.error);
      }
    }
    if (path.startsWith("/api/")) {
      const length = req.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > requestBodyLimit(path))) return finish(NextResponse.json({ error: "Request is too large." }, { status: 413 }));
      const webhook = path === "/api/webhooks/whop" || path === "/api/webhooks/dodo";
      if (!webhook && !isSafeMutation(req)) return finish(NextResponse.json({ error: "Cross-site request denied." }, { status: 403 }));
      const publicTemplates = path === "/api/captions/templates" && req.method === "GET";
      if (!webhook && !publicTemplates) {
        const user = await getAuthenticatedUser(req);
        if (!user) return finish(NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 }));
        if(user.app_metadata?.admin_suspended===true)return finish(NextResponse.json({error:"This account is suspended. Contact support.",code:"ACCOUNT_SUSPENDED"},{status:403}));
        if (user.app_metadata?.account_deletion_pending && path !== "/api/account") return finish(NextResponse.json({ error: "Your account deletion is in progress. Return to Settings to finish deleting your account.", code: "ACCOUNT_DELETION_PENDING" }, { status: 423 }));
        if (path === "/api/admin" || path.startsWith("/api/admin/")) {
          const auth = await requireAdmin(req);
          if ("error" in auth) return finish(auth.error);
        }
        const policy = ratePolicy(path, req.method);
        const { data, error } = await getAdminClient().rpc("consume_api_rate_limit", { p_user_id: user.id, p_scope: policy.scope, p_limit: policy.limit, p_window_seconds: policy.seconds });
        if (error) return finish(NextResponse.json({ error: "Request protection is temporarily unavailable. Please retry." }, { status: 503 }));
        if (data !== true) return finish(NextResponse.json({ error: "Too many requests. Please wait before retrying." }, { status: 429, headers: { "Retry-After": String(policy.seconds) } }));
        const feature=controlledFeature(path,req.method);
        if(feature){
          const {data:controls,error:controlError}=await getAdminClient().from("admin_feature_controls").select("key,value").in("key",["maintenance",feature]);
          if(controlError)return finish(NextResponse.json({error:"Tool availability could not be checked. Please retry."},{status:503}));
          const maintenance=controls?.find(c=>c.key==="maintenance")?.value;
          const tool=controls?.find(c=>c.key===feature)?.value;
          if(maintenance?.enabled===true||tool?.enabled===false)return finish(NextResponse.json({error:(maintenance?.enabled===true?maintenance.message:tool?.message)||"This tool is temporarily unavailable. Please try again later.",code:"FEATURE_UNAVAILABLE"},{status:503}));
        }
        const token = getAccessToken(req);
        if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
      }
    }
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  } catch {
    return finish(NextResponse.json({ error: "Authentication is temporarily unavailable. Please retry." }, { status: 503 }));
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
