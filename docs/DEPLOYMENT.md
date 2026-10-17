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

**Render account:** the `surajya` service is in the Render workspace **"My Workspace"**, which is under a different Render login from the one whose workspace is called "AniKeT's workspace". If the service isn't listed after signing in, you are in the other login: sign out and use the one that owns "My Workspace".

## How to deploy

Push (or merge) to `main`. Both hosts deploy automatically:

- **Vercel** builds `nexusnetwork/` and promotes it to production. Every other branch gets a Preview deployment, and its status shows on the GitHub commit.
- **Render** builds `server/` and swaps in the new instance once it starts — only for commits that change `server/` (docs-only commits such as 241db37 deploy nothing, so the live commit can be older than `main`). Render does not report to GitHub: confirm a deploy by the commit SHA `GET /healthz` returns (below), or in the Render dashboard (Events).

If a Render deploy fails (build error, or the app exits at startup), Render keeps the previous version running and marks the deploy `update_failed` or `build_failed`. **A push to `main` is not live until Render says so.** Always run the checks in [Verify a deploy](#verify-a-deploy).

### Manual deploy / rollback

- **Render:** Dashboard → `surajya` → **Manual Deploy → Deploy latest commit**. To roll back: **Events** → pick an earlier successful deploy → **Rollback** (this also brings back that deploy's Node version: it comes from the commit's `server/.nvmrc` / `engines`). Pick a commit that was actually deployed, i.e. one that changed `server/`: before the security patch 2e1144b (live 2026-10-13 17:44Z) that is **9d816bc** (Prompt 6 merge), not 241db37 (docs only, never deployed). Afterwards check `/healthz` shows the rolled-back SHA.
  API alternative: `POST https://api.render.com/v1/services/srv-d7rf1ljt6lks73fs4e10/deploys` with body `{"commitId":"<sha>"}`.
- **Vercel:** Dashboard → project `surajya` → **Deployments** → pick a deployment → **Promote to Production** (or **Redeploy**).

## Render service settings

| Setting | Value |
|---|---|
| Branch | `main` (auto-deploy on commit) |
| Root directory | `server` |
| Build command | `npm ci --omit=dev` (production dependencies only; the lockfile must be in sync) |
| Start command | `npm start` (`node index.js`) |
| Node version | 22.23.3 from **`server/.nvmrc`**: Render reads it from the service's root directory (deploy log, 2026-10-17: "Using Node.js version 22.23.3 via /opt/render/project/src/server/.nvmrc"), before `package.json` → `engines.node`, which says the same (a server test keeps the two equal). Change both together. A `NODE_VERSION` environment variable or a `server/.node-version` would win over both, so don't add those |

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
| `EXPO_ACCESS_TOKEN` | **Required.** The robot user's access token for Expo's push service (see [Push security](#push-security-expo-access-token)). In production the server refuses to start without it (`❌ EXPO_ACCESS_TOKEN is not set … Refusing to start in production.`), so the deploy fails and Render keeps the old version. |
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

`nexusnetwork/public/.well-known/` holds the files Android and iOS fetch from `https://themeetnet.com` and `https://www.themeetnet.com` to let the app open `/post/*` and `/profile/*` links (`/reset-password` stays in the browser until the app has that screen). `vercel.json` (and `nginx.conf`) serve both as `application/json` and keep them out of the SPA rewrite. `vercel.json` also redirects every `www` path to the apex **except `/.well-known/`**: both platforms reject verification files behind a redirect, so `www` must answer them directly (the `www.themeetnet.com` domain in Vercel must not redirect on its own).

- **`assetlinks.json` → `sha256_cert_fingerprints`** (`com.themeetnet.app`):
  - now: the EAS keystore of `com.themeetnet.app` (`3F:0E:B2:…:7D:98:01:74`, created by the first preview build; `eas credentials -p android` shows it). It signs preview builds and is the **upload key** for Play.
  - at the Play launch, **add** (don't replace) the Play signing key: Play Console → your app → **Test and release → Setup → App integrity → App signing** → *App signing key certificate* → **SHA-256 certificate fingerprint**. Google re-signs Play builds with that key, so without it App Links fail for Play installs.
- **`apple-app-site-association` → `TEAMID`**: still a placeholder until there is an Apple Developer account (developer.apple.com → Membership → Team ID). Replace it in all three places; until then iOS universal links don't work.

Verify after deploying:
```bash
for h in themeetnet.com www.themeetnet.com; do
  curl -sI https://$h/.well-known/assetlinks.json | head -1                # 200 (no redirect), application/json
  curl -sI https://$h/.well-known/apple-app-site-association | head -1     # 200 (no redirect), application/json
done
curl -sI https://www.themeetnet.com/ | head -3                             # 308 → https://themeetnet.com/
# on an Android device / emulator with a preview build (com.themeetnet.app):
adb shell pm verify-app-links --re-verify com.themeetnet.app
adb shell pm get-app-links com.themeetnet.app                              # themeetnet.com: verified, www.themeetnet.com: verified
adb shell am start -W -a android.intent.action.VIEW -d "https://themeetnet.com/post/<id>" com.themeetnet.app
# Google's checker:
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://themeetnet.com&relation=delegate_permission/common.handle_all_urls"
```

## Push notifications (Expo → FCM)

- **Firebase project `themeetnet`** (Spark, free; Google Cloud project of the same id). Android apps `com.themeetnet.app` and `com.themeetnet.app.dev`; both are in one `google-services.json`.
- **`google-services.json` is not in git** (public repo; it holds an Android API key). EAS builds get it from the **file environment variable `GOOGLE_SERVICES_JSON`** (secret visibility, development / preview / production): `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret …`. A local copy in `mobile/` is ignored by git and `.easignore`. Get it again with `firebase apps:sdkconfig ANDROID <app id> --project themeetnet`.
- **FCM V1 sender**: service account `meetnet-fcm-sender@themeetnet.iam.gserviceaccount.com` with **only** `roles/firebasecloudmessaging.admin`. Its single key is stored **only on EAS** (Credentials → Android → FCM V1 service account key, attached to both package names); no copy is kept anywhere else. To rotate: create a new key for the account, upload it in `eas credentials -p android` (or the EAS API), then delete the old key in Google Cloud → IAM → Service accounts → Keys.
- The server sends through Expo's push service (`expo-server-sdk`, no channelId → the app's `default` channel). Test one user's devices: `cd server && MONGO_URI=… node scripts/sendTestPush.js <email> [--url=/post/<id>]` (prints ticket and receipt status only; needs `EXPO_ACCESS_TOKEN` for any database but a local one).

### Push security (Expo access token)

Without Expo's **enhanced push security**, anyone who has a device's Expo push token can send it pushes through Expo. With it on, Expo accepts pushes for the projects of the account **`aniket078s-team`** only with an access token (`UNAUTHORIZED` otherwise). The setting covers **every project of that account**. The token is a dedicated **robot user** with the smallest role that works, never a personal token and never the Admin robot EAS builds use (`EXPO_TOKEN`). Its value never goes into chat, git or logs.

**Order** (each step only after the previous one worked):

1. **Robot + token** (Expo dashboard): expo.dev → account switcher (top left) → **aniket078s-team** → **Settings → Access tokens** (`https://expo.dev/accounts/aniket078s-team/settings/access-tokens`) → **Robot users → Add robot** → name `meetnet-push-sender`, role **Viewer** (the smallest; step 7 shows whether it is enough) → create. On that robot: **Create token** → name `push-api` → copy it (it is shown once).
2. **Windows (local tests)**: Win+R → `rundll32 sysdm.cpl,EditEnvironmentVariables` → *User variables* → **New** → `EXPO_ACCESS_TOKEN` = the token → OK. New terminals get it; Claude reads it into the test process only, never prints it.
3. **Render**: Dashboard → `surajya` → **Environment** → **Add Environment Variable** → key `EXPO_ACCESS_TOKEN`, value = the token → save with **Save only** (the merge deploys it; *Save and deploy* is harmless too: the running version already uses the variable when set).
4. **Merge → deploy.** Render's log must show `✅ Server running`. Without the variable the deploy fails with `EXPO_ACCESS_TOKEN is not set … Refusing to start in production.` and the old version keeps running.
5. **Test with the token, setting still off**: a push from the production API reaches a phone (preview build signed in with a disposable account; another disposable account sends it a follow request), and the Render log has no `push ticket error` / `push: send failed`. Locally: `sendTestPush.js` to the emulator → `Tickets: { ok: 1 }`.
6. **Turn it on**: same Access tokens page → **Enhanced security for push notifications** → enable.
7. **Test again**:
   - without the token (local database, `EXPO_ACCESS_TOKEN` empty in that one command): `sendTestPush.js` → ticket / send error **`UNAUTHORIZED`** (rejected);
   - with the token: `sendTestPush.js` → `ok`, and a push from the production API arrives.
   - If *with the token* is refused too, the robot's role is too small: on the robot's page raise it one step (**Viewer → Developer**), same token, test again. Record the role that works here.

**Role in use:** **Viewer** (enough; checked 2026-10-13 with enhanced security on: without the token Expo refused "Insufficient permissions to send push notifications to @aniket078s-team/meetnet", with it the push went through, and a production push from Render arrived). **Current token:** `push-api-2` on `meetnet-push-sender` (2026-10-12; the first one, `push-api`, was deleted). It is on Render and in the owner's Windows user variables.

- **Undo**: turn enhanced security off: Expo accepts pushes without a token again at once (the server keeps sending its token, which is fine).
- **Rotate**: create a new token on the robot → update Render (deploy) and the Windows variable → delete the old token on the robot's page.
- **Local development once it is on**: real pushes from the local API (Maestro p6-12/13/14, p6-10's like, `sendTestPush.js`) need `EXPO_ACCESS_TOKEN` in its environment; the Maestro runner passes its own environment on to the API it starts.

## Crash reports (Sentry, mobile app)

The app reports crashes with `@sentry/react-native` (`mobile/src/lib/monitoring.ts`): user id only, no request bodies, auth headers, push tokens or emails, 5 % performance traces. Release = `com.themeetnet.app@<version>+<build number>`, dist = build number (SDK defaults, the same names the build uploads source maps for).

**Set up 2026-10-13:** organisation `meetnet` (its own org, **EU region**: `meetnet.sentry.io`, API `https://de.sentry.io/`), project `meetnet-mobile`. `mobile/eas.json` (preview, production) has `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`; the org auth token is the EAS secret `SENTRY_AUTH_TOKEN` (preview, production). Development builds have no DSN, so they send nothing. If the token is ever revoked, set a new one the same way (step 3); without it every release build fails its upload step.

How it was set up (for a new organisation or project):

1. Create an organisation (if none) and a project: platform **React Native**, name `meetnet-app`. Note the **organisation slug** and **project slug** (Settings → General).
2. Copy the project's **DSN** (Settings → Client Keys). It is not a secret (it only allows sending events); send it to be added to `mobile/eas.json` (`EXPO_PUBLIC_SENTRY_DSN`, preview and production) together with `SENTRY_ORG` / `SENTRY_PROJECT` (the slugs).
3. Create an **organisation auth token** for source maps: Settings → Developer Settings → **Organization Tokens** → Create (organisation tokens have fixed CI permissions; use this one only for the app's source maps). Store it **only** on EAS, never in chat or the repo:
   `cd mobile; npx eas-cli env:set --name SENTRY_AUTH_TOKEN --environment preview --environment production --visibility secret`
   Leave out `--value`: the CLI then asks for it, so it isn't kept in the shell history (or use EAS dashboard → project → Environment variables). For a local release build, a Windows user variable `SENTRY_AUTH_TOKEN` works the same way.
4. Then remove `"SENTRY_DISABLE_AUTO_UPLOAD": "true"` from `mobile/eas.json` (preview and production) and add `SENTRY_ORG`, `SENTRY_PROJECT` and, for an EU organisation, `SENTRY_URL=https://de.sentry.io/`: from the next build on, the Gradle step uploads the source maps. (`SENTRY_DISABLE_AUTO_UPLOAD=true` turns the upload off again, e.g. while a token is missing.)
5. Check: build a preview APK, open it once, trigger a test error from a debug screen (or wait for a real one) and confirm the event shows readable file names and line numbers, and the user shows as an id only.

## Verify a deploy

```bash
curl -s https://surajya.onrender.com/healthz                 # OK 2e1144b  ← must be the commit you deployed (first 7 characters)
curl -s https://surajya.onrender.com/api/posts/not-an-id     # 400 {"message":"Invalid post id"}
curl -s https://surajya.onrender.com/api/app/config          # 200 JSON config
curl -s -H "Origin: https://evil.example" https://surajya.onrender.com/api/app/config   # 403 {"message":"Origin not allowed"}
curl -sI https://www.themeetnet.com | head -3                # 308 → https://themeetnet.com/ (but /.well-known/* answers 200)
```

`/healthz` shows `OK <short SHA>` from Render's `RENDER_GIT_COMMIT` (`OK unknown` locally): a deploy counts as live only when that SHA is the new commit. Poll it after a push (e.g. every 20 s); while the old instance still serves, it shows the old SHA. Don't infer deploys from other signals (rate-limit counters, timings): on 2026-10-13 that missed a deploy that went live within a minute of the push.
A free-plan instance sleeps after about 15 minutes idle, so the first request can take up to about a minute.
`GET /api/posts/<real id>` must never contain `password` or `email`, and anonymous posts must have `postedBy: null` (covered by `cd server && npm test`).

## Domains and HTTPS

DNS for `themeetnet.com` is hosted at **Hostinger** (nameservers `nova.dns-parking.com` / `cosmos.dns-parking.com`), so every DNS change is made in Hostinger's DNS zone editor. The site itself is on Vercel: the apex `A` record points to `76.76.21.21`, and `www` is a `CNAME` to `cname.vercel-dns.com`. Vercel issues and renews the Let's Encrypt certificates for both names. Both must keep valid HTTPS for the mobile app's Universal Links / App Links.
Inbound mail: the apex has **ImprovMX** MX records (`mx1.improvmx.com` 10, `mx2.improvmx.com` 20) and the SPF `v=spf1 include:spf.improvmx.com ~all`; ImprovMX (free plan) forwards `support@themeetnet.com` to the owner's Gmail: one alias, `support` (the default catch-all `*` was removed, so mail to any other address bounces). Verified 2026-10-10: a test mail from Resend to support@ was accepted by ImprovMX (Resend: delivered) and arrived in the owner's Gmail inbox. Test again any time by sending a mail to support@themeetnet.com and looking in Gmail (and Spam). Resend's records (`send` MX/TXT, `rsend` CNAME, `resend._domainkey`, `_dmarc`) are separate names and stay as they are; Resend sends with `send.themeetnet.com` as return path, so the apex SPF doesn't affect it.
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

## Known issues / follow-ups

- **Cold starts** on the free plan (see above). Consider a paid instance before the mobile launch.

## History

- 2026-06-11 → 2026-10-04: the public `GET /api/posts/:id` returned the author's password hash and email. Fixed in `ee9eec0`, which went live 2026-10-04 05:40 UTC after `JWT_SECRET` was rotated to a 96-character value (all sessions invalidated).
- 2026-10-04: Phase 1 mobile backend APIs live (`1e9d23e`); Resend email set up.
- 2026-10-05: rate limits switched to the real client IP (`CLIENT_IP_HEADER=cf-connecting-ip`).
- 2026-10-05: security notice emailed to 138 users and shown as a banner until 2026-11-05.
- 2026-10-05: email verification released; accounts created from `2026-10-05T06:35:00Z` must verify before posting. `express-mongo-sanitize` moved after the body parsers: request bodies were not sanitized before, and requests with `$`/dotted keys are now refused (400).
