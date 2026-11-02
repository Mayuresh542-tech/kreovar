import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
// google-trends-api is a CommonJS module with no type declarations
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

export interface TrendItem {
  title: string;
  source: "Google Trends" | "HackerNews" | "Reddit" | "YouTube" | "Google News";
  trendScore: number;
  label: string;
  category: string;
  url?: string;
}

// --- Category inference ---

const CATEGORY_PATTERNS: Array<[string, RegExp]> = [
  ["Tech", /\b(ai|artificial intelligence|machine learning|tech|software|apple|google|microsoft|iphone|android|app|gpu|cpu|startup|developer|programming|code|cyber|quantum|robot|openai|chatgpt|llm|chip|semiconductor|nvidia|meta|amazon|cloud)\b/i],
  ["Finance", /\b(stock|market|crypto|bitcoin|ethereum|invest|fund|economy|inflation|dollar|bank|financial|nasdaq|dow|s&p|recession|fed|interest rate|ipo|hedge|venture|revenue|gdp|forex|commodity|gold|silver)\b/i],
  ["Entertainment", /\b(movie|film|show|music|album|celebrity|netflix|disney|hbo|spotify|award|oscar|grammy|actor|singer|artist|concert|trailer|box office|streaming|series|episode|season|reality tv)\b/i],
  ["Sports", /\b(nfl|nba|nhl|mlb|soccer|football|basketball|baseball|tennis|golf|olympic|player|team|score|match|tournament|championship|fifa|espn|league|transfer|trade|draft|roster)\b/i],
  ["Gaming", /\b(game|gaming|xbox|playstation|ps5|nintendo|steam|esports|fortnite|minecraft|call of duty|twitch|valorant|league of legends|dota|overwatch|gamer|console|pc gaming)\b/i],
  ["News", /\b(politics|government|president|congress|senate|election|law|war|nato|policy|ukraine|russia|china|iran|supreme court|white house|climate|protest|legislation|bill|vote)\b/i],
];

function inferCategory(title: string): string {
  for (const [cat, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(title)) return cat;
  }
  return "Other";
}

// --- Score helpers ---

function logScore(value: number, min = 40, max = 95): number {
  const ratio = Math.min(1, Math.log10(Math.max(1, value)) / Math.log10(100000));
  return Math.round(min + ratio * (max - min));
}

function positionScore(index: number, base = 90, step = 4): number {
  return Math.max(40, base - index * step);
}

// --- Source fetchers ---

async function fetchGoogleTrends(niche: string): Promise<TrendItem[]> {
  try {
    const raw = await googleTrends.relatedQueries({
      keyword: niche,
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      geo: "US",
    });
    const parsed = JSON.parse(raw);
    const rankedList: Array<{ rankedKeyword: Array<{ query: string; value: number; formattedValue: string }> }> =
      parsed?.default?.rankedList ?? [];

    const items: TrendItem[] = [];
    const seen = new Set<string>();

    for (const kw of rankedList[0]?.rankedKeyword ?? []) {
      const key = kw.query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title: kw.query,
        source: "Google Trends",
        trendScore: Math.min(99, kw.value),
        label: `${kw.value} interest`,
        category: inferCategory(kw.query),
      });
    }

    for (const kw of rankedList[1]?.rankedKeyword ?? []) {
      const key = kw.query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const clamped = Math.max(50, Math.min(kw.value, 10000));
      const score = Math.round(60 + (Math.log10(clamped) / Math.log10(10000)) * 39);
      items.push({
        title: kw.query,
        source: "Google Trends",
        trendScore: score,
        label: kw.formattedValue ?? `+${kw.value}%`,
        category: inferCategory(kw.query),
      });
    }

    return items;
  } catch {
    return [];
  }
}

async function fetchHackerNews(niche: string): Promise<TrendItem[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(niche)}&tags=story&hitsPerPage=15&dateRange=last_24h`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.hits ?? []).flatMap((hit: any, i: number) => {
      const title = hit.title?.trim();
      if (!title) return [];
      return [{
        title,
        source: "HackerNews" as const,
        trendScore: logScore(hit.points ?? Math.max(1, 15 - i) * 5, 45, 92),
        label: `${hit.points ?? 0} pts`,
        category: inferCategory(title),
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      }];
    });
  } catch {
    return [];
  }
}

async function fetchReddit(niche: string): Promise<TrendItem[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(niche)}&sort=hot&t=day&limit=20`;
    const res = await fetch(url, {
      headers: { "User-Agent": "veelox-trends/1.0 (content discovery)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data?.data?.children ?? []).flatMap((child: any) => {
      const post = child.data;
      const title = post.title?.trim();
      if (!title) return [];
      return [{
        title,
        source: "Reddit" as const,
        trendScore: logScore(post.score ?? 0, 40, 88),
        label: `${(post.score ?? 0).toLocaleString()} upvotes`,
        category: inferCategory(title),
        url: `https://reddit.com${post.permalink ?? ""}`,
      }];
    });
  } catch {
    return [];
  }
}

function parseRssItems(xml: string, maxItems = 15): Array<{ title: string; link?: string }> {
  const items: Array<{ title: string; link?: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = m[1];
    const titleM = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkM = block.match(/<link>([\s\S]*?)<\/link>/);
    const title = (titleM?.[1] ?? "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (title) items.push({ title, link: linkM?.[1]?.trim() });
  }
  return items;
}

async function fetchGoogleNews(niche: string): Promise<TrendItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(niche)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRssItems(xml, 15);

    return items.map((item, i) => ({
      title: item.title,
      source: "Google News" as const,
      trendScore: positionScore(i, 88, 3),
      label: "News",
      category: inferCategory(item.title),
      url: item.link,
    }));
  } catch {
    return [];
  }
}

async function fetchYouTubeTrending(niche: string): Promise<TrendItem[]> {
  try {
    const url = "https://www.youtube.com/feeds/videos.xml?chart=mostpopular&regionCode=US";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();

    // Parse Atom feed entries
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const entries: Array<{ title: string; url: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(xml)) !== null) {
      const block = m[1];
      const titleM = block.match(/<title>([\s\S]*?)<\/title>/);
      const urlM = block.match(/href="(https:\/\/www\.youtube\.com\/watch[^"]+)"/);
      const title = (titleM?.[1] ?? "").trim();
      if (title) entries.push({ title, url: urlM?.[1] ?? "" });
    }

    const nicheWords = niche.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const nicheCategory = inferCategory(niche);

    const chosen = entries
      .filter((e) => {
        const t = e.title.toLowerCase();
        const directMatch = nicheWords.some((w) => t.includes(w));
        const categoryMatch = inferCategory(e.title) === nicheCategory && nicheCategory !== "Other";
        return directMatch || categoryMatch;
      })
      .slice(0, 6);

    return chosen.map((e, i) => ({
      title: e.title,
      source: "YouTube" as const,
      trendScore: positionScore(i, 85, 5),
      label: "Trending",
      category: inferCategory(e.title),
      url: e.url || undefined,
    }));
  } catch {
    return [];
  }
}

// --- Route handler ---

async function postHandler(req: NextRequest) {
  try {
    const { niche } = await req.json();
    if (!niche?.trim()) {
      return NextResponse.json({ error: "Niche is required" }, { status: 400 });
    }

    const nicheClean = niche.trim();

    const [gtResult, hnResult, redditResult, gnResult, ytResult] = await Promise.allSettled([
      fetchGoogleTrends(nicheClean),
      fetchHackerNews(nicheClean),
      fetchReddit(nicheClean),
      fetchGoogleNews(nicheClean),
      fetchYouTubeTrending(nicheClean),
    ]);

    const allItems: TrendItem[] = [
      ...(gtResult.status === "fulfilled" ? gtResult.value : []),
      ...(hnResult.status === "fulfilled" ? hnResult.value : []),
      ...(redditResult.status === "fulfilled" ? redditResult.value : []),
      ...(gnResult.status === "fulfilled" ? gnResult.value : []),
      ...(ytResult.status === "fulfilled" ? ytResult.value : []),
    ];

    // Deduplicate: skip if first 40 chars of lowercased title already seen
    const seen = new Set<string>();
    const deduped = allItems.filter((t) => {
      const key = t.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort((a, b) => b.trendScore - a.trendScore);

    return NextResponse.json({
      trends: deduped.slice(0, 25),
      sources: {
        googleTrends: gtResult.status === "fulfilled" ? gtResult.value.length : 0,
        hackerNews: hnResult.status === "fulfilled" ? hnResult.value.length : 0,
        reddit: redditResult.status === "fulfilled" ? redditResult.value.length : 0,
        googleNews: gnResult.status === "fulfilled" ? gnResult.value.length : 0,
        youtube: ytResult.status === "fulfilled" ? ytResult.value.length : 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
