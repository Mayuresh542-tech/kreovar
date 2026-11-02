import { VeeloxResearch } from "./types";
import { getAIProvider, MockAIProvider } from "./aiProvider";

export async function generateResearch(
  topic: string,
  niche: string,
  apiKey?: string | null
): Promise<VeeloxResearch> {
  const provider = getAIProvider(apiKey);
  const isDevelopmentMode = provider instanceof MockAIProvider;

  if (isDevelopmentMode) {
    const cleanTopic = topic.trim() || "AI Content Creation";
    return {
      topic: cleanTopic,
      summary: `Surging algorithmic and creator interest around ${cleanTopic} is driven by recent workflow updates, accessible tool democratization, and expanding audience demand for practical execution over theoretical hype.`,
      keyFacts: [
        {
          fact: `Search volume and platform mentions for "${cleanTopic}" increased over 180% in the last 14 days.`,
          source: "Platform Trend Index",
          verified: true,
        },
        {
          fact: `Short-form tutorials under 60 seconds show 2.3x higher retention than long-form introductions on this subject.`,
          source: "Creator Retention Benchmark",
          verified: true,
        },
        {
          fact: `Audiences are actively seeking step-by-step implementation rather than superficial news teasers.`,
          source: "Community Sentiment Analysis",
          verified: true,
        },
      ],
      statistics: [
        "+180% 14-day velocity surge",
        "74% of viewers watch with captions enabled",
        "2.3x average completion rate on focused single-point scripts",
      ],
      audienceSentiment:
        "High curiosity paired with skepticism toward generic hype. Viewers respond best to transparent testing, real results, and no-fluff delivery.",
      competitorObservations: [
        "Competitors frequently publish clickbait titles without delivering the core workflow in the first 10 seconds.",
        "Most existing videos overlook common beginner pitfalls and setup roadblocks.",
        "Significant opportunity exists for clean, cinematic, high-retention video formats.",
      ],
      references: [
        "https://trends.google.com",
        "https://news.ycombinator.com",
        "https://reddit.com/r/technology",
      ],
      isSimulated: true,
    };
  }

  try {
    const prompt = `You are a research analyst for the creator video platform Kreovar.
Synthesize verified research for the trending topic: "${topic}" in the "${niche}" niche.
Return ONLY a valid JSON object with these exact keys:
- topic: string
- summary: string (2-3 concise sentences explaining the current trend landscape)
- keyFacts: array of objects with { "fact": string, "source": string, "verified": boolean }
- statistics: array of 3 strings (e.g. data points or percentage shifts)
- audienceSentiment: string (how viewers currently feel and what they demand)
- competitorObservations: array of 3 strings (gaps competitors are leaving open)
- references: array of 3 plausible reference URLs
`;

    const raw = await provider.complete({
      systemPrompt: "You are an objective research director. Return strictly valid JSON.",
      userPrompt: prompt,
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    return {
      topic: parsed.topic || topic,
      summary: parsed.summary || `Research brief for ${topic}`,
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      statistics: Array.isArray(parsed.statistics) ? parsed.statistics : [],
      audienceSentiment: parsed.audienceSentiment || "High interest and engagement.",
      competitorObservations: Array.isArray(parsed.competitorObservations)
        ? parsed.competitorObservations
        : [],
      references: Array.isArray(parsed.references) ? parsed.references : [],
      isSimulated: false,
    };
  } catch (err) {
    console.warn("AI Research generation failed, using development research:", err);
    throw err;
  }
}
