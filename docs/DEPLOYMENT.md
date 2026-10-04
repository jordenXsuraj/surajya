# MeetNet deployment

How production is set up, how to deploy, and where configuration and logs live.
No secret values belong in this file. Secrets live only in the Render and Vercel dashboards.

## Overview

| Part | Host | Address |
|---|---|---|
| Web app (React/Vite, `nexusnetwork/`) | Vercel, project `surajya`, team `jordenxsurajs-projects` | https://themeetnet.com (`www.themeetnet.com` → 308 redirect to the apex) |
| API (Express, `server/`) | Render web service `surajya` (`srv-d7rf1ljt6lks73fs4e10`), free plan, Singapore, 1 instance | https://surajya.onrender.com, API base `https://surajya.onrender.com/api` |
| Database | MongoDB Atlas | connection string in `MONGO_URI` on Render |
| Images / PDFs | Cloudinary | credentials in `CLOUDINARY_*` on Render |

Both apps deploy from GitHub `jordenXsuraj/surajya`.

## How to deploy

Push (or merge) to `main`. Both hosts deploy automatically:

- **Vercel** builds `nexusnetwork/` and promotes it to production. Every other branch gets a Preview deployment, and its status shows on the GitHub commit.
- **Render** builds `server/` and swaps in the new instance once it starts. Render does not report to GitHub, so check the Render dashboard (Events) or the health checks below.

If a Render deploy fails (build error, or the app exits at startup), Render keeps the previous version running and marks the deploy `update_failed` or `build_failed`. **A push to `main` is not live until Render says so.** Always run the checks in [Verify a deploy](#verify-a-deploy).

### Manual deploy / rollback

- **Render:** Dashboard → `surajya` → **Manual Deploy → Deploy latest commit**. To roll back: **Events** → pick an earlier successful deploy → **Rollback**.
  API alternative: `POST https://api.render.com/v1/services/srv-d7rf1ljt6lks73fs4e10/deploys` with body `{"commitId":"<sha>"}`.
- **Vercel:** Dashboard → project `surajya` → **Deployments** → pick a deployment → **Promote to Production** (or **Redeploy**).

## Render service settings

| Setting | Value |
|---|---|
| Branch | `main` (auto-deploy on commit) |
| Root directory | `server` |
| Build command | `npm ci --omit=dev` (production dependencies only; the lockfile must be in sync) |
| Start command | `npm start` (`node index.js`) |
| Node version | from `server/package.json` → `engines.node` (20.20.2) |

## Environment variables

### Render (API): Dashboard → `surajya` → Environment

| Key | Notes |
|---|---|
| `NODE_ENV` | `production`. Enables the startup secret check and production logging. |
| `JWT_SECRET` | **Required, at least 32 characters.** In production the server refuses to start without it (`❌ JWT_SECRET is missing or shorter than 32 characters`), so the deploy fails and Render keeps the old version. Changing it logs every user out. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `MONGO_URI` | MongoDB Atlas connection string |
| `CLIENT_URL`, `FRONTEND_URL` | Allowed CORS origins in addition to the list in `server/index.js` |
| `ADMIN_EMAIL`, `ADMIN_SECRET_KEY` | Admin endpoints (`/api/posts/admin/*`) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Uploads |
| `MONGOMS_DISABLE_POSTINSTALL` | `1`. Stops the test-only `mongodb-memory-server` from downloading a MongoDB binary if dev dependencies are ever installed. |
| `PUBLIC_APP_URL` | `https://themeetnet.com`. Base of emailed links (`/reset-password?token=…`). Defaults to that value. |
| `RESEND_API_KEY` | **Required for password-reset emails.** Without it in production, reset requests still answer 200 but no email is sent (an error is logged). See [Email](#email-resend). |
| `EMAIL_FROM` | `MeetNet <no-reply@themeetnet.com>` (the domain must be verified in Resend) |
| `EXPO_ACCESS_TOKEN` | Optional. Only if "Enhanced push security" is turned on in the Expo project. |
| `CLIENT_IP_HEADER`, `CLIENT_IP_XFF_INDEX` | Which header carries the real client IP for rate limits. Empty = `req.ip`. See [Client IP](#client-ip-rate-limiting). |
| `DEBUG_IP_ROUTE` | `1` only **temporarily**, while choosing `CLIENT_IP_HEADER`. Remove afterwards. |
| `APP_MIN_VERSION_ANDROID`, `APP_MIN_VERSION_IOS` | `x.y.z`. Apps below this see a force-update screen. Default `0.0.0`. |
| `APP_LATEST_VERSION_ANDROID`, `APP_LATEST_VERSION_IOS` | `x.y.z`. Apps below this see an optional update prompt. Default `1.0.0`. |
| `APP_STORE_URL_ANDROID`, `APP_STORE_URL_IOS` | Store links. Android defaults to the Play listing for `com.themeetnet.app`; iOS is empty until the app exists. |
| `APP_CONFESSIONS_ANDROID`, `APP_CONFESSIONS_IOS`, `APP_PDF_UPLOADS` | Feature flags (`true`/`false`, default `true`). E.g. turn confessions off on iOS during App Review. |
| `APP_MAINTENANCE`, `APP_MAINTENANCE_MESSAGE` | `true` shows a maintenance screen in the app with the message. |

All `APP_*` values are served by `GET /api/app/config` (cached 60 s). Invalid values fall back to the defaults.

After changing a variable, start a deploy. A running instance keeps its old environment until it is replaced.

### Vercel (web app): Project → Settings → Environment Variables

| Key | Notes |
|---|---|
| `VITE_API_URL` | `https://surajya.onrender.com/api` (must include `/api`) |
| `VITE_ADMIN_EMAIL` | Shows the admin page link |

`VITE_*` values are baked into the JS bundle at build time and are **public**. Never put a secret in one. Changing one needs a redeploy.

### Local development

Copy `.env.example` (Docker Compose) or `server/.env.example` and fill in your own values. `.env` files are git-ignored. Compose has no `JWT_SECRET` default: set one in `.env`.

## Logs

- **Render:** Dashboard → `surajya` → **Logs**. These contain build output, startup lines, and one request line per API call (`morgan` "combined" format: address, method, path, status, referrer, user agent).
  API: `GET https://api.render.com/v1/logs?ownerId=tea-d7qr1ut7vvec73du9jbg&resource=srv-d7rf1ljt6lks73fs4e10&type=app|build`.
  On the free plan about **7 days** of logs are kept. Render has no separate request logs for this service.
- **Vercel:** Project → **Deployments** → a deployment → **Build Logs**. Runtime logs are minimal (static site).

The address in API request logs is `req.ip`, which on Render is an internal `10.x` proxy address, not the user's IP. Rate limits use `CLIENT_IP_HEADER` instead (next section); the logs are unchanged.

## Client IP (rate limiting)

On Render, `req.ip` is an internal proxy address shared by many users, so IP-keyed limits (signup, the IP half of the login key, forgot/reset password, logged-out API traffic) would be shared too. `server/utils/clientIp.js` reads the real IP from the header named in `CLIENT_IP_HEADER` and falls back to `req.ip` when the header is missing or not a valid IP.

**Only use a header your proxies overwrite.** Anything a client can set itself would let an attacker pick a fresh IP per request and skip every limit.

Procedure (once, and again if hosting changes):

1. On Render set `DEBUG_IP_ROUTE=1` and deploy. `ADMIN_EMAIL` and `ADMIN_SECRET_KEY` must be set.
2. Log in as the admin account and call it **from your own phone or computer**, not from a server:
   ```bash
   curl -s https://surajya.onrender.com/api/_debug/ip -H "x-admin-key: $ADMIN_KEY" -H "Authorization: Bearer $ADMIN_JWT"
   ```
   It returns `reqIp`, `reqIps`, `x-forwarded-for`, `cf-connecting-ip`, `true-client-ip`, `x-real-ip` for **your request only** (nothing is logged). Compare them with your real IP (e.g. https://api.ipify.org).
3. **Spoofing test:** call it again with a fake header, `-H "X-Forwarded-For: 203.0.113.99"` (and also try `-H "CF-Connecting-IP: 203.0.113.98"`). A header is safe only if it **still shows your real IP** while you send fake values. If a value changes to `203.0.113.x`, a client controls it, so don't use it.
4. Set `CLIENT_IP_HEADER` to the safe header, e.g. `cf-connecting-ip`. If only `x-forwarded-for` is safe at one position, set `CLIENT_IP_HEADER=x-forwarded-for` and `CLIENT_IP_XFF_INDEX` to that position (negative counts from the right: `-1` = last entry, `-2` = the one before; a client can only add entries on the left).
5. Remove `DEBUG_IP_ROUTE` and deploy. `/api/_debug/ip` returns 404 again.
6. Check: two different networks (Wi-Fi and mobile data) get separate `RateLimit: remaining=…` counters on `POST /api/auth/signup` with an empty body.

## Email (Resend)

Password-reset emails go through the Resend HTTP API (`server/services/email.js`).

1. Create a Resend account → **Domains → Add domain** → `themeetnet.com` (choose the region closest to your users).
2. Resend shows DNS records with values unique to your domain. Add them **exactly as shown** at the DNS provider that manages `themeetnet.com` (the one with the Vercel `A`/`CNAME` records). Typically:

   | Type | Name | Value (copy from Resend) |
   |---|---|---|
   | TXT | `resend._domainkey` | DKIM public key `p=MIGf…` |
   | MX | `send` | `feedback-smtp.<region>.amazonses.com`, priority 10 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` |
   | TXT (recommended) | `_dmarc` | `v=DMARC1; p=none;` |

   These are on the `send` subdomain and `_domainkey`, so they don't affect the website or any existing mail on the root domain.
3. Wait until Resend shows the domain as **Verified**, then create an API key with "Sending access" and set `RESEND_API_KEY` and `EMAIL_FROM` on Render.
4. Test: `/forgot-password` on the site with your own email. The email must arrive and its link must open `https://themeetnet.com/reset-password?token=…`.

Locally, leave `RESEND_API_KEY` empty: the reset link is printed to the server console instead (never in production).

## Mobile deep links

`nexusnetwork/public/.well-known/` holds the files Android and iOS fetch from `https://themeetnet.com` to let the app open `/post/*`, `/profile/*` and `/reset-password` links. `vercel.json` (and `nginx.conf`) serve both as `application/json` and keep them out of the SPA rewrite. Both contain placeholders to replace before release:

- **`assetlinks.json` → `sha256_cert_fingerprints`**: Play Console → your app → **Test and release → Setup → App integrity → App signing** → *App signing key certificate* → **SHA-256 certificate fingerprint**. Google re-signs Play builds with this key, so the upload key's fingerprint isn't enough. To test App Links on EAS builds before Play (internal/dev builds), also add that keystore's SHA-256 from `eas credentials` (the list accepts several).
- **`apple-app-site-association` → `TEAMID`**: your Apple Developer Team ID (developer.apple.com → Membership). Replace it in all three places.

Declare **only `themeetnet.com`** (not `www`) in the app's intent filters and associated domains: `www` answers with a redirect, and both platforms reject verification files behind a redirect.

Verify after deploying:
```bash
curl -sI https://themeetnet.com/.well-known/assetlinks.json              # 200, content-type: application/json
curl -sI https://themeetnet.com/.well-known/apple-app-site-association   # 200, content-type: application/json
# Google's checker:
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://themeetnet.com&relation=delegate_permission/common.handle_all_urls"
```

## Verify a deploy

```bash
curl -s https://surajya.onrender.com/healthz                 # OK
curl -s https://surajya.onrender.com/api/posts/not-an-id     # 400 {"message":"Invalid post id"}
curl -s https://surajya.onrender.com/api/app/config          # 200 JSON config
curl -s -H "Origin: https://evil.example" https://surajya.onrender.com/api/app/config   # 403 {"message":"Origin not allowed"}
curl -sI https://www.themeetnet.com | head -3                # 308 → https://themeetnet.com/
```

A free-plan instance sleeps after about 15 minutes idle, so the first request can take up to about a minute.
`GET /api/posts/<real id>` must never contain `password` or `email`, and anonymous posts must have `postedBy: null` (covered by `cd server && npm test`).

## Domains and HTTPS

Both names are on Vercel: the apex `A` record points to `76.76.21.21`, and `www` is a `CNAME` to `cname.vercel-dns.com`. Vercel issues and renews the Let's Encrypt certificates for both names. Both must keep valid HTTPS for the mobile app's Universal Links / App Links.
`surajya.in` is also attached to the Vercel project, but its DNS does not point at Vercel ("misconfigured").

## Releasing Phase 1 (mobile backend APIs)

After merging to `main` (both apps deploy together):

1. **Render env:** set `PUBLIC_APP_URL=https://themeetnet.com`, then `RESEND_API_KEY` and `EMAIL_FROM` once Resend has verified the domain. Until then forgot-password answers normally but sends nothing.
2. **Startup migration** (automatic, idempotent): old reports get `targetType: 'post'`, and the old `{ post, reportedBy }` unique index is replaced. Check the Render log for `Report indexes dropped: post_1_reportedBy_1` on the first start.
3. **Client IP:** run the [procedure](#client-ip-rate-limiting) and set `CLIENT_IP_HEADER`.
4. **Signup now requires accepting the terms.** A browser still running the old cached bundle gets "Please accept the Terms…" until it reloads. Existing users aren't affected (`termsAcceptedAt: null`; the app can ask them via `POST /api/users/me/accept-terms`).
5. **Nobody is logged out by this release:** tokens issued before it have no `tv` and stay valid until the user changes their password, resets it, or uses "log out of all devices".
6. Replace the legal placeholders (`TODO(owner)` in `nexusnetwork/src/pages/{Terms,Privacy,CommunityGuidelines,DeleteAccount}.jsx` and `src/config/legal.js`), and the deep-link placeholders before the app ships.
7. Verify: the checks above, plus `/terms`, `/privacy`, `/community-guidelines` and `/delete-account` load on the site, and a real forgot → reset password round trip works.

## Known issues / follow-ups

- **Client IP header not chosen yet.** Until `CLIENT_IP_HEADER` is set (see above), IP-keyed limits still use the shared Render proxy address.
- **Cold starts** on the free plan (see above). Consider a paid instance before the mobile launch.

## History

- 2026-06-11 → 2026-10-04: the public `GET /api/posts/:id` returned the author's password hash and email. Fixed in `ee9eec0`, which went live 2026-10-04 05:40 UTC after `JWT_SECRET` was rotated to a 96-character value (all sessions invalidated).
