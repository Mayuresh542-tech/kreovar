/**
 * Video Category Analyzer
 * 
 * Analyzes video transcript, spoken segments, editing prompts, and context
 * to determine the most relevant B-roll categories and niches (multi-label).
 * Ranks categories by confidence score based on keywords, topics, and editorial intent.
 */

import { BrollNiche, BROLL_CATEGORIES } from "../assets/curatedBrollCatalog";

export interface CategoryScore {
  category: BrollNiche;
  confidence: number; // 0.0 to 1.0
  matchedKeywords: string[];
  reasons: string[];
}

export interface VideoCategoryAnalysis {
  primaryCategory: BrollNiche;
  categories: CategoryScore[];
  detectedTopics: string[];
  suggestedBrollQueries: string[];
}

export interface AnalyzeCategoryInput {
  transcript?: string;
  speech?: string;
  prompt?: string;
  title?: string;
  minConfidence?: number;
  limit?: number;
}

// Category keyword definitions with weighted significance
const CATEGORY_DICTIONARIES: Record<
  BrollNiche,
  {
    phrases: string[];     // Multi-word high-intent phrases (weight: 3.5)
    strongWords: string[]; // Strong thematic keywords (weight: 2.0)
    contextWords: string[];// Supporting context words (weight: 1.0)
  }
> = {
  gaming: {
    phrases: [
      "esports tournament", "streamer setup", "gameplay footage", "speedrun record",
      "pro gamer", "retro arcade", "vr headset", "gaming rig", "boss fight",
      "multiplayer match", "battle royale", "fps game", "split screen", "high score"
    ],
    strongWords: [
      "game", "gaming", "gamer", "esports", "controller", "streamer", "twitch",
      "gameplay", "arcade", "playstation", "xbox", "nintendo", "steam", "speedrun",
      "console", "clutch", "respawn", "joystick", "gpu", "headset"
    ],
    contextWords: [
      "play", "player", "match", "win", "round", "arena", "level", "quest",
      "rank", "lobby", "server", "ping", "fps", "mods", "rig", "neon", "rgb"
    ],
  },
  memes: {
    phrases: [
      "mind blown", "face palm", "dramatic zoom", "tears of joy", "plot twist",
      "awkward silence", "viral meme", "mic drop", "deal with it", "laughing out loud",
      "emotional damage", "unexpected moment", "funny reaction", "fail compilation"
    ],
    strongWords: [
      "meme", "funny", "laugh", "laughing", "hilarious", "reaction", "facepalm",
      "gasp", "joke", "comedy", "crying", "awkward", "shock", "popcorn", "cringe",
      "humor", "prank", "ridiculous", "wild", "insane"
    ],
    contextWords: [
      "lol", "lmao", "rofl", "wtf", "omg", "bruh", "smile", "grin", "smirk",
      "screaming", "surprised", "confused", "bloopers", "punchline", "viral"
    ],
  },
  productivity: {
    phrases: [
      "deep work", "time management", "morning routine", "pomodoro timer",
      "flow state", "daily planner", "task list", "focus session", "to-do list",
      "desk setup", "habit tracker", "clean workspace", "dual monitor"
    ],
    strongWords: [
      "productivity", "focus", "routine", "habit", "schedule", "calendar",
      "planner", "pomodoro", "checklist", "organize", "organized", "discipline",
      "workflow", "efficiency", "prioritize", "goals", "deadline", "journal"
    ],
    contextWords: [
      "work", "typing", "clock", "hour", "minute", "task", "progress", "done",
      "desk", "coffee", "morning", "laptop", "notebook", "writing", "plan", "agile"
    ],
  },
  finance: {
    phrases: [
      "stock market", "passive income", "cash flow", "crypto trading", "bitcoin price",
      "financial freedom", "net worth", "bull market", "bear market", "venture capital",
      "bank vault", "compound interest", "credit card", "real estate investing"
    ],
    strongWords: [
      "money", "finance", "financial", "invest", "investment", "investing", "stocks",
      "crypto", "bitcoin", "wealth", "cash", "dollar", "profit", "revenue", "trading",
      "portfolio", "capital", "budget", "rich", "billionaire", "dividend", "roi"
    ],
    contextWords: [
      "funds", "bank", "pay", "payment", "buy", "sell", "asset", "assets", "price",
      "costs", "rate", "wallet", "income", "currency", "gold", "market", "economy"
    ],
  },
  tech: {
    phrases: [
      "software engineer", "machine learning", "artificial intelligence", "neural network",
      "full stack", "source code", "clean code", "command line", "cloud infrastructure",
      "cyber security", "data center", "smart contract", "microchip circuit"
    ],
    strongWords: [
      "tech", "technology", "code", "coding", "programmer", "programming", "developer",
      "software", "ai", "algorithm", "python", "javascript", "typescript", "terminal",
      "server", "database", "api", "robotics", "compiler", "linux", "cloud", "matrix"
    ],
    contextWords: [
      "system", "systems", "app", "application", "data", "compute", "hardware",
      "bug", "debug", "deploy", "build", "stack", "git", "digital", "network", "silicon"
    ],
  },
  fitness: {
    phrases: [
      "heavy deadlift", "muscle growth", "workout routine", "cardio conditioning",
      "weight lifting", "protein shake", "healthy diet", "hiit workout",
      "athletic performance", "punching bag", "jumping rope"
    ],
    strongWords: [
      "fitness", "gym", "workout", "exercise", "training", "muscle", "lifting",
      "deadlift", "squat", "barbell", "dumbbell", "cardio", "running", "runner",
      "athlete", "bodybuilding", "yoga", "boxing", "protein", "sweat", "stretching"
    ],
    contextWords: [
      "weights", "reps", "sets", "form", "stamina", "endurance", "pace", "sprint",
      "track", "mat", "recovery", "hydration", "health", "diet", "nutrition", "gains"
    ],
  },
  podcast: {
    phrases: [
      "podcast studio", "audio recording", "broadcast microphone", "interview show",
      "sound engineer", "talking head", "guest speaker", "episode discussion",
      "audio waveform", "acoustic foam", "mixing console"
    ],
    strongWords: [
      "podcast", "microphone", "mic", "interview", "audio", "studio", "headphones",
      "broadcast", "broadcasting", "soundboard", "waveform", "host", "guest",
      "episode", "recording", "vocal", "soundproof", "dialogue"
    ],
    contextWords: [
      "talk", "talking", "speak", "speech", "voice", "conversation", "listen",
      "show", "sound", "mixer", "acoustic", "radio", "streaming", "story"
    ],
  },
  luxury: {
    phrases: [
      "luxury lifestyle", "private jet", "sports car", "exotic supercar",
      "penthouse suite", "luxury watch", "fine dining", "first class",
      "infinity pool", "modern villa", "super yacht", "designer fashion"
    ],
    strongWords: [
      "luxury", "luxurious", "supercar", "penthouse", "rolex", "yacht", "mansion",
      "villa", "champagne", "ferrari", "lamborghini", "exclusive", "prestige",
      "diamond", "diamonds", "jewelry", "designer", "vip", "elite"
    ],
    contextWords: [
      "expensive", "glamour", "style", "elegance", "wealthy", "rich", "estate",
      "resort", "suite", "terrace", "runway", "couture", "flute", "first-class"
    ],
  },
  education: {
    phrases: [
      "lecture hall", "study routine", "research paper", "scientific discovery",
      "university campus", "biology lab", "solar system", "mathematical formula",
      "dna helix", "graduation cap", "vintage library"
    ],
    strongWords: [
      "education", "educational", "study", "studying", "student", "students", "school",
      "university", "college", "professor", "teacher", "lecture", "course", "lesson",
      "science", "scientific", "math", "biology", "physics", "chemistry", "research"
    ],
    contextWords: [
      "learn", "learning", "exam", "test", "book", "books", "library", "read",
      "knowledge", "classroom", "academic", "degree", "diploma", "experiment", "lab"
    ],
  },
  travel: {
    phrases: [
      "travel adventure", "cinematic drone", "airplane window", "tropical beach",
      "mountain peak", "road trip", "scenic landscape", "nature wilderness",
      "sunset horizon", "desert dunes", "ancient ruins"
    ],
    strongWords: [
      "travel", "traveling", "trip", "vacation", "explore", "exploring", "adventure",
      "flight", "airplane", "beach", "mountain", "mountains", "drone", "scenic",
      "nature", "landscape", "sunset", "roadtrip", "ocean", "waterfall", "forest"
    ],
    contextWords: [
      "destination", "wanderlust", "country", "city", "tourist", "tourism", "hotel",
      "resort", "island", "sky", "hiking", "camp", "camping", "views", "wild", "globe"
    ],
  },
};

/**
 * Tokenize and normalize text into clean words and 2/3-word n-grams
 */
function extractTokensAndPhrases(text: string): { tokens: Set<string>; textLower: string } {
  const textLower = (text || "").slice(0, 15000).toLowerCase();
  // Strip punctuation but keep letters, digits, and spaces (Unicode-aware)
  const clean = textLower.replace(/[^\p{L}\p{N}\s-]/gu, " ");
  const rawWords = clean.split(/\s+/).filter((w) => w.length > 1);
  const tokens = new Set<string>(rawWords);
  return { tokens, textLower };
}

/**
 * Analyze text inputs to determine relevant B-roll categories and niches.
 */
export function analyzeVideoCategories(input: AnalyzeCategoryInput): VideoCategoryAnalysis {
  const minConfidence = input.minConfidence ?? 0.15;
  const limit = input.limit ?? 4;

  const promptText = (input.prompt || "").trim();
  const titleText = (input.title || "").trim();
  const speechText = (input.speech || input.transcript || "").trim();

  const promptExtract = extractTokensAndPhrases(promptText);
  const titleExtract = extractTokensAndPhrases(titleText);
  const speechExtract = extractTokensAndPhrases(speechText);

  // Overall raw scores per category
  const scores: Record<
    BrollNiche,
    { rawScore: number; matchedKeywords: Set<string>; reasons: string[] }
  > = {
    gaming: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    memes: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    productivity: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    finance: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    tech: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    fitness: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    podcast: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    luxury: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    education: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
    travel: { rawScore: 0, matchedKeywords: new Set(), reasons: [] },
  };

  const niches: BrollNiche[] = [
    "gaming", "memes", "productivity", "finance", "tech",
    "fitness", "podcast", "luxury", "education", "travel"
  ];

  for (const niche of niches) {
    const dict = CATEGORY_DICTIONARIES[niche];
    const rec = scores[niche];

    // 1. Check multi-word high-intent phrases
    for (const phrase of dict.phrases) {
      // Check in prompt (high weight: 4.5)
      if (promptExtract.textLower.includes(phrase)) {
        rec.rawScore += 4.5;
        rec.matchedKeywords.add(phrase);
        rec.reasons.push(`Prompt mentions phrase "${phrase}"`);
      }
      // Check in title (weight: 3.5)
      if (titleExtract.textLower.includes(phrase)) {
        rec.rawScore += 3.5;
        rec.matchedKeywords.add(phrase);
        rec.reasons.push(`Title mentions phrase "${phrase}"`);
      }
      // Check in speech (weight: 2.8)
      if (speechExtract.textLower.includes(phrase)) {
        rec.rawScore += 2.8;
        rec.matchedKeywords.add(phrase);
        rec.reasons.push(`Speech mentions phrase "${phrase}"`);
      }
    }

    // 2. Check strong category words
    for (const word of dict.strongWords) {
      if (promptExtract.tokens.has(word)) {
        rec.rawScore += 3.0;
        rec.matchedKeywords.add(word);
      }
      if (titleExtract.tokens.has(word)) {
        rec.rawScore += 2.2;
        rec.matchedKeywords.add(word);
      }
      if (speechExtract.tokens.has(word)) {
        rec.rawScore += 1.6;
        rec.matchedKeywords.add(word);
      }
    }

    // 3. Check supporting context words
    for (const word of dict.contextWords) {
      if (promptExtract.tokens.has(word)) {
        rec.rawScore += 1.4;
        rec.matchedKeywords.add(word);
      }
      if (titleExtract.tokens.has(word)) {
        rec.rawScore += 1.0;
        rec.matchedKeywords.add(word);
      }
      if (speechExtract.tokens.has(word)) {
        rec.rawScore += 0.7;
        rec.matchedKeywords.add(word);
      }
    }

    if (rec.matchedKeywords.size > 0 && rec.reasons.length === 0) {
      const topWords = Array.from(rec.matchedKeywords).slice(0, 3).join(", ");
      rec.reasons.push(`Matched keywords: ${topWords}`);
    }
  }

  // Calculate highest raw score to calibrate confidence
  const maxRawScore = Math.max(...niches.map((n) => scores[n].rawScore), 0);

  // Convert to CategoryScore items
  const scoredCategories: CategoryScore[] = niches.map((niche) => {
    const rec = scores[niche];
    let confidence = 0;
    if (maxRawScore > 0) {
      // Sigmoidal / fractional scaling so strong matches get 0.75-0.95
      const ratio = rec.rawScore / maxRawScore;
      confidence = Number((0.25 * ratio + 0.70 * (rec.rawScore / (rec.rawScore + 3.0))).toFixed(2));
    }

    return {
      category: niche,
      confidence: Math.min(Math.max(confidence, 0), 1.0),
      matchedKeywords: Array.from(rec.matchedKeywords),
      reasons: rec.reasons.slice(0, 3),
    };
  });

  // Sort descending by confidence
  scoredCategories.sort((a, b) => b.confidence - a.confidence);

  // If no category matched anything (e.g. empty or very generic speech)
  if (maxRawScore === 0) {
    const prod = scoredCategories.find((c) => c.category === "productivity");
    if (prod) {
      prod.confidence = 0.35;
      prod.matchedKeywords = ["general"];
      prod.reasons = ["General workflow baseline"];
    }
    const tech = scoredCategories.find((c) => c.category === "tech");
    if (tech) {
      tech.confidence = 0.30;
      tech.matchedKeywords = ["technology"];
      tech.reasons = ["Digital content baseline"];
    }
    scoredCategories.sort((a, b) => b.confidence - a.confidence);
  }

  const primaryCategory = scoredCategories[0].category;

  // Filter multi-label matches above minConfidence, keeping at least 1 and up to limit
  const activeCategories = scoredCategories.filter(
    (c, idx) => idx === 0 || c.confidence >= minConfidence
  ).slice(0, limit);

  // Extract detected topics from matched keywords across active categories
  const detectedTopicsSet = new Set<string>();
  for (const cat of activeCategories) {
    for (const kw of cat.matchedKeywords) {
      detectedTopicsSet.add(kw);
    }
  }
  const detectedTopics = Array.from(detectedTopicsSet).slice(0, 10);

  // Generate suggested B-roll search queries based on active categories and topics
  const suggestedBrollQueries: string[] = [];
  for (const cat of activeCategories.slice(0, 3)) {
    const meta = BROLL_CATEGORIES.find((m) => m.id === cat.category);
    if (!meta) continue;

    // Use matched keywords if present
    const topKeywords = cat.matchedKeywords.slice(0, 2);
    if (topKeywords.length > 0) {
      suggestedBrollQueries.push(`${topKeywords.join(" ")} footage`);
    } else {
      suggestedBrollQueries.push(meta.keywords.slice(0, 2).join(" "));
    }
  }

  // Deduplicate suggested queries
  const uniqueSuggestedQueries = Array.from(new Set(suggestedBrollQueries)).slice(0, 4);

  return {
    primaryCategory,
    categories: activeCategories,
    detectedTopics,
    suggestedBrollQueries: uniqueSuggestedQueries,
  };
}
