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
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | **Required, all three.** Uploads. In production the server refuses to start if any is missing (`❌ Cloudinary is not configured … Refusing to start.`); it never falls back to local disk. Local development leaves them empty and stores uploads in `server/uploads` (see `server/config/uploadMode.js`). |
| `MONGOMS_DISABLE_POSTINSTALL` | `1`. Stops the test-only `mongodb-memory-server` from downloading a MongoDB binary if dev dependencies are ever installed. |
| `PUBLIC_APP_URL` | `https://themeetnet.com`. Base of emailed links (`/reset-password?token=…`). Defaults to that value. |
| `RESEND_API_KEY` | **Required for password-reset emails.** Without it in production, reset requests still answer 200 but no email is sent (an error is logged). See [Email](#email-resend). |
| `EMAIL_FROM` | `MeetNet <no-reply@themeetnet.com>` (the domain must be verified in Resend) |
| `EXPO_ACCESS_TOKEN` | Optional. Only if "Enhanced push security" is turned on in the Expo project. |
| `CLIENT_IP_HEADER`, `CLIENT_IP_XFF_INDEX` | Which header carries the real client IP for rate limits. **Production: `CLIENT_IP_HEADER=cf-connecting-ip`**, no index. Empty = `req.ip`. See [Client IP](#client-ip-rate-limiting). |
| `DEBUG_IP_ROUTE` | `1` only **temporarily**, while choosing `CLIENT_IP_HEADER`. Remove afterwards. |
| `VERIFICATION_REQUIRED_FROM` | ISO date-time. Accounts created **at or after** it must verify their email before posting, replying, following, "interested" or reporting. Unset = the default in `server/middleware/requireVerifiedEmail.js` (the release time, see [Email verification](#email-verification)). An invalid value blocks nobody. |
| `EMAIL_REPLY_TO` | Optional. Where replies to MeetNet emails go (themeetnet.com has no inbox). **Production: set to the owner's Gmail** (2026-10-05). |
| `RESEND_WEBHOOK_SECRET` | Optional, `whsec_…`. Turns on `POST /api/webhooks/resend` (404 without it). See [Resend webhook](#resend-webhook-optional). |
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

**Current setting: `CLIENT_IP_HEADER=cf-connecting-ip`** (measured 2026-10-05). Traffic goes client → Cloudflare → Render proxy (`10.x`) → app. What the app received:

| Header | Value | Can a client fake it? |
|---|---|---|
| `req.ip` (`trust proxy 1`) | Render-internal `10.x`, varies per request | – (useless for limits) |
| `X-Forwarded-For` | `<anything the client sent>, <real IP>, <Cloudflare edge>, <Render proxy>` | **Yes**, on the left; the real IP is always 3rd from the right |
| `CF-Connecting-IP` | real IP | **No.** Cloudflare rejects a request that carries one (HTTP 403, error 1000) |
| `True-Client-IP` | real IP | No (overwritten), but redundant |
| `X-Real-IP` | not set | – |

Verified after switching: one client's requests share one counter, fake `X-Forwarded-For`/`True-Client-IP`/`X-Real-IP` don't open a new one, and a second client (different IP) gets its own. If Cloudflare ever stops sending `CF-Connecting-IP`, the code falls back to `req.ip` (safe, just shared again). The fallback would be `CLIENT_IP_HEADER=x-forwarded-for` with `CLIENT_IP_XFF_INDEX=-3`, re-measured first.

Procedure (rerun if hosting or the proxy chain changes):

1. On Render set `DEBUG_IP_ROUTE=1` and deploy. `ADMIN_EMAIL` and `ADMIN_SECRET_KEY` must be set.
2. Log in as the admin account and call it **from your own phone or computer**, not from a server:
   ```bash
   curl -s https://surajya.onrender.com/api/_debug/ip -H "x-admin-key: $ADMIN_KEY" -H "Authorization: Bearer $ADMIN_JWT"
   ```
   It returns `reqIp`, `reqIps`, `x-forwarded-for`, `cf-connecting-ip`, `true-client-ip`, `x-real-ip` for **your request only** (nothing is logged). Compare them with your real IP (e.g. https://api.ipify.org).
3. **Spoofing test:** call it again with **one** fake header per request, e.g. `-H "X-Forwarded-For: 203.0.113.99"`, then `True-Client-IP`, `X-Real-IP` and `CF-Connecting-IP`. Send them separately: Cloudflare blocks any request carrying `CF-Connecting-IP`, which hides the other results. A header is safe only if it **still shows your real IP** while you send fake values. If a value changes to `203.0.113.x`, a client controls it, so don't use it.
4. Set `CLIENT_IP_HEADER` to the safe header, e.g. `cf-connecting-ip`. If only `x-forwarded-for` is safe at one position, set `CLIENT_IP_HEADER=x-forwarded-for` and `CLIENT_IP_XFF_INDEX` to that position (negative counts from the right: `-1` = last entry, `-2` = the one before; a client can only add entries on the left).
5. Remove `DEBUG_IP_ROUTE` and deploy. `/api/_debug/ip` returns 404 again.
6. Check with `curl -sI https://surajya.onrender.com/api/app/config | grep -i ratelimit` (logged-out requests are counted per client IP): repeated calls from one client count down by 1 each; calls with fake headers keep counting on the same counter; a second client on another network starts its own.

## Email (Resend)

Password-reset emails go through the Resend HTTP API (`server/services/email.js`).

**Current setup (done 2026-10-04):** `themeetnet.com` is verified in Resend, region `ap-northeast-1` (Tokyo). Render's `RESEND_API_KEY` is a **restricted key named `meetnet-render-sending`**: sending only, and only for `themeetnet.com`. It can't read or change the Resend account. A real reset email to a test account was reported `delivered` by Resend.

The DNS records live at **Hostinger** (hPanel → Domains → themeetnet.com → DNS records), not Vercel:

| Type | Name | Value | Priority | Purpose |
|---|---|---|---|---|
| TXT | `resend._domainkey` | DKIM public key `p=MIGf…` (copy from Resend → Domains) | – | DKIM signature |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` | 10 | bounce handling (SPF return path) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | – | SPF |
| CNAME | `rsend` | `send.forge.rmta.net` | – | Resend return path |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | – | DMARC (monitor only) |

These sit on subdomains (`send`, `rsend`, `_domainkey`, `_dmarc`), so they don't affect the website, and they won't conflict with a future MX on the root domain. Don't delete them, or sending stops.

To set it up again from scratch: Resend → **Domains → Add domain**, add the records it shows **exactly**, wait for **Verified** (DKIM took about 30 min), create a key with **Sending access** limited to the domain, then set `RESEND_API_KEY`, `EMAIL_FROM` and `PUBLIC_APP_URL` on Render and redeploy. Test with `/forgot-password` for an address that has an account: unknown addresses get the same answer but no email, by design.

Locally, leave `RESEND_API_KEY` empty: reset links and verification codes are printed to the server console instead (never in production).

## Email verification

New accounts get a 6-digit code by email at signup, and can resend it from `/verify-email` (web) or the app.
- **Codes:** valid 10 minutes, 5 wrong tries, stored only as an HMAC-SHA256 keyed with `JWT_SECRET`. If `JWT_SECRET` is ever rotated, codes sent in the last 10 minutes stop working; users just request a new one.
- **Who is blocked:** only accounts created at or after `VERIFICATION_REQUIRED_FROM` (default **`2026-10-05T06:35:00Z`**, the release time plus a 15-minute deploy buffer; not set on Render), and only from creating posts, replying, follow requests, "interested" and reports (`403 { code: 'EMAIL_NOT_VERIFIED' }`). They can log in and browse.
- **Older accounts:** never blocked; they only see a dismissible banner asking them to verify, so password reset can reach them.
- **Changing email** (`PUT /api/users/me/email`): needs the password, makes the new address unverified, sends a code to it, sends a short notice to the old address, and ends every other session.

**Verified on production (2026-10-05, after 06:35 UTC):**
- **New account:** a throwaway account with a disposable inbox signed up (201, `emailVerified: false`, `verificationRequired: true`) and got **403 `EMAIL_NOT_VERIFIED`** on create-post.
- **The email:** it arrived in 11 s, from `MeetNet <no-reply@themeetnet.com>` with Reply-To set to `EMAIL_REPLY_TO`, and contained a 6-digit code and the 10-minute notice.
- **After verifying:** 200, and a post then got 201. The post and the account were deleted afterwards (login → 400).
- **Old account:** an unverified account from May 2026 still passed the gate. A deliberately too-short post got 400 "Post too short", not 403, and nothing was created.

### Resend webhook (optional)

Marks users whose email bounces or is reported as spam (`emailBounced`), so the web banner says *"Your email bounced — please update it"*. Steps (Resend dashboard, nothing to change in code):

1. Resend → **Webhooks → Add Webhook**. Endpoint URL: `https://surajya.onrender.com/api/webhooks/resend`. Events: **`email.bounced`** and **`email.complained`**. Create it.
2. Open the new webhook and copy its **Signing Secret** (starts with `whsec_`).
3. Render → `surajya` → **Environment** → add `RESEND_WEBHOOK_SECRET` with that value → **Save, rebuild and deploy**.
4. Check it: the webhook's page in Resend lists deliveries. Each must answer **200** (401 = wrong secret, 404 = variable not set or not deployed). The free instance may be asleep; Resend retries failed deliveries.
5. Optional end-to-end test: sign up a throwaway account with **`bounced@resend.dev`** (Resend's test address). The verification email bounces, the webhook marks the account, and the banner switches to the "bounced" text.

Only bounces after the webhook is set up are recorded. Earlier ones, such as the security-notice campaign, are not backfilled.

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

DNS for `themeetnet.com` is hosted at **Hostinger** (nameservers `nova.dns-parking.com` / `cosmos.dns-parking.com`), so every DNS change is made in Hostinger's DNS zone editor. The site itself is on Vercel: the apex `A` record points to `76.76.21.21`, and `www` is a `CNAME` to `cname.vercel-dns.com`. Vercel issues and renews the Let's Encrypt certificates for both names. Both must keep valid HTTPS for the mobile app's Universal Links / App Links.
The root domain has **no MX record**, so `@themeetnet.com` addresses can't receive email (Resend only sends).
`surajya.in` is also attached to the Vercel project, but its DNS does not point at Vercel ("misconfigured").

## Backups

Before any release that migrates data, dump the database **outside the repo**:
```powershell
# MongoDB Database Tools: winget install -e --id MongoDB.DatabaseTools
mongodump --uri="<MONGO_URI from Render>" --gzip --out="$env:USERPROFILE\meetnet-backups\<yyyy-mm-dd>"
# restore (only if needed): mongorestore --gzip --uri="<MONGO_URI>" "<that folder>"
```
On a mobile connection, append `&connectTimeoutMS=30000&socketTimeoutMS=300000&serverSelectionTimeoutMS=30000` to the URI (the first attempt on 2026-10-04 timed out during the TLS handshake without them).
**A dump contains personal data** (names, emails, password hashes). Never commit or upload it, and delete it after 14 days.

## Phase 1 release (mobile backend APIs) — done 2026-10-04/05

What happened, in order:

1. Backup with `mongodump` (users 143, posts 208, reports 37, notifications 40), stored offline.
2. Resend domain verified; restricted key, `EMAIL_FROM` and `PUBLIC_APP_URL` set on Render.
3. `mobile/p1-backend-apis` merged into `main` (`1e9d23e`); Render deploy `dep-db114k5g1s2s7395e5j0` went live. The startup migration logged `Migrated 37 reports to targetType=post` and `Report indexes dropped: post_1_reportedBy_1`.
4. Verified in production: health check, 400 for bad ids, no `password`/`email` in real posts, anonymous posts with `postedBy: null`, `/api/app/config`, both `.well-known` files served as JSON, CORS 403 for unknown origins, a real reset email delivered.
5. Client IP measured and `CLIENT_IP_HEADER=cf-connecting-ip` set; `DEBUG_IP_ROUTE` removed again.

Behaviour to know about:

- **Signup now requires accepting the terms and 8+ character passwords.** A browser still on the old cached bundle gets "Please accept the Terms…" until it reloads. Existing users can still log in with 6–7 character passwords and have `termsAcceptedAt: null`; the app can ask them via `POST /api/users/me/accept-terms`.
- **Nobody was logged out by this release:** tokens issued before it have no `tv` and stay valid until the user changes or resets their password, or uses "log out of all devices".

Still to do before the app ships:

- Legal placeholders: `TODO(owner)` in `nexusnetwork/src/pages/{Terms,Privacy,CommunityGuidelines,DeleteAccount}.jsx` and `src/config/legal.js`.
- Deep-link placeholders: Play App Signing SHA-256, Apple Team ID (see [Mobile deep links](#mobile-deep-links)).
- A working support mailbox (see Known issues).

## Known issues / follow-ups

- **`support@themeetnet.com` can't receive email**: the root domain has no MX. Set up receiving (Hostinger email or forwarding) or change `SUPPORT_EMAIL` in `nexusnetwork/src/config/legal.js`; the app stores require a working contact.
- **Cold starts** on the free plan (see above). Consider a paid instance before the mobile launch.

## History

- 2026-06-11 → 2026-10-04: the public `GET /api/posts/:id` returned the author's password hash and email. Fixed in `ee9eec0`, which went live 2026-10-04 05:40 UTC after `JWT_SECRET` was rotated to a 96-character value (all sessions invalidated).
- 2026-10-04: Phase 1 mobile backend APIs live (`1e9d23e`); Resend email set up.
- 2026-10-05: rate limits switched to the real client IP (`CLIENT_IP_HEADER=cf-connecting-ip`).
- 2026-10-05: security notice emailed to 138 users and shown as a banner until 2026-11-05.
- 2026-10-05: email verification released; accounts created from `2026-10-05T06:35:00Z` must verify before posting. `express-mongo-sanitize` moved after the body parsers: request bodies were not sanitized before, and requests with `$`/dotted keys are now refused (400).
