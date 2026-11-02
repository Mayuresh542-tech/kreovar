// Shared helpers for the Trend Alerts feature.
//
// Trend results for each saved niche are cached in localStorage so the /alerts
// page is instant on revisit and can show a "freshness" timestamp, and so the
// sidebar/dashboard bell can read a total count without re-scanning every niche.
import { useSyncExternalStore } from "react";

export interface AlertTrend {
  title: string;
  source: string;
  trendScore: number;
  label?: string;
  category?: string;
  url?: string;
}

export interface NicheCache {
  niche: string;
  trends: AlertTrend[];
  savedAt: number;
}

/** Aggregate read by the sidebar/dashboard bell (total trends across niches). */
export interface AlertsSummary {
  total: number;
  niches: number;
  savedAt: number;
}

const NICHE_CACHE_PREFIX = "fretrend_alert_niche_";
const NICHE_TTL = 60 * 60 * 1000; // 1 hour
export const ALERTS_SUMMARY_KEY = "fretrend_alerts_summary";

function cacheKey(niche: string): string {
  return NICHE_CACHE_PREFIX + niche.trim().toLowerCase();
}

/** Cached trends for a niche, or null when missing/stale/corrupt. */
export function readNicheCache(niche: string): NicheCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(niche));
    if (!raw) return null;
    const cache = JSON.parse(raw) as NicheCache;
    if (Date.now() - cache.savedAt > NICHE_TTL) return null;
    return cache;
  } catch {
    return null;
  }
}

export function writeNicheCache(cache: NicheCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(cache.niche), JSON.stringify(cache));
  } catch {
    /* quota/serialization issues are non-fatal */
  }
}

export function clearNicheCache(niche: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(cacheKey(niche));
  } catch {
    /* ignore */
  }
}

export function readAlertsSummary(): AlertsSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ALERTS_SUMMARY_KEY);
    return raw ? (JSON.parse(raw) as AlertsSummary) : null;
  } catch {
    return null;
  }
}

export function writeAlertsSummary(summary: AlertsSummary): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERTS_SUMMARY_KEY, JSON.stringify(summary));
  } catch {
    /* ignore */
  }
}

/** Fetch live trends for a niche from the public trends API. */
export async function fetchNicheTrends(niche: string): Promise<AlertTrend[]> {
  const res = await fetch("/api/trends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ niche }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch trends");
  return (data.trends ?? []) as AlertTrend[];
}

function subscribeAlerts(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // Reflects writes from other tabs; same-tab nav is full-reload so each page
  // load reads the latest summary via getSnapshot anyway.
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * Reactive total-trends count for the bell badge. Uses useSyncExternalStore so
 * it reads localStorage safely (0 on the server) without a hydration mismatch
 * or a setState-in-effect.
 */
export function useAlertCount(): number {
  return useSyncExternalStore(
    subscribeAlerts,
    () => readAlertsSummary()?.total ?? 0,
    () => 0,
  );
}

/** Human freshness label, e.g. "Updated just now" / "Updated 5m ago". */
export function freshness(savedAt: number): string {
  const mins = Math.round((Date.now() - savedAt) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}
