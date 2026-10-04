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

The address in API request logs is currently a Render-internal `10.x` proxy address, not the user's IP (see Known issues).

## Verify a deploy

```bash
curl -s https://surajya.onrender.com/healthz                 # OK
curl -s https://surajya.onrender.com/api/posts/not-an-id     # 400 {"message":"Invalid post id"}
curl -sI https://www.themeetnet.com | head -3                # 308 → https://themeetnet.com/
```

A free-plan instance sleeps after about 15 minutes idle, so the first request can take up to about a minute.
`GET /api/posts/<real id>` must never contain `password` or `email`, and anonymous posts must have `postedBy: null` (covered by `cd server && npm test`).

## Domains and HTTPS

Both names are on Vercel: the apex `A` record points to `76.76.21.21`, and `www` is a `CNAME` to `cname.vercel-dns.com`. Vercel issues and renews the Let's Encrypt certificates for both names. Both must keep valid HTTPS for the mobile app's Universal Links / App Links.
`surajya.in` is also attached to the Vercel project, but its DNS does not point at Vercel ("misconfigured").

## Known issues / follow-ups

- **Rate limits see a proxy IP.** With `app.set('trust proxy', 1)`, `req.ip` resolves to a Render-internal `10.x` address. IP-keyed limits (signup 30/hour, unauthenticated API traffic, and the IP part of the login key) are therefore shared by everyone who comes through the same proxy address. Fix: log `X-Forwarded-For` / `CF-Connecting-IP` / `True-Client-IP` once to learn the real hop count, then set `trust proxy` (or key on the trusted client-IP header).
- **Cold starts** on the free plan (see above). Consider a paid instance before the mobile launch.
- **Disallowed CORS origins get HTTP 500** instead of a clean rejection (browsers block them either way).

## History

- 2026-06-11 → 2026-10-04: the public `GET /api/posts/:id` returned the author's password hash and email. Fixed in `ee9eec0`, which went live 2026-10-04 05:40 UTC after `JWT_SECRET` was rotated to a 96-character value (all sessions invalidated).
