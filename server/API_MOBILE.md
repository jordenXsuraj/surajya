# MeetNet API — mobile reference

Every endpoint the React Native (Expo) app uses. Source of truth: `server/routes/*.js`.
Tests: `server/tests/` (run `npm test`).

## Conventions

| Topic | Rule |
|---|---|
| Base URL | Production `https://surajya.onrender.com/api`. Local `http://<your-LAN-ip>:5000/api`. |
| Auth | `Authorization: Bearer <token>`. Tokens are JWTs valid for 30 days, payload `{ id, tv }`. Store them in SecureStore. |
| **401** | **Always means "the session is over"** (missing, expired or revoked token, or deleted user). Clear the token and show login. Wrong passwords never return 401. |
| 400 | Validation error (including schema limits, e.g. reply > 350 or post > 1000 chars), malformed id, or wrong password. Body `{ message }` is safe to show to the user. |
| 403 | Not allowed (e.g. following a user blocked either way, admin-only routes, CORS). |
| 404 | Not found, **or hidden by a block**. Treat both the same way. |
| 429 | Rate limited. Body `{ message }`. Header `RateLimit: limit=…, remaining=…, reset=<seconds>` and `RateLimit-Policy`. |
| Errors | Always JSON `{ message: string }`. |
| Ids | MongoDB ObjectIds (24 hex characters). |
| CORS | Native requests send no `Origin` and are always allowed. |
| Uploads | `multipart/form-data`. Images: jpeg/png/webp/heic/heif, max 5 MB; HEIC/HEIF are stored as JPG. PDF: max 10 MB. |
| Cold start | The API is on Render's free plan and sleeps after about 15 min idle. The first request can take up to about 60 s, so use a long timeout plus a "waking up…" state. |

### Rate limits

| Scope | Limit | Key |
|---|---|---|
| `/api/posts`, `/api/users`, `/api/notifications`, `/api/app` | 600 / 10 min | user id (valid token), otherwise client IP |
| `POST /auth/login` | 10 / 15 min | client IP + email |
| `POST /auth/signup` | 30 / hour | client IP |
| `POST /auth/change-password` | 5 / 15 min | user |
| `POST /auth/forgot-password` | 3 / hour per email **and** 10 / hour per IP | email / IP |
| `POST /auth/reset-password` | 10 / 15 min | IP |
| `DELETE /users/me` | 5 / 15 min | user |

## Shapes

**AuthUser** (signup/login): `{ _id, name, avatar, username, email, college, year, branch, bio, skills[], projects[{name,link}], roadmap, isSenior, mediaItems[], following[id], followers[id], sentRequests[id], pendingRequests[id], termsAcceptedAt: ISO|null, createdAt }`

**Me** (`GET /users/me`): all user fields **except** `password`, `pushTokens` and `tokenVersion`. Includes `email`, `blockedUsers[id]`, `termsAcceptedAt`, `followingCount`, `followerCount`, and `following`/`pendingRequests` populated as `{ _id, name, year, branch, skills, college, avatar }`.

**PublicUser** (`GET /users/:id`): profile fields **without** `email`, `password`, `blockedUsers`, `pushTokens`, `tokenVersion`, `termsAcceptedAt`, `likedPosts`, `savedPosts`, or request lists, plus `followingCount`, `followerCount`.

**UserCard** (lists): `{ _id, name, username, year, branch, bio, skills, projects, college, avatar, isSenior, followingCount, followerCount, isFollowing, requestSent, isContributor }`

**Post**:
```
{ _id, type: 'social'|'placement'|'qa'|'project'|'study'|'confession', text, tags[], link, imageUrl,
  youtubeUrl, youtubeId, pdfUrl, pdfName, pdfSize, isAnonymous, college, createdAt, expiresAt|null,
  postedBy: { _id, name, year, branch, avatar, isContributor, [username, college] } | null,   // null when anonymous
  likes: [userId],        // anonymous posts: the author's id is removed
  likeCount: number,      // real total — use this for display
  likedByMe?: boolean,    // present when a token was sent
  replyCount, replies: [Reply] }
```
**Reply**: `{ _id, text, createdAt, postedBy: { _id, name, year, branch, avatar } | null, isAuthor?: true, isMine?: true }`.
On anonymous posts, replies by the author have `postedBy: null` and `isAuthor: true`. Show them as **"Anonymous (author)"**, not clickable. `isMine: true` appears only for the author's own view (to show a delete button).

Anonymity rule for clients: never try to identify anonymous authors, and never send ids of anonymous authors anywhere. The API never reveals them.

## Auth & account

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/auth/signup` | – | `{ name, email, password (≥8), college, year?, branch?, skills?, projects?, roadmap?, acceptTerms: true }` | 201 `{ token, user: AuthUser }` | 400 missing field, invalid email, short password, `acceptTerms` not `true`, email taken; 429 |
| POST | `/auth/login` | – | `{ email, password }` | 200 `{ token, user: AuthUser }` | 400 `Invalid email or password`; 429 |
| POST | `/auth/logout-all` | ✓ | – | 200 `{ message, token }` — **replace the stored token**; every other session gets 401; all push tokens are cleared (register this device again) | 401 |
| POST | `/auth/change-password` | ✓ | `{ currentPassword, newPassword (8–128) }` | 200 `{ message, token }` — replace the stored token; other devices logged out; push tokens cleared | 400 wrong current / too short / same as current; 429 |
| POST | `/auth/forgot-password` | – | `{ email }` | 200 `{ message }` — **identical for unknown emails**; the link goes to `https://themeetnet.com/reset-password?token=…` (a deep link into the app) | 429 |
| POST | `/auth/reset-password` | – | `{ token, newPassword (8–128) }` | 200 `{ message }` — user must log in again; all sessions and push tokens revoked | 400 invalid/expired/used link or bad password; 429 |
| POST | `/users/me/accept-terms` | ✓ | – | 200 `{ termsAcceptedAt }` | 401 |
| DELETE | `/users/me` | ✓ | `{ password }` | **204**, account and all its data permanently deleted; then clear the token | 400 `Incorrect password`; 429 |

Accounts created before terms existed have `termsAcceptedAt: null`: prompt them once and call `accept-terms`.

## Push notifications

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/users/me/push-token` | ✓ | `{ token: ExponentPushToken[…], platform: 'ios'|'android', deviceId }` | 200 `{ ok: true }`. Upserts by `deviceId` and keeps at most 10 devices; a token already used by another account is moved here. | 400 invalid token / platform / deviceId |
| DELETE | `/users/me/push-token` | ✓ | `{ deviceId }` (or `?deviceId=`) | 200 `{ ok: true }` — call **before** clearing the token on logout | 400 |

Register after login, after `logout-all`/`change-password` (they clear tokens), and whenever Expo gives a new token. `deviceId`: a stable per-install id (e.g. a random id stored in SecureStore).

**Payload** sent by the server: `title: 'MeetNet'`, `body: <message>`, `data: { type, postId: string|null, senderId, url }`.
`url` is `/post/<postId>` or `/profile/<senderId>`, the same paths as the web app and deep links.
Push types: `connection_request`, `connection_accepted`, `post_replied`, `post_liked`, `interested`. `new_post` is in-app only.

## Posts

| Method | Path | Auth | Body / query | Success | Errors |
|---|---|---|---|---|---|
| GET | `/posts` | ✓ | `?type=&page=1&limit=20` (college feed), `&global=true`, `&connections=true` (following; never includes anonymous posts) | 200 `Post[]` (college/global feed: last 5 replies each) | 401 |
| GET | `/posts/:id` | optional | – | 200 `Post` (with a token: block-filtered, `likedByMe`) | 400 bad id; 404 missing, expired or hidden |
| POST | `/posts` | ✓ | `{ type, text (5–1000), tags?[≤5], link?, imageUrl?, youtubeUrl?, pdfUrl?, pdfName?, pdfSize?, isAnonymous?, todayOnly? }` | 201 `Post` | 400 |
| POST | `/posts/upload-image` | ✓ | multipart `image` | 200 `{ url }` | 400, 500 |
| POST | `/posts/upload-pdf` | ✓ | multipart `pdf` | 200 `{ url, name, size }` | 400, 500 |
| PUT | `/posts/:id/like` | ✓ | – | 200 `{ liked, count, likeCount, likes }` (toggle) | 404 |
| PUT | `/posts/:id/save` | ✓ | – | 200 `{ saved }` (toggle) | 404 |
| DELETE | `/posts/:id` | ✓ | – | 200 `{ message }` | 403 not yours, 404 |
| POST | `/posts/:id/replies` | ✓ | `{ text (≤350) }` | 201 `Reply` | 400 empty or longer than 350 (`Reply too long`), 404 |
| DELETE | `/posts/:id/replies/:replyId` | ✓ | – | 200 `{ message }` | 403, 404 |
| POST | `/posts/:id/interested` | ✓ | – (project posts) | 200 `{ message }` | 400 not a project post, 404 |
| POST | `/posts/:id/report` | ✓ | `{ reason, note? }` | 200 `{ message }` | 400 invalid reason / already reported, 404 |
| POST | `/posts/:id/replies/:replyId/report` | ✓ | `{ reason, note? }` | 200 `{ message }` | 400 invalid reason / own reply / already reported, 404 |

`reason` ∈ `spam | hate | harassment | misinformation | other`; `note` ≤ 300 characters.

## Users

| Method | Path | Auth | Body / query | Success | Errors |
|---|---|---|---|---|---|
| GET | `/users/me` | ✓ | – | 200 `Me` | 401 |
| PUT | `/users/me` | ✓ | any of `{ name, bio, year, branch, skills, projects, roadmap, youtubeUrl, mediaItems, username }` | 200 `Me` | 400 |
| POST | `/users/me/avatar` · `/users/me/cover` | ✓ | multipart `image` | 200 `{ avatar | coverImage, user: Me }` | 400 |
| GET | `/users/me/posts` | ✓ | `?page&limit` | 200 `Post[]` | |
| GET | `/users/me/saved` | ✓ | – | 200 `Post[]` (max 20) | |
| GET | `/users/me/blocked` | ✓ | – | 200 `[{ _id, name, username, avatar }]` | |
| GET | `/users` | ✓ | `?search=&skill=&page=` (same college) | 200 `UserCard[]` | |
| GET | `/users/all` | ✓ | `?search=&skill=&page=` (all colleges) | 200 `UserCard[]` | |
| GET | `/users/suggestions` | ✓ | – | 200 `UserCard[]` (max 20) | |
| GET | `/users/requests` · `/users/following` · `/users/followers` | ✓ | – | 200 user list (`{ _id, name, year, branch, skills, college, bio, avatar }`) | |
| GET | `/users/:id` | ✓ | – | 200 `PublicUser` | 404 missing or blocked either way |
| GET | `/users/:id/posts` | ✓ | – | 200 `Post[]` (named posts only) | 404 blocked |
| GET | `/users/:id/following` · `/users/:id/followers` | ✓ | – | 200 user list (blocked users removed) | 404 blocked |
| POST | `/users/:id/connect` | ✓ | – | 200 `{ message }` (follow request) | 400 self / already, 403 blocked, 404 |
| POST | `/users/:id/accept` · `/reject` · `/unfollow` | ✓ | – | 200 `{ message }` | 400, 404 |
| POST | `/users/:id/block` | ✓ | – | 200 `{ message, blocked: true }` — also removes follows/requests both ways | 400 self, 404 |
| POST | `/users/:id/unblock` | ✓ | – | 200 `{ message, blocked: false }` | 404 bad id |
| POST | `/users/:id/report` | ✓ | `{ reason, note? }` | 200 `{ message }` | 400 invalid / self / already reported, 404 |

**Blocking** hides the other person's profile, named posts, replies, follow requests and notifications, in both directions. Anonymous posts are hidden only from people their author blocked; a viewer blocking someone never hides that person's anonymous posts, so blocking can't be used to find out who wrote one.

## Notifications

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/notifications?page=1&limit=25` | ✓ | 200 `[{ _id, type, message, read, createdAt, sender: { _id, name, year, branch, college, avatar }, post: { _id, type, text } | null }]` — blocked senders excluded |
| GET | `/notifications/unread-count` | ✓ | 200 `{ count }` |
| PUT | `/notifications/mark-read` | ✓ | 200 `{ success: true }` |
| PUT | `/notifications/:id/read` | ✓ | 200 `{ message }` |

## App config

`GET /app/config` — public, `Cache-Control: public, max-age=60`. Call it on launch and on resume.
```
{ minVersion:    { ios, android },        // below this: force-update screen
  latestVersion: { ios, android },        // below this: optional "update available"
  storeUrl:      { ios, android },
  features:      { confessionsEnabled: { ios, android }, pdfUploads },
  maintenance:   { enabled, message } }   // enabled: show message, block the app
```
Versions are `x.y.z` strings. Every field is always present.

## Deep links (Universal Links / App Links)

`https://themeetnet.com/post/<id>`, `/profile/<id>`, `/reset-password?token=…` (also `www.`, which redirects to the apex).
Verification files: `https://themeetnet.com/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`.

## Web pages the app links to

`https://themeetnet.com/terms`, `/privacy`, `/community-guidelines`, `/delete-account`, `/forgot-password`.
