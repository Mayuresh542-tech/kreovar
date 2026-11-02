# Kreovar on Netlify

The hosted application is [kreovar.online](https://kreovar.online). Use your own Netlify project when deploying a fork; do not reuse historical site IDs found in older reports.

## Configuration

The repository's `netlify.toml` runs `npm run build` and enables `@netlify/plugin-nextjs` plus the local Windows adapter plugin. This is a Next.js server application, so allow the adapter to produce the required functions, assets, and routing metadata.

Set environment values from `.env.example` in your project's environment settings. Private provider keys, service-role credentials, payment/webhook secrets, and the encryption secret must stay server-only. Set your public origin, Supabase auth redirects, Whop plan/account identifiers, checkout return URL, and webhook endpoint for that deployment.

Set `NEXT_PUBLIC_SERVER_MP4_ENABLED=false` unless a working FFmpeg finishing service is available on your host. Browser export and hosted upload/transcription limits depend on the browser, app policies, bucket limits, and platform request limits.

## Build and deploy

For Git-connected deployment, choose the repository, verify the base directory is the application root, and let Netlify run its configured build. Publishing this GitHub repository does not automatically connect or deploy the existing website.

For a deliberate CLI deployment, run from the application root:

```bash
npx netlify-cli build --context production
npx netlify-cli deploy --no-build --dir .netlify/static --functions .netlify/functions-internal --site YOUR_SITE_ID
```

Inspect the generated adapter output and draft deployment before publishing with `--prod`. Retain any required adapter-generated routing/edge metadata. Never upload the source directory or raw `.next` output as a static-only website. Rebuild after moving the checkout: cached manifests may contain absolute paths from the old location. Parent-directory package detection can also select the wrong root, so verify the resolved project directory and generated bundle.

The Windows plugin corrects a generated adapter URL during Windows middleware bundling and excludes generated dotenv files. It does not replace application authentication or access controls; inspect its current implementation before changing adapter versions.

## Verify your deployment

- Check the homepage, sign-in/callback flow, public policy pages and policy PDF links.
- Check project ownership, private media access, session behavior, and server-only secret handling.
- Test provider-backed actions and exports with your own account; verify failures are visible.
- Test billing against the appropriate sandbox and verify signed webhook/server confirmation.
- Confirm your intended origin, security headers, and actual supported export formats.

Hosting credits, feature flags, provider access, and database migrations are separate operational prerequisites. A successful local build or GitHub push does not prove a live integration or production deployment.
