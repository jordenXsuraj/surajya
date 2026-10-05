# MeetNet backlog

Open items that are known but not scheduled yet. Each line: what, why it matters, where it lives.
Remove an item in the same change that fixes it.

_Last updated: 2026-10-05._

## Web

- **Bottom nav highlights "Post" on `/post/<id>` pages.**
  Why: the shared-post page looks like the compose screen is open, which is confusing.
  Where: `nexusnetwork/src/components/BottomNav.jsx` (`pathname.startsWith(t.to)` also matches `/post/<id>`).
- **Shared post page (logged out) should say "Log in to like or reply".**
  Why: today like/reply on `/post/<id>` fail silently for logged-out visitors (no token is sent, handlers are no-ops).
  Where: `nexusnetwork/src/pages/SinglePost.jsx` (renders `PostCard` with empty `currentUserId` and no-op handlers).
- **`Onboard.jsx` has 4 pre-existing ESLint errors** (unused variables).
  Why: they hide new lint problems in the signup page and block a clean `npm run lint`.
  Where: `nexusnetwork/src/pages/Onboard.jsx`.

## Server

- **Node 20 is end-of-life: move to Node 22 LTS, then upgrade `expo-server-sdk`.**
  Why: no more security fixes for Node 20; newer `expo-server-sdk` versions need a newer Node.
  Where: `server/package.json` (`engines.node`), `server/Dockerfile`, Render service settings.
- **Refresh tokens.**
  Why: sessions are a single 30-day JWT with no refresh, so users are logged out every 30 days and a stolen token stays valid until it expires (only `logout-all` / password change revoke it).
  Where: `server/utils/token.js` (`expiresIn: '30d'`), `server/middleware/auth.js`, clients' auth stores.

## Infrastructure

- **Render free plan: move to a paid instance before the mobile beta.**
  Why: the free instance sleeps after ~15 min idle (first request can take ~60 s, bad for app launch) and keeps only 7 days of logs (too short for incident checks).
  Where: Render dashboard, service `surajya` (see `docs/DEPLOYMENT.md`).

## Email

- **`support@themeetnet.com` has no MX record — it cannot receive mail.**
  Why: app stores require a working support contact before submission, and the legal pages list this address.
  Where: Hostinger DNS zone for `themeetnet.com` (MX records), plus a mailbox or forwarder.
- **Resend bounce webhook not configured (`RESEND_WEBHOOK_SECRET` unset).**
  Why: without it `emailBounced` is never set, so users with a dead address are never asked to change it.
  Where: `server/routes/webhooks.js`; Resend dashboard (webhook to `https://surajya.onrender.com/api/webhooks/resend`); Render env `RESEND_WEBHOOK_SECRET`.

## Mobile

- **App Links / Universal Links need the real signing identities (Prompt 6).**
  Why: Android verifies links only with the Play App Signing SHA-256 certificate fingerprint, iOS only with the Apple Team ID; until then links open the browser instead of the app.
  Where: `nexusnetwork/public/.well-known/assetlinks.json`, `nexusnetwork/public/.well-known/apple-app-site-association`; app side in `mobile/app.config.ts`.

## Ops

- **Delete the local database backup `C:\Users\Aniket Jadhav\meetnet-backups\2026-10-04\` by 2026-10-18.**
  Why: it holds a full copy of user data (emails, password hashes) outside the database's access controls.
  Where: that folder on the development PC (not in the repo).
