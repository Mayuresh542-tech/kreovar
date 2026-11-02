# Kreovar

Kreovar is a browser-based creator studio for planning content, editing short videos, generating voiceovers, adding captions, and managing projects in one workspace.

[Website](https://kreovar.online) · [Instagram](https://www.instagram.com/kreovarstudio/) · [Support](mailto:info@kreovar.online)

This repository contains the application source. Running your own copy requires your own database, storage, provider credentials, and payment configuration. The hosted service has Free and Pro plans; publishing the source does not provide access to its paid services or infrastructure.

## What you can use it for

| Workspace | Uses |
| --- | --- |
| Projects and Project Hub | Organize work, upload footage, attach assets, and resume saved projects. |
| Manual Editor | Arrange video, audio, captions, text, shapes, and effects on a timeline; trim, split, preview, and undo edits. |
| AI Editor | Turn editing instructions into validated timeline operations using a staged plan/execute/validate/commit workflow. Review and continue editing manually. |
| Caption Studio | Transcribe video, style captions, and export subtitles or a captioned video. |
| Voice Studio | Generate voiceovers through a configured provider and manage voice history/downloads. |
| Content tools | Explore topics and generate content kits, hooks, titles, and scripts. |
| Asset Library | Reuse owned media and configured stock media with authenticated access and signed previews. |
| Account and billing | Sign in, manage subscriptions, and enforce plan usage on the server. |

The short-video editing workflow is bounded to 60 seconds. Export format, resolution, upload size, and available tools depend on the plan, browser, host, and configured services. Free exports are limited to 720p; Pro supports up to 1080p. Plan definitions live in `app/config/plans.ts`.

## Typical workflow

1. Create an account and a project.
2. Add your footage and assets in Project Hub.
3. Open the Manual Editor or request an AI edit.
4. Review the timeline, captions, voice, and preview; make adjustments.
5. Export in an available format.

## Technology

- Next.js 16.4.3, React 19.2.4, TypeScript, and Tailwind CSS 4.
- Supabase authentication, PostgreSQL, private storage, and migrations.
- Remotion preview/composition, Mediabunny media handling, and FFmpeg-dependent server finishing where supported.
- Groq for configured content/transcription paths; the main AI editor uses the fixed model configured in `app/lib/server/radoxConfig.ts` through the Radox adapter, with a visible Groq fallback for specific service outages/timeouts.
- Voice.ai and other source-configured provider adapters; stock-media integrations require their own keys and applicable usage rights.
- Whop subscriptions and signed webhook processing. Dodo integration is sandbox-only.
- Netlify deployment configuration and a Windows adapter build plugin.

Provider/model identifiers describe the current source configuration, not an independent certification of provider availability or capabilities. Some internal package names, auth keys, tests, and historical documents still use Fretrend/VeeloX names to preserve compatibility.

## Run locally

Use a Node.js version supported by the pinned Next.js release (Node 20.9 or newer) and npm. FFmpeg/FFprobe are needed for server media analysis and MP4 finishing; Python transcription is optional and documented in `scripts/LOCAL_TRANSCRIPTION.md`.

```bash
git clone https://github.com/Mayuresh542-tech/kreovar.git
cd kreovar
npm ci
```

Copy `.env.example` to `.env.local` and replace placeholders. On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Then configure:

| Configuration | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser authentication and public Supabase client configuration. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Server database/storage access. Keep the service-role key server-only. |
| `ENCRYPTION_SECRET` | Stable server-only encryption secret for stored provider keys; follow the format in `.env.example`. |
| `GROQ_API_KEY`, optional `GROQ_TRANSCRIPTION_API_KEY` | Content/transcription and configured editor fallback. An enabled encrypted provider configuration can take precedence over environment fallback. |
| `RADOX_API_KEY` | Primary AI editor provider. |
| `VOICE_AI_API_KEY` or `VOICE_AI_API_KEYS` | Voice synthesis integration. |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | Optional stock-media integrations. |
| `WHOP_*` | Your own account, plans, checkout return URL, and signed webhook integration. |
| `ADMIN_EMAILS` | Explicit admin allowlist; use your own addresses. |
| `NEXT_PUBLIC_SITE_URL`, `SITE_URL` | Your deployment origin where used by the source. |
| `NEXT_PUBLIC_SERVER_MP4_ENABLED` | Set `false` on a host without a working FFmpeg finishing service. |

The example also includes optional provider and experimental-feature settings. Configure only the paths you intend to use. Never put private provider, payment, encryption, or service-role keys in a `NEXT_PUBLIC_*` variable.

For a fresh Supabase project, review and apply the SQL files in `supabase/migrations` in timestamp order, including storage/access policies and required functions. These files are migration history, not proof that a particular database has been migrated. Configure the Supabase site origin, allowed auth callback URLs, email delivery, and OAuth providers for your environment. Use a separate development database and sandbox payment configuration.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Database and provider-backed features need valid configuration; installing dependencies alone does not make those integrations operational.

## Repository structure

```text
app/
  api/                  Authenticated APIs, media, AI, usage, and payment webhooks
  components/           Studio shell, project UI, editor, and shared controls
  config/               Plans, public policies, and social configuration
  lib/
    editor/             Editor operations and sequential editing workflow
    timeline/           Timeline representation and transformations
    server/             Provider adapters, storage, security, and billing
    seo/                Public discovery metadata and structured content
  ...                   App Router pages, including public policy pages
config/                 Additional shared configuration
supabase/migrations/    Database schema/policy/function migration history
scripts/                Regression checks and media/development utilities
public/                 Branding, public policy PDFs, images, and starter SFX
netlify/plugins/        Windows build adapter correction
proxy.ts                Request boundary and security handling
netlify.toml            Netlify build/plugin configuration
```

## Checks and production build

```bash
npm run test:beta
npx tsc --noEmit
npm run build
```

Focused suites include `test:security`, `test:chat-routing`, `test:geo-aeo`, `test:reference-presets`, and `test:dodo`. `npm run lint` runs repository-wide ESLint. Tests include deterministic/static regression checks; they do not by themselves prove successful live AI, payment, OAuth, or cloud rendering behavior. External-service probe scripts can make real requests and should only be run deliberately with your own credentials.

For a local production server, run `npm run build` followed by `npm start`. See [Netlify deployment notes](docs/NETLIFY_DEPLOY.md) for hosted builds.

## Current boundaries

- The reference-based preset editor is experimental and disabled by default. It requires feature flags, its migration, owned private reference assets, and working external services. See [reference presets](docs/reference-presets.md). Private reference footage is not included.
- Hosted MP4 finishing depends on available server rendering infrastructure. A local MP4 test is not evidence that a serverless host supports the same workflow.
- Image generation, prompt-to-video, and thumbnail generation should not be assumed available merely because related adapters or UI references exist.
- Dodo is a test integration; the production subscription integration is Whop. Payment redirects alone are not subscription verification.
- Source and the hosted website may differ. The Cookie Policy and associated local updates were prepared after the last deployment; this repository publication does not deploy them.
- Historical documents under `docs/` describe earlier development snapshots. This README and the updated deployment guide are the entry points for the current source.

## Security and public-source contents

Environment secrets, hosting metadata, generated builds, dependency folders, backups, logs, private media, and local work artifacts are excluded. `.env.example` contains placeholders only. Keep user data and private references in authenticated storage, and preserve ownership checks, signed asset access, webhook verification, and usage enforcement when adapting the app.

Please report a sensitive security issue privately to [info@kreovar.online](mailto:info@kreovar.online), without posting credentials or user data in a public issue.

## License

The existing source license is [MIT](LICENSE). Third-party packages and media remain subject to their respective terms. The included starter sound effects are synthesized assets; see [their notes](public/sfx/README.md).
