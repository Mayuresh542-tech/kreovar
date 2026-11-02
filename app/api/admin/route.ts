import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../lib/server/adminAuth";

// This route reads the caller's Authorization header to authorize, so it must
// always run dynamically at request time (never prerendered/cached).
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Service-role client — bypasses Row Level Security so the admin panel can read
 * across every user. This key is server-only (no NEXT_PUBLIC_ prefix) and must
 * NEVER be imported into a client component.
 */
function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Authorize the request: validate the bearer token against Supabase Auth and
 * confirm the resolved user is the admin. Returns the admin client on success,
 * or a NextResponse error to short-circuit. The client's claims are never
 * trusted — identity comes from verifying the JWT server-side.
 */
async function authorize(
  req: NextRequest,
): Promise<{ db: SupabaseClient } | { error: NextResponse }> {
  return requireAdmin(req);
}

interface ActivityItem {
  type: "search" | "script" | "suggestion";
  label: string;
  email: string;
  created_at: string;
}

async function getHandler(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  const { db } = auth;

  try {
    // All users (service role only — auth.users isn't reachable via anon key).
    const { data: usersData, error: usersErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const users = usersData.users ?? [];
    const emailById = new Map(users.map((u) => [u.id, u.email ?? "(unknown)"]));

    // Accurate headline totals via exact head counts (cheap, not row-capped).
    const [searchCount, kitCount, suggestionCount] = await Promise.all([
      db.from("searches").select("*", { count: "exact", head: true }),
      db.from("content_kits").select("*", { count: "exact", head: true }),
      db.from("suggestions").select("*", { count: "exact", head: true }),
    ]);

    // Rows for aggregation/feeds. Capped at 1000 (Supabase default) — fine at
    // this app's scale; headline totals above stay exact regardless.
    const [searchesRes, kitsRes, suggestionsRes] = await Promise.all([
      db
        .from("searches")
        .select("user_id, niche, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("content_kits")
        .select("user_id, topic, niche, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("suggestions")
        .select("id, name, email, type, message, read, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (searchesRes.error) throw searchesRes.error;
    if (kitsRes.error) throw kitsRes.error;
    if (suggestionsRes.error) throw suggestionsRes.error;

    const searches = searchesRes.data ?? [];
    const kits = kitsRes.data ?? [];
    const suggestions = suggestionsRes.data ?? [];

    // Per-user counts for the users table.
    const searchByUser = new Map<string, number>();
    for (const s of searches) searchByUser.set(s.user_id, (searchByUser.get(s.user_id) ?? 0) + 1);
    const scriptByUser = new Map<string, number>();
    for (const k of kits) scriptByUser.set(k.user_id, (scriptByUser.get(k.user_id) ?? 0) + 1);

    // Popular niches (top 5 by search volume) + headline "most popular".
    const nicheCounts = new Map<string, number>();
    for (const s of searches) {
      const n = (s.niche ?? "").trim().toLowerCase();
      if (n) nicheCounts.set(n, (nicheCounts.get(n) ?? 0) + 1);
    }
    const popularNiches = [...nicheCounts.entries()]
      .map(([niche, count]) => ({ niche, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // New users in the last 7 days.
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newUsersThisWeek = users.filter(
      (u) => u.created_at && new Date(u.created_at).getTime() >= weekAgo,
    ).length;

    const usersTable = users
      .map((u) => ({
        id: u.id,
        email: u.email ?? "(no email)",
        created_at: u.created_at,
        searches: searchByUser.get(u.id) ?? 0,
        scripts: scriptByUser.get(u.id) ?? 0,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Recent activity — merge searches, generated kits, and suggestions.
    const activity: ActivityItem[] = [
      ...searches.map((s) => ({
        type: "search" as const,
        label: s.niche ?? "(niche)",
        email: emailById.get(s.user_id) ?? "(unknown)",
        created_at: s.created_at,
      })),
      ...kits.map((k) => ({
        type: "script" as const,
        label: k.topic ?? "(topic)",
        email: emailById.get(k.user_id) ?? "(unknown)",
        created_at: k.created_at,
      })),
      ...suggestions.map((s) => ({
        type: "suggestion" as const,
        label: s.message ?? s.type ?? "(suggestion)",
        email: s.email ?? "(anonymous)",
        created_at: s.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);

    return NextResponse.json({
      stats: {
        totalUsers: users.length,
        totalSearches: searchCount.count ?? searches.length,
        totalScripts: kitCount.count ?? kits.length,
        totalSuggestions: suggestionCount.count ?? suggestions.length,
        newUsersThisWeek,
        mostPopularNiche: popularNiches[0]?.niche ?? "—",
      },
      users: usersTable,
      suggestions,
      recentActivity: activity,
      popularNiches,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load admin data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Mark a suggestion as read (admin-only). */
async function postHandler(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  const { db } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action !== "markRead" || typeof body.id !== "string") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const { error } = await db.from("suggestions").update({ read: true }).eq("id", body.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));

export const GET = withSafeResponse(getHandler);
