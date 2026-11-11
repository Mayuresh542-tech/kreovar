# Kreovar — Comprehensive System Architecture & Engineering Documentation

**Document Title:** Kreovar Full Technical Specification & Feature Architecture  
**Author:** Kreovar Core Engineering Team  
**System Version:** 0.1.0-production (Cloudflare Edge Release)  
**Production URL:** [https://kreovar.online](https://kreovar.online)  
**Target Platform:** Web (Desktop & Mobile Responsive), Cloudflare Workers Runtime, Modern Browser GPU (WebCodecs)

---

## Table of Contents
1. [Executive Summary & Product Vision](#1-executive-summary--product-vision)
2. [High-Level System Architecture](#2-high-level-system-architecture)
3. [Technology Stack & Third-Party Services](#3-technology-stack--third-party-services)
4. [The AI Video Editor — Deep Dive Engine](#4-the-ai-video-editor--deep-dive-engine)
   - 4.1 Project Data Model & Timeline Schema
   - 4.2 The 11-Stage Autonomous Orchestration Pipeline
   - 4.3 Conversational Intent Parsing & Negative Constraints
   - 4.4 In-Place Mutation & Reconciler Architecture
   - 4.5 Semantic Phrase Timestamp Matcher
   - 4.6 Dual Export Pipeline: Browser WebCodecs vs. Server FFmpeg
5. [Caption Studio — Subtitle & Kinetic Typography Engine](#5-caption-studio--subtitle--kinetic-typography-engine)
   - 5.1 Architecture & Canvas Rendering Engine
   - 5.2 Style Configurations & Reference Presets
   - 5.3 Word-Level Highlighting & Motion Mechanics
6. [Smart Footage & Autonomous B-Roll System](#6-smart-footage--autonomous-b-roll-system)
7. [Dynamic Camera Zooms & Visual Pacing](#7-dynamic-camera-zooms--visual-pacing)
8. [Sound Design & Built-In Audio Engine](#8-sound-design--built-in-audio-engine)
9. [AI Voice Studio & Speech Synthesis](#9-ai-voice-studio--speech-synthesis)
10. [Idea, Script & Trend Intelligence Hub](#10-idea-script--trend-intelligence-hub)
11. [Authentication, Database & Security Model](#11-authentication-database--security-model)
12. [Cloudflare Edge Deployment & Performance Optimizations](#12-cloudflare-edge-deployment--performance-optimizations)
13. [Monetization, Billing & Webhook Infrastructure](#13-monetization-billing--webhook-infrastructure)
14. [How Every Feature is Built & Operates (Step-by-Step Flow)](#14-how-every-feature-is-built--operates-step-by-step-flow)
15. [How to Import and Use This Document in Google Docs](#15-how-to-import-and-use-this-document-in-google-docs)

---

## 1. Executive Summary & Product Vision

Kreovar (internally developed under the codebase name **Veelox**) is a full-stack, AI-native video creation and automated post-production platform designed specifically for high-retention short-form video (TikTok, Instagram Reels, YouTube Shorts) and professional long-form content (Podcasts, Documentaries, Educational Explainers).

### The Core Problem Kreovar Solves
Traditional timeline video editors (e.g. Adobe Premiere Pro, Final Cut Pro, DaVinci Resolve) require hours of manual labor: slicing pauses, synchronizing word-by-word subtitles, finding relevant B-roll clips, adding punch-in zooms, designing motion graphics, and layering sound effects. Generic "AI video tools", on the other hand, either create hallucinated synthetic clips or apply rigid, robotic edits that lack editorial nuance.

### Kreovar’s Breakthrough Solution
Kreovar introduces an **Autonomous Intent-Driven Editor** that functions like a human senior video editor. By parsing natural language user prompts (supporting English, Hindi, and Hinglish), Kreovar executes multi-step editorial workflows across visual framing, audio mastering, typography, B-roll insertion, and camera movement while strictly respecting timeline constraints, speaker identity, and user-specified boundaries.

---

## 2. High-Level System Architecture

Kreovar operates on a modern distributed architecture combining **Cloudflare Edge Workers**, **Supabase PostgreSQL / Storage**, **High-Throughput Inference Engines (Groq & Gemini)**, and **Client-Side Hardware-Accelerated Video Processing (WebCodecs & WebGPU)**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (User Browser)                            │
│  React 19 + Next.js 16 + Tailwind CSS v4 + Framer Motion                    │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐ │
│  │   Interactive Studio  │  │ Real-Time Previewer   │  │ WebCodecs MP4   │ │
│  │   Timeline & Canvas   │  │ Remotion 4.0 Player   │  │ Mediabunny 1.61 │ │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────▲────────┘ │
└──────────────┼──────────────────────────┼───────────────────────┼───────────┘
               │ HTTPS / WebSockets       │ JSON Payloads         │ Raw Frames
┌──────────────▼──────────────────────────▼───────────────────────┴───────────┐
│                    EDGE RUNTIME (Cloudflare Workers)                        │
│  Vinext / Server Fetch-Handler (Node.js Compatibility Mode)                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ API Gateway & Security: Rate Limiting, AES Encryption, Auth Guards     │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ AI Editor Engine:                                                      │ │
│  │ - 11-Stage Pipeline Orchestrator (sequentialEdit.ts)                   │ │
│  │ - Structured Intent Parser & Negative Constraints (editingIntent.ts)   │ │
│  │ - In-Place Mutation Reconciler (inPlaceReconciler.ts)                  │ │
│  │ - Semantic Phrase Timestamp Matcher (phraseMatcher.ts)                 │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ Caption Studio Deterministic Canvas Renderer (studioCanvas.ts)          │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ Media Proxy & B-roll Ingestion Pipeline                                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────┬────────────────────┬────────────────────┬────────────────────┬───────┘
       │                    │                    │                    │
┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼───────┐
│   SUPABASE  │      │  GROQ API   │      │ GOOGLE GENAI│      │ STOCK MEDIA  │
│ - PostgreSQL│      │ - Whisper   │      │ - Gemini    │      │ - Pexels API │
│ - Row Level │      │   v3 Turbo  │      │   Flash 2.0 │      │ - Pixabay API│
│   Security  │      │ - Llama 3.3 │      │   Multimodal│      │ - ElevenLabs │
│ - S3 Storage│      │   70B & Qwen│      │   Vision    │      │   Voice TTS  │
└─────────────┘      └─────────────┘      └─────────────┘      └──────────────┘
```

---

## 3. Technology Stack & Third-Party Services

| Layer | Technology | Version | Purpose in Kreovar |
|---|---|---|---|
| **Core Framework** | Next.js (App Router) | `16.4.3` | Full-stack architecture, React Server Components, dynamic API routing |
| **UI Library** | React & React-DOM | `19.3.1` | Concurrent UI rendering, Transitions, Client/Server component separation |
| **Styling** | Tailwind CSS | `v4.0.0` | High-performance CSS engine, container queries, hardware transitions |
| **Edge Bundler** | Vinext & Vite | `1.4.3` / `8.3.5` | Fast Vite-based production bundling tailored for Cloudflare Workers |
| **Edge Hosting** | Cloudflare Workers (`cf`) | `1.0.0-beta.27` | Sub-50ms global deployment with `nodejs_compat` runtime |
| **Video Composition** | Remotion | `4.0.526` | Programmatic timeline orchestration and browser preview rendering |
| **Client Codecs** | Mediabunny | `1.61.3` | Browser-side WebCodecs H.264/AAC muxer and demuxer for instant zero-server MP4 export |
| **Image Processing** | Sharp | `0.35.5` | Server-side SVG rasterization, gradient badge rendering, frame generation |
| **Audio/Video Native** | FFmpeg | `8.1.1` | Native server-side compositing, hardware filters, audio normalization |
| **Database & Auth** | Supabase | `2.106.2` | Relational PostgreSQL database, Row Level Security, user sessions, S3 asset buckets |
| **Fast AI & STT** | Groq Cloud | `Latest` | Whisper v3 Turbo transcription, Llama 3.3 70B & Qwen 2.5 32B editorial reasoning |
| **Vision & Reasoning**| Google Gemini | `Flash 1.5/2.0` | Frame-by-frame visual understanding, subject framing analysis |
| **Voice Synthesis** | ElevenLabs & Voice AI | `v1 REST` | Studio-grade AI voiceovers, voice cloning, and audio regeneration |
| **Stock Assets** | Pexels & Pixabay | `REST API` | Automated B-roll footage and contextual photography retrieval |
| **Monetization** | Whop & Dodo Payments | `Whop 2.4.0` | Global checkout, subscription management, webhooks, and license metering |

---

## 4. The AI Video Editor — Deep Dive Engine

The AI Video Editor is the core technological marvel of Kreovar. Located across `app/lib/editor/`, `app/lib/server/`, and `app/components/editor/`, it is engineered to avoid the common pitfalls of naive LLM wrappers.

### 4.1 Project Data Model & Timeline Schema (`app/lib/editor/model.ts`)
A Kreovar project is represented as a strictly typed, immutable tree structure:

- **Tracks**:
  - `main`: The primary A-roll camera footage.
  - `overlay`: B-roll video cutaways, screen recordings, picture-in-picture clips.
  - `image`: Floating photo cards, transparent PNG stickers, diagram overlays.
  - `captions`: Word-synchronized kinetic typography.
  - `titles`: Static headings, intro badges, lower-thirds.
  - `audio`: Background music, dialogue tracks, and sound effect layers.
- **Clips**:
  - Each clip contains explicit timeline coordinates: `startTime`, `duration`, `sourceStart`, `sourceEnd`, `speed`, and `volume`.
  - Clips feature parametric properties: `transform` (x, y, scale, rotation, opacity), `effects` (brightness, contrast, saturation, blur, RGB color shifts), and `keyframes`.
- **Revision Control**:
  - Every project maintains an atomic `revision` counter.
  - When the AI proposes edits, it compares `baseRevision` against the current timeline to detect conflicts and prevent stale state overwrites.

### 4.2 The 11-Stage Autonomous Orchestration Pipeline (`app/lib/editor/sequentialEdit.ts`)
Instead of issuing a single prompt that attempts to do everything at once (leading to hallucinated timings, dropped clips, and visual chaos), Kreovar uses an **11-stage autonomous state machine**:

```
[Raw Footage] ──► 1. Analyze Footage ──► 2. Apply Captions ──► 3. Plan Motion Graphics
                       │                                                │
[Validated MP4] ◄── 11. Validate ◄── 10. Requested Edits ◄── 4. Apply Motion Graphics
                       ▲                                                │
                       │                                                ▼
              9. Apply Effects ◄── 8. Sound Effects ◄── 7. Zooms ◄── 5 & 6. B-Roll
```

1. **`analyzeFootage`**:
   - Inspects project duration, samples visual frames, checks Whisper transcripts, and outputs an exact set of required operations.
   - Enforces scope bounds: if no original video exists, it prevents video-specific operations.
2. **`applyCaptions`**:
   - Applies kinetic animated captions matched to the content tone (e.g. `study-hormozi-style` for high-energy fitness/business; `study-ali-abdaal` for educational podcasts).
   - Never re-transcribes if existing speech data is already mapped.
3. **`planMotionGraphics`**:
   - Analyzes speech context to identify key concept moments requiring graphic support.
   - Restricts output to sparse, purposeful additions (arrows, badges, highlight boxes).
4. **`applyMotionGraphics`**:
   - Generates deterministic vector shapes (`rectangle`, `ellipse`, `arrow`, `callout`) with exact entry, hold, and exit timings.
5. **`findBroll`**:
   - Analyzes transcript context to extract semantic visual queries (e.g., "coffee farming" ➔ searches for real ripe coffee harvesting).
   - Strictly enforces that B-roll must be placed on unlocked overlay tracks with `volume: 0` (muted) so speaker audio is never interrupted.
6. **`applyBroll`**:
   - Inserts retrieved B-roll with smooth entrance/exit crossfades (0.25s) and automatic timeline trimming.
7. **`applyZooms`**:
   - Identifies emphatic sentences and places punch-in zooms (`1.18x` to `1.35x`).
   - Limits zoom frequency (at most one per 5–6 seconds) to maintain natural visual rhythm.
8. **`applySoundEffects`**:
   - Matches transitions, zooms, and punchlines with subtle sound effects (`volume: 0.08–0.25`).
   - Employs non-destructive audio ducking so dialogue remains 100% intelligible.
9. **`applyEffects`**:
   - Adds color grading, grain, or visual treatments (e.g. filmic contrast, subtle lens blur ramps).
10. **`applyRequestedEdits`**:
    - The open conversational stage. Handles free-form user instructions ("cut the part where I coughed", "make the text yellow", "speed up by 10%").
    - Has full access to all 28 native editing operations and 7 tool requests.
11. **`validateEdit`**:
    - Rigorous automated linting. Ensures no overlapping clips on the same track, no zero-length cuts, and no corrupted audio references.

### 4.3 Conversational Intent Parsing & Negative Constraints (`app/lib/editor/editingIntent.ts`)
Kreovar features an advanced natural language comprehension layer:
- **Multilingual Negation Support**: Understands English, Hindi, and Hinglish negation keywords (`don't`, `never`, `remove`, `without`, `mat`, `nahi`, `bina`, `sirf`).
  - *Example*: "Add B-roll but don't touch my voice or add background music" ➔ Adds B-roll on overlay tracks, preserves audio tracks completely, and emits zero music decisions.
- **Temporal Section Bounds**: Recognizes time phrases like "keep the first 10 seconds untouched" or "only edit the second half". Converts them into numerical boundaries and freezes protected regions.
- **Ambiguity Clarification**: If a prompt is contradictory or unclear, the engine returns an interactive question to the user rather than executing a destructive guess.

### 4.4 In-Place Mutation & Reconciler Architecture (`app/lib/editor/inPlaceReconciler.ts`)
A major flaw in basic video AI agents is that conversational follow-ups duplicate content (e.g., asking to change font adds a duplicate caption layer over the existing one).
Kreovar solves this with **In-Place Mutation**:
- When a user asks: "Make the captions yellow and slightly bigger", the Reconciler identifies existing caption clips, updates their `textColor`, `highlightColor`, or `fontSize` properties in place, and preserves their exact timeline positions.
- When asking to "remove the zoom at 5 seconds", it executes `clearZooms` on that specific clip ID rather than modifying neighboring edits.

### 4.5 Semantic Phrase Timestamp Matcher (`app/lib/editor/phraseMatcher.ts`)
Users rarely specify exact timestamps like "at 00:04.283". Instead, they say: "When I say 'consistency matters', zoom in".
- Kreovar's Phrase Matcher takes user phrases, searches against the Whisper word-level transcript using Levenshtein distance and semantic token windows, and pinpoints the exact start and end microsecond coordinates.

### 4.6 Dual Export Pipeline: Browser WebCodecs vs. Server FFmpeg

#### Path A: Zero-Cost Client-Side WebCodecs (`mediabunny.min.mjs`)
- Runs directly inside the user's browser using Chrome / Edge WebCodecs API (`VideoEncoder`, `AudioEncoder`).
- Decodes source video frames directly into GPU memory via HTML5 Canvas.
- Draws all kinetic typography, shapes, and overlays at 30 or 60 fps.
- Encodes an MP4 container in client memory.
- **Benefits**: Zero cloud compute costs, instant rendering, complete user privacy (raw video never leaves the device).

#### Path B: Studio Server-Side FFmpeg Engine
- Used for batch processing, automated rendering, and complex filter graphs.
- Generates transparent PNG sequences via Sharp for pixel-perfect typography.
- Uses hardware-accelerated H.264/AAC filters to composite multiple video/audio streams with precise volume ducking (`normalize=0`).

---

## 5. Caption Studio — Subtitle & Kinetic Typography Engine

Captions in Kreovar are not standard SRT or ASS subtitles; they are **high-retention kinetic graphics** identical to those used by top creators.

### 5.1 Architecture & Canvas Rendering Engine (`canvasCaptions.ts` & `studioCanvas.ts`)
- **Single Deterministic Drawing Path**: Both client-side video preview, fixed-frame exports, and thumbnail generation share the exact same rendering logic.
- **Dynamic Coordinate System**: All coordinates automatically scale from a canonical 720px short-edge reference, ensuring 100% responsive rendering across 9:16 vertical, 16:9 widescreen, and 1:1 square aspect ratios.

### 5.2 Style Configurations & Reference Presets
Kreovar includes 47+ pre-configured styles modeled after industry benchmarks:

| Preset Name | Typography | Visual Characteristics | Best Used For |
|---|---|---|---|
| **Ali Abdaal Spotlight** | Poppins / Montserrat | Dark rounded matte pill container, active word spotlighted in Solar Gold (`#FFE600`), inactive words dimmed white | Podcasts, thoughtful talk, book reviews |
| **Hormozi Viral Pop** | Impact / Anton (62px) | Bold uppercase, 5px black stroke, 3D shadow, Electric Lime to Yellow gradient (`#A5FD4B` ➔ `#FFE600`), Red alert keywords | Business advice, high-energy coaching, viral TikToks |
| **Thora Cinematic** | Georgia / Montserrat | Lower-third placement, wide letter-spacing (`3.5px`), Royal Amber Gold (`#E6B83D`) accents, dark translucent capsule | Documentaries, luxury brands, storytelling |
| **Liquid Glass** | Segoe UI / Inter | Translucent frosted glass container (`#0F172Aee`), glass stroke, Electric Cyan (`#00F0FF`) keyword highlights | Modern tech, SaaS explainers, minimal creators |
| **Mota Athletic** | Archivo Black / Impact | Slanted athletic italic (`skewX(-6)`), Flame Orange (`#FF6B00`) & Sunburst Yellow, floating `⚡` badge | Sports training, fitness challenges, high energy |
| **Deep Glow** | Arial Black / Montserrat | Radiant golden glow aura filter (`stdDeviation=12`), intense white-hot text center, eye-level bursts | Motivational speeches, dramatic storytelling |
| **Science Blueprint** | Segoe UI Bold | High-tech navy blueprint card (`#0D192E`), cyan corner accents, floating diagram badge `💡 SUNLIGHT ➔ ELECTRICAL CURRENT` | Educational tutorials, STEM explainers, how-to guides |

### 5.3 Word-Level Highlighting & Motion Mechanics
- **Highlighting Modes**:
  - `keyword`: Highlights only semantically significant words identified by NLP.
  - `current-word`: Karaoke-style illumination of the exact word being spoken.
  - `cumulative`: Keeps all words spoken so far illuminated until the clause ends.
  - `alternating`: Alternates colors across rhythmic beats.
  - `full-line`: Illuminates entire phrases uniformly.
- **Spring Pop Motion**: When a new word is spoken, Kreovar calculates `p = (time - word.start) / 0.12` and applies a spring curve `scale = 1.0 + 0.22 * sin(p * π)`, making words bounce naturally on vocal emphasis.

---

## 6. Smart Footage & Autonomous B-Roll System

To keep viewer attention high, Kreovar automatically cuts away to illustrative B-roll footage:
1. **Transcript Extraction**: Groq Whisper extracts full speech text with timestamps.
2. **Contextual Entity Recognition**: The AI identifies concrete visual actions (e.g., "drinking coffee", "typing on laptop", "basketball swishing through net").
3. **Pexels & Pixabay API Querying**: Searches curated stock video libraries for matching portrait 9:16 clips.
4. **Autonomous Conformance**:
   - Downloads the MP4 stream.
   - Adjusts scale to fill 720×1280 vertical resolution (`force_original_aspect_ratio=increase,crop=720:1280`).
   - Mutes B-roll audio (`volume: 0`) so speaker dialogue remains pristine.
   - Applies smooth 0.25-second crossfades at clip entry and exit.

---

## 7. Dynamic Camera Zooms & Visual Pacing

Static talking-head videos suffer high drop-off rates. Kreovar implements **intelligent camera movement**:
- **Punch-In Zooms (Jump Cuts)**: Crops from 1.0x wide framing to 1.25x–1.35x tight framing on key statements, centered on the speaker's face.
- **Slow Cinematic Push-Ins**: Smooth, progressive scaling (`zoompan`) used in documentary and emotional presets.
- **Rhythmic Rest**: Zooms pull back to wide framing every 2.5–3 seconds or cut to B-roll to prevent viewer fatigue.

---

## 8. Sound Design & Built-In Audio Engine

Kreovar treats audio with the same importance as video:
- **Curated SFX Library** (`public/sfx/`):
  - *Transitions*: `soft-whoosh.wav`, `fast-swish.wav`, `cinematic-rise.wav`.
  - *Punctuation & Pops*: `digital-pop.wav`, `soft-click.wav`, `notification.wav`.
  - *Impacts & Bass*: `low-impact.wav`, `sub-drop.wav`.
  - *Chimes*: `success-chime.wav`, `sparkle.wav`.
- **Intelligent Placement**:
  - Whooshes are tied to camera zoom jumps and B-roll transitions.
  - Subtle clicks/pops accompany keyword badge reveals.
  - Sub-drops accentuate powerful emotional or structural conclusions.
- **Non-Destructive Audio Mixing (`amix`)**:
  - Uses FFmpeg's `normalize=0` parameter so mixing in sound effects does **not** reduce dialogue volume.

---

## 9. AI Voice Studio & Speech Synthesis

For creators who prefer voiceovers or need to add narration:
- **ElevenLabs & Voice AI Integration**:
  - Provides instant access to studio-quality voices across different accents, genders, and emotional tones.
  - Supports custom voice cloning from user audio samples.
- **Timeline Synchronization**:
  - Generated voiceover files are saved to user asset libraries and placed directly onto audio tracks with automatic caption generation.

---

## 10. Idea, Script & Trend Intelligence Hub

Kreovar assists creators before they even record:
- **Google Trends API Integration (`google-trends-api`)**:
  - Real-time search trend monitoring across niches (tech, business, fitness, lifestyle).
  - Identifies rising breakout queries and viral hooks.
- **AI Scriptwriting Engine**:
  - Generates structured scripts: Hook (0–3s), Problem (3–7s), Core Solution (7–12s), Call to Action (12–15s).
  - Automatically formats scripts with suggested visual cues for the AI Editor.

---

## 11. Authentication, Database & Security Model

- **Supabase Authentication**:
  - Passwordless Email Magic Links and Google OAuth2 sign-in.
  - Secure session management stored in HTTP-only, SameSite cookies.
- **PostgreSQL Database Schema**:
  - `projects`: Stores complete JSON timeline trees, revisions, metadata.
  - `assets`: User-uploaded video, audio, and image assets.
  - `user_profiles`: Subscription status, credit balances, usage metering.
- **Row-Level Security (RLS)**:
  - Strict PostgreSQL RLS policies enforce that users can **only** read and write their own projects and media.
- **Rate Limiting & Safety**:
  - Server-side token bucket rate limiting on AI edit endpoints (prevents spam and runaway API costs).
  - Input sanitation preventing prompt injection from user asset filenames.

---

## 12. Cloudflare Edge Deployment & Performance Optimizations

Kreovar is built for global edge delivery:
- **Cloudflare Workers Architecture**:
  - Configured via `cloudflare.config.ts` under domain `kreovar.online`.
  - Uses `@vinext/cloudflare` to serve React Server Components from the edge with sub-50ms latency worldwide.
- **Asset Optimization**:
  - Static CSS, JS, and font bundles are cached on Cloudflare’s global CDN (`/_next/static/*`).
  - Worker startup time is blazing fast (~15 ms).

---

## 13. Monetization, Billing & Webhook Infrastructure

- **Whop Integration (`@whop/sdk`)**:
  - Handles customer checkout, subscription plans (Monthly / Yearly), and recurring billing.
  - Real-time Webhook listener (`app/api/webhooks/whop/route.ts`) updates Supabase user credits instantly upon payment confirmation.
- **Dodo Payments Integration**:
  - Provides alternative localized global checkout for creators worldwide.

---

## 14. How Every Feature is Built & Operates (Step-by-Step Flow)

### End-to-End Workflow: From Raw Footage to Published Video

```
1. UPLOAD: User drops raw video (.mp4/.mov) into Kreovar Studio.
   │
2. INGESTION: File stored in Supabase Storage; audio extracted & sent to Groq Whisper.
   │
3. TRANSCRIPTION: Full word-level timestamped transcript generated in <1.5 seconds.
   │
4. EDITORIAL PROMPT: User selects preset (e.g. "Viral Creator") or types custom prompt.
   │
5. INTENT PARSING: AI extracts goals, negative constraints, and bounds.
   │
6. MULTI-STAGE EXECUTION:
   ├── Stage 1: Analyze footage & speech context.
   ├── Stage 2: Synchronize Caption Studio kinetic typography.
   ├── Stage 3: Query Pexels/Pixabay for relevant B-roll & insert onto overlay track.
   ├── Stage 4: Apply punch-in camera zooms on vocal emphasis words.
   └── Stage 5: Layer SFX (whoosh, pop, chime) with audio ducking.
   │
7. RECONCILIATION & VALIDATION: In-Place Reconciler cleans overlaps and verifies timeline.
   │
8. REAL-TIME PREVIEW: Remotion player updates in client browser instantly.
   │
9. EXPORT:
   ├── Option A (Browser): WebCodecs / Mediabunny encodes MP4 on GPU in seconds.
   └── Option B (Server): FFmpeg renders full-resolution master file for download.
```

---

## 15. How to Import and Use This Document in Google Docs

This document is formatted in clean, universal GitHub Flavored Markdown and is 100% compatible with Google Docs.

### Step-by-Step Instructions to Open in Google Docs:

#### Method 1: Direct File Upload to Google Drive (Recommended)
1. Locate this file on your computer:  
   `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\KREOVAR_COMPLETE_SYSTEM_DOCUMENTATION.md`
2. Open your web browser and navigate to [Google Drive](https://drive.google.com).
3. Click the **+ New** button in the top left and select **File upload**.
4. Select `KREOVAR_COMPLETE_SYSTEM_DOCUMENTATION.md`.
5. Once uploaded, right-click the file in Google Drive and choose **Open with ➔ Google Docs**.
6. Google Docs will automatically convert all markdown headings, tables, bullet points, and code blocks into a beautifully formatted document!

#### Method 2: Copy-Paste into Google Docs
1. Open [Google Docs](https://docs.google.com) and create a new blank document.
2. Open `KREOVAR_COMPLETE_SYSTEM_DOCUMENTATION.md` in any text viewer or copy its text.
3. In Google Docs, press `Ctrl + V` to paste. Google Docs automatically parses standard markdown formatting into native document styles.
4. Title the document **"Kreovar — Comprehensive System Architecture & Engineering Documentation"**.

---
*End of Documentation. Generated for Kreovar Core System Reference.*
