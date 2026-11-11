/**
 * Hinglish (Romanized Hindi) Normalizer & Transliteration Utility
 * Standardizes Latin-script Roman Hindi words, normalizes casing,
 * cleans repetitive stutter/filler sounds, and transliterates Devanagari if present.
 */

// Common Devanagari to Roman Hindi mapping table
const DEVANAGARI_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': ''
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'ड़': 'd', 'ढ़': 'dh', 'ज़': 'z', 'फ़': 'f', 'ख़': 'kh', 'ग़': 'gh'
};

// Common Hinglish dictionary with standard casing and spelling
export const POPULAR_HINGLISH_DICTIONARY: Record<string, string> = {
  // Greetings & address
  'namaste': 'Namaste',
  'pranam': 'Pranam',
  'bhai': 'Bhai',
  'bhaiya': 'Bhaiya',
  'bhaiyo': 'Bhaiyo',
  'yaara': 'Yaara',
  'yaar': 'Yaar',
  'dost': 'Dost',
  'dosto': 'Dosto',
  'guru': 'Guru',
  'sir': 'Sir',
  'boss': 'Boss',

  // Common verbs & auxiliaries
  'kya': 'Kya',
  'kaise': 'Kaise',
  'kyun': 'Kyun',
  'kyon': 'Kyon',
  'kyunki': 'Kyunki',
  'kab': 'Kab',
  'kaha': 'Kaha',
  'kahan': 'Kahan',
  'kaun': 'Kaun',
  'kitna': 'Kitna',
  'kitne': 'Kitne',
  'matlab': 'Matlab',
  'suno': 'Suno',
  'sunie': 'Sunie',
  'dekho': 'Dekho',
  'dekhie': 'Dekhie',
  'bolo': 'Bolo',
  'batao': 'Batao',
  'samjho': 'Samjho',
  'samjhe': 'Samjhe',
  'karo': 'Karo',
  'kariye': 'Kariye',
  'karte': 'Karte',
  'karta': 'Karta',
  'karti': 'Karti',
  'rahe': 'Rahe',
  'raha': 'Raha',
  'rahi': 'Rahi',
  'hoga': 'Hoga',
  'hogi': 'Hogi',
  'honge': 'Honge',
  'hota': 'Hota',
  'hoti': 'Hoti',
  'hote': 'Hote',
  'aao': 'Aao',
  'jaao': 'Jaao',
  'chalo': 'Chalo',
  'chal': 'Chal',
  'milte': 'Milte',

  // Adjectives & adverbs
  'bilkul': 'Bilkul',
  'sahi': 'Sahi',
  'galat': 'Galat',
  'accha': 'Accha',
  'achha': 'Achha',
  'achhi': 'Achhi',
  'badhiya': 'Badhiya',
  'mast': 'Mast',
  'zabardast': 'Zabardast',
  'bohot': 'Bohot',
  'bahut': 'Bahut',
  'zyada': 'Zyada',
  'jyada': 'Jyada',
  'kam': 'Kam',
  'thoda': 'Thoda',
  'thodi': 'Thodi',
  'jaldi': 'Jaldi',
  'aaram': 'Aaram',
  'se': 'se',
  'lekin': 'Lekin',
  'magar': 'Magar',
  'par': 'par',
  'aur': 'aur',
  'ya': 'ya',
  'agar': 'Agar',
  'toh': 'toh',
  'to': 'to',
  'bhi': 'bhi',
  'hi': 'hi',
  'nahi': 'Nahi',
  'nahin': 'Nahin',
  'na': 'na',
  'mat': 'Mat',
  'haan': 'Haan',
  'ha': 'Ha',
  'thik': 'Thik',
  'theek': 'Theek',

  // Pronouns
  'mai': 'Main',
  'main': 'Main',
  'hum': 'Hum',
  'aap': 'Aap',
  'tum': 'Tum',
  'tu': 'Tu',
  'yeh': 'Yeh',
  'ye': 'Ye',
  'woh': 'Woh',
  'wo': 'Wo',
  'inka': 'Inka',
  'unka': 'Unka',
  'mera': 'Mera',
  'meri': 'Meri',
  'mere': 'Mere',
  'apna': 'Apna',
  'apne': 'Apne',
  'apni': 'Apni',
  'tera': 'Tera',
  'tere': 'Tere',
  'teri': 'Teri',
  'iska': 'Iska',
  'uska': 'Uska'
};

// Common repetitive filler sounds to strip or condense
const FILLER_PATTERNS = [
  /^(?:um+|uh+|ah+|er+|ahm|ahem)$/i,
  /^(?:hmm+|hm+)$/i
];

/**
 * Checks if a string contains Devanagari characters
 */
export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

// Common direct Devanagari word mappings for high accuracy
const DEVANAGARI_WORD_MAP: Record<string, string> = {
  'नमस्ते': 'namaste',
  'भाई': 'bhai',
  'भैया': 'bhaiya',
  'यार': 'yaar',
  'यारा': 'yaara',
  'क्या': 'kya',
  'कैसे': 'kaise',
  'कहा': 'kaha',
  'कहाँ': 'kahan',
  'क्यो': 'kyon',
  'क्यों': 'kyun',
  'क्योंकि': 'kyunki',
  'मतलब': 'matlab',
  'हाँ': 'haan',
  'हा': 'ha',
  'नहीं': 'nahi',
  'नही': 'nahi',
  'बिल्कुल': 'bilkul',
  'सही': 'sahi',
  'अच्छा': 'accha',
  'बहुत': 'bahut',
  'ज्यादा': 'zyada',
  'थोड़ा': 'thoda',
  'दोस्त': 'dost',
  'हेलो': 'hello',
  'आप': 'aap',
  'हम': 'hum',
  'तुम': 'tum',
  'करो': 'karo',
  'रहे': 'rahe',
  'होग': 'hoga',
  'होगी': 'hogi'
};

/**
 * Transliterates a Devanagari text string into Romanized Latin script (Hinglish)
 */
export function devanagariToRoman(text: string): string {
  // First check if any direct word match exists
  let working = text;
  for (const [hindi, roman] of Object.entries(DEVANAGARI_WORD_MAP)) {
    working = working.replaceAll(hindi, roman);
  }

  // Common diphthong normalization
  working = working.replaceAll('ाई', 'ai').replaceAll('ाईं', 'ain');

  let result = '';
  const chars = Array.from(working);
  
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const next = chars[i + 1];

    if (DEVANAGARI_CONSONANTS[char]) {
      const romanConsonant = DEVANAGARI_CONSONANTS[char];
      // Check if followed by vowel sign or halant
      if (next && DEVANAGARI_VOWELS[next]) {
        result += romanConsonant + (next === '्' ? '' : DEVANAGARI_VOWELS[next]);
        i++; // skip vowel sign
      } else if (next && next === '्') {
        result += romanConsonant;
        i++; // skip halant
      } else {
        // In Hindi phonetics, final consonants or consonants followed by space don't have inherent 'a'
        const isEnd = i === chars.length - 1 || chars[i + 1] === ' ';
        result += romanConsonant + (isEnd ? '' : 'a');
      }
    } else if (DEVANAGARI_VOWELS[char]) {
      result += DEVANAGARI_VOWELS[char];
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Normalizes a single Hinglish word:
 * 1. Converts Devanagari to Latin if present
 * 2. Checks dictionary for standardized Roman spelling
 * 3. Cleans punctuation artifacts while retaining quotes/commas
 */
export function normalizeHinglishToken(rawToken: string): string {
  if (!rawToken || !rawToken.trim()) return rawToken;

  let token = rawToken.trim();

  // If Devanagari present, transliterate to Roman
  if (containsDevanagari(token)) {
    token = devanagariToRoman(token);
  }

  // Preserve leading/trailing punctuation
  const match = token.match(/^([^\w]*)(.*?)([^\w]*)$/);
  if (!match) return token;

  const [, prefix, core, suffix] = match;
  const lower = core.toLowerCase();

  let normalizedCore = core;
  if (POPULAR_HINGLISH_DICTIONARY[lower]) {
    normalizedCore = POPULAR_HINGLISH_DICTIONARY[lower];
  } else if (/^[a-z]+$/i.test(core)) {
    // Default title case for words > 3 chars if all lowercase
    if (core === lower && core.length >= 3) {
      normalizedCore = core.charAt(0).toUpperCase() + core.slice(1);
    }
  }

  return prefix + normalizedCore + suffix;
}

/**
 * Normalizes a full text transcript in Hinglish:
 * - Deduplicates immediate stutter words ("matlab matlab" -> "Matlab")
 * - Removes non-lexical vocal fillers ("um", "uh")
 * - Applies standardized Romanized casing and dictionary normalization
 */
export function normalizeHinglishText(text: string): string {
  if (!text || !text.trim()) return text;

  // Transliterate whole text first if Devanagari is detected
  let workingText = containsDevanagari(text) ? devanagariToRoman(text) : text;

  const rawWords = workingText.split(/\s+/).filter(Boolean);
  const normalizedWords: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i];
    const cleanCore = raw.replace(/[^\w]/g, '').toLowerCase();

    // Skip filler sounds
    if (FILLER_PATTERNS.some(pattern => pattern.test(cleanCore))) {
      continue;
    }

    // Deduplicate immediate stutter repetition (e.g. "matlab matlab" or "toh toh")
    const prev = normalizedWords[normalizedWords.length - 1];
    if (prev && prev.replace(/[^\w]/g, '').toLowerCase() === cleanCore && cleanCore.length > 1) {
      continue;
    }

    normalizedWords.push(normalizeHinglishToken(raw));
  }

  return normalizedWords.join(' ');
}

export interface TimedSpeechWord {
  word?: string;
  text?: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/**
 * Normalizes an array of word-level timestamp objects from Whisper:
 * - Preserves exact start and end timestamps
 * - Converts Devanagari to clean Roman Hindi
 * - Cleans phoneme merges & standardizes popular Hinglish terms
 */
export function normalizeHinglishWords<T extends TimedSpeechWord>(words: T[]): T[] {
  if (!Array.isArray(words) || words.length === 0) return words;

  const result: T[] = [];

  for (let i = 0; i < words.length; i++) {
    const item = words[i];
    const rawText = item.text || item.word || '';
    const cleanCore = rawText.replace(/[^\w]/g, '').toLowerCase();

    // Skip standalone empty or pure vocal fillers (unless it's the only word)
    if (words.length > 1 && FILLER_PATTERNS.some(p => p.test(cleanCore))) {
      continue;
    }

    // Deduplicate stutter repetition if timestamp delta is < 0.25s
    const prev = result[result.length - 1];
    const prevCore = prev ? (prev.text || prev.word || '').replace(/[^\w]/g, '').toLowerCase() : '';
    if (prev && prevCore === cleanCore && cleanCore.length > 1 && (item.start - prev.end) < 0.25) {
      // Merge end time to extend the previous word instead of duplicating
      prev.end = Math.max(prev.end, item.end);
      continue;
    }

    const normalized = normalizeHinglishToken(rawText);
    result.push({
      ...item,
      word: normalized,
      text: normalized
    });
  }

  return result;
}
