# Cloudflare Workers Free deployment

The source supports an additional Cloudflare Workers build through vinext. The existing Next.js local/Netlify workflow remains available. Use Node.js 24.22 or later for the Cloudflare tooling.

## Build and verify

```sh
npm ci
npm run test:beta
npm run build:cloudflare
npx tsc --noEmit
npx tsc -p cloudflare/tsconfig.json
npx cf deploy --prebuilt --dry-run
```

The build helper restores Next-generated route types after success or failure. Workers platform types are checked separately from browser DOM types. `npm run dev` still starts the normal Next.js development app.

## Runtime configuration

Authenticate with `cf auth login` and verify the selected account before publishing. Use the CLI's server-side secrets mechanism for the required production variables from `.env.example`. Never upload `.env.local` wholesale or commit a real secrets file. Keep encryption and webhook secrets identical to the current production values; changing them breaks stored-key decryption and signed webhook delivery.

The request boundary always accepts the fixed canonical `https://kreovar.online` origin. `SITE_URL` adds the exact allowed deployment origin; retaining the Worker preview origin during release verification permits both hosts. It is used only by that mutation-origin check. Set `NEXT_PUBLIC_SITE_URL=https://kreovar.online` during builds. Keep `TRANSCRIPTION_PROVIDER=groq` and the current editor service selection. Do not transfer local executable paths, localhost URLs, local-only flags or sandbox billing settings.

Deploy the prebuilt package with an approved JSON secrets file outside the repository. Cloudflare encrypted secrets must be used for private keys, not client-facing variables or plain configuration. No paid bindings are configured.

## Host boundaries

- The normal browser editor encodes MP4 (H.264/AAC where supported) and WebM with WebCodecs/Mediabunny. Browser codec/device support still applies.
- Legacy native server render and MP4-finishing routes are unavailable only in the Workers build. They authenticate and return 503 before reserving usage. The normal local Next.js native routes remain intact.
- Speech transcription uses the selected external API. Optional local Python speech is unavailable on Workers.
- Worker AI vision sends every bounded original JPEG in batches of at most three to the same model. Each response is validated and accounted for before final planning. Local Node builds retain numbered contact sheets. More source images can require more vision calls; the existing overall timeout still applies.
- Experimental reference-presets remain disabled. No database migration or data move is performed.
- Bundled branding and SFX read from Workers Static Assets. The Worker social preview uses a static rendering of the existing public image.

## Release gate and rollback

A successful build or local emulator is not proof that live Workers Free CPU/memory limits support the workload. Verify the real preview before switching DNS: pages and hydration, authenticated uploads and editing/transcription, browser export, bundled sounds, account access, checkout URLs, unsigned-webhook rejection and ownership/usage boundaries.

Keep current Netlify hosting and record existing DNS before domain cutover. Do not change mail MX/TXT records. Restore the recorded web-routing records if the Cloudflare release fails. A repository publication does not itself deploy the application.

The production release uses fetch routes for `kreovar.online/*` and `www.kreovar.online/*` on the already-proxied zone. `www` redirects to the HTTPS apex. Existing Netlify A/CNAME records remain as rollback origins; matched requests are handled by the Worker without fetching Netlify. Mail records are unchanged.
