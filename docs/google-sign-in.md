# VeeloX Google sign-in

Both login and signup now have a shared **Continue with Google** action. It uses the existing Supabase browser client and session cookies. The callback verifies the returned session and user before opening the dashboard. Errors/cancellation allow returning to email login. No additional Google scopes, frontend secrets or new packages were added.

The live Supabase Auth settings check on 8 October 2026 showed **Google disabled**. Until provider setup is complete, clicking the button displays a clear error and restores the email form.

## Enable the provider

1. Open Google Cloud → Google Auth Platform. Configure the app's branding, audience and basic profile/email scopes. If the app is in Testing, add the intended test users; to allow other users, complete the production publishing requirements shown by Google.
2. Create or reuse a **Web application** OAuth client. Add the site's origin under Authorized JavaScript origins.
3. Under Authorized redirect URIs, add the exact **Supabase callback URL** shown under Supabase → Authentication → Sign In / Providers → Google. It normally looks like `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
4. In that Supabase Google provider screen, enable Google and enter the Google **Client ID and Client Secret**. Keep the secret in the provider settings; do not add it to `NEXT_PUBLIC_` variables or chat.
5. Supabase → Authentication → URL Configuration: set the production Site URL and allow the application callback URLs:
   - `http://localhost:3000/auth/callback` for the usual development port.
   - `http://localhost:3087/auth/callback` for the current verification server.
   - `https://YOUR_PRODUCTION_DOMAIN/auth/callback` for production.
6. Open VeeloX login or signup and click Continue with Google. After completing Google consent, confirm the dashboard opens and the session persists after refresh.

The Google redirect URI and VeeloX redirect URL are different: Google returns to Supabase first, then Supabase returns to VeeloX's `/auth/callback`.

## Files

- `app/components/GoogleAuthButton.tsx`: shared button, pending/error handling and return-from-browser-back recovery.
- `app/lib/auth/googleAuth.ts`: provider availability check, safe callback origin and OAuth starter.
- `app/auth/callback/page.tsx`: session verification, cancellation/error/retry UI and timeout handling.
- `app/login/page.tsx`, `app/signup/page.tsx`: shared Google option alongside existing email forms.
- `scripts/test-google-auth.mjs`: redirect, disabled-provider, network and sanitized-error regressions.

Documentation: [Supabase Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
