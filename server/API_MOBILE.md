# MeetNet API — mobile reference

Every endpoint the React Native (Expo) app uses. Source of truth: `server/routes/*.js`.
Tests: `server/tests/` (run `npm test`).

## Conventions

| Topic | Rule |
|---|---|
| Base URL | Production `https://surajya.onrender.com/api`. Local `http://<your-LAN-ip>:5000/api`. |
| Auth | `Authorization: Bearer <token>`. Tokens are JWTs valid for 30 days, payload `{ id, tv }`. Store them in SecureStore. |
| **401** | **Always means "the session is over"** (missing, expired or revoked token, or deleted user). Clear the token and show login. Wrong passwords never return 401, and neither do server problems (those are 503). |
| 400 | The request was wrong: validation error (including schema limits, e.g. reply > 350 or post > 1000 chars), wrong password, or a rejected upload. Body `{ message }` is safe to show to the user. Requests whose JSON body or query has a key starting with `$` or containing `.` are refused with 400. |
| 400 id | A malformed id in the path (anything but 24 hex characters) answers `400 { message: 'Invalid ID format' }` on **every** route that takes one (`:id`, `:replyId`, …). It is checked before the token, so it can come before a 401. A well-formed id that doesn't exist is 404. |
| 403 | Not allowed (e.g. following a user blocked either way, admin-only routes, CORS). **`{ code: 'EMAIL_NOT_VERIFIED', message }`** = this account must verify its email first: show the message with a button to the verify screen. |
| 404 | Not found, **or hidden by a block**. Treat both the same way. |
| 429 | Rate limited. Body `{ message }` (verification resend: `{ code: 'RESEND_COOLDOWN', message, retryAfterSeconds }`). Header `RateLimit: limit=…, remaining=…, reset=<seconds>` and `RateLimit-Policy`. |
| 503 | Temporary server problem, e.g. the database was unreachable while checking the token: `{ message }` + `Retry-After`. **Keep the session** and retry; never log out on 5xx. |
| Errors | Always JSON `{ message: string }`, sometimes with a machine-readable `code` (listed per endpoint). DELETE `/users/me` answers 204 with no body. |
| Text | The API's XSS filter stores `<` as `&lt;` in user text (posts, replies, names, bios…); `>`, `&` and quotes are stored as typed. Decode entities before display; never render user text as HTML. |
| Ids | MongoDB ObjectIds (24 hex characters). |
| CORS | Native requests send no `Origin` and are always allowed. |
| Uploads | `multipart/form-data`. Images: jpeg/png/webp/heic/heif, max 5 MB; HEIC/HEIF are stored as JPG. PDF: max 10 MB. Errors are 400: `{ code: 'INVALID_FILE_TYPE' }` (wrong type, or a file Cloudinary can't read), `{ code: 'FILE_TOO_LARGE' }`, or multer's `LIMIT_*` code (e.g. `LIMIT_UNEXPECTED_FILE` for a wrong field name). 500 only if Cloudinary itself fails. |
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
| `POST /auth/send-verification` | 1 / 60 s and 5 / hour per user (sent codes only), 20 / hour per IP | user / IP |
| `POST /auth/verify-email` | 30 / 15 min per user; each code allows 5 wrong tries | user |
| `PUT /users/me/email` | 5 / 15 min | user |

## Shapes

**AuthUser** (signup/login): `{ _id, name, avatar, username, email, college, year, branch, bio, skills[], projects[{name,link}], roadmap, isSenior, mediaItems[], following[id], followers[id], sentRequests[id], pendingRequests[id], termsAcceptedAt: ISO|null, emailVerified, emailBounced, verificationRequired, createdAt }`

- `emailVerified`: the address was confirmed with a code.
- `emailBounced`: mail to it bounced (webhook, optional). Ask the user to change it.
- `verificationRequired`: **true = this account is blocked** from posting, replying, following, "interested" and reporting until verified (accounts created after verification launched). Older unverified accounts have `false`: show a soft reminder only.

**Me** (`GET /users/me`): all user fields **except** `password`, `pushTokens` and `tokenVersion`. Includes `id` (same as `_id`), `isSenior`, `email`, `emailVerified`, `emailBounced`, `verificationRequired`, `blockedUsers[id]`, `termsAcceptedAt`, `followingCount`, `followerCount`, and `following`/`pendingRequests` populated as `{ _id, name, year, branch, skills, college, avatar }`.
`PUT /users/me`, `PUT /users/me/email` and the avatar/cover uploads return the same object **but with `following`/`pendingRequests` as plain ids** (not populated).

Fields added to the user model later (`username`, `coverImage`, `isContributor`, `mediaItems`) can be missing on older accounts in every shape below: treat them as optional.

**PublicUser** (`GET /users/:id`): profile fields **without** `email`, `password`, `blockedUsers`, `pushTokens`, `tokenVersion`, `termsAcceptedAt`, `likedPosts`, `savedPosts`, or request lists, plus `followingCount`, `followerCount`.

**UserCard** (`GET /users`, `/users/all`): `{ _id, name, username, year, branch, bio, skills, projects, college, avatar, isSenior, followingCount, followerCount, isFollowing, requestSent, isContributor }`. `GET /users/suggestions` returns the same fields **without `isSenior`**.

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
Lean list responses can include Mongo's `__v`; ignore it. Responses built from a saved post (`POST /posts`, `POST /posts/:id/replies`) add virtual fields to the populated author: `id`, `isSenior`, `followingCount` and `followerCount`. The counts are always 0 there, so don't display them.
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

### Email verification

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/auth/send-verification` | ✓ | – | 200 `{ message, expiresInSeconds: 600, resendAfterSeconds: 60 }` — replaces any older code | 409 `ALREADY_VERIFIED`; 429 `{ code: 'RESEND_COOLDOWN', message, retryAfterSeconds }` + `Retry-After` whenever the last code (signup, resend or email change) went out less than 60 s ago; 429 `{ message }` for the hourly limits (5 codes per user, 20 requests per IP) |
| POST | `/auth/verify-email` | ✓ | `{ code: '123456' }` | 200 `{ message, user: AuthUser }` (also when already verified) | 400 `{ code, message, attemptsLeft? }` with `code` = `INVALID_CODE` (wrong; `attemptsLeft` 4…1), `CODE_LOCKED` (5 wrong tries: request a new code; the try that locks it carries `attemptsLeft: 0`), `CODE_EXPIRED` (older than 10 min, replaced, or sent to a previous email) |
| PUT | `/users/me/email` | ✓ | `{ newEmail, password }` | 200 `{ message, token, user: Me }` — **replace the stored token**; other sessions get 401; push tokens cleared (register again); `emailVerified` becomes `false` and a code goes to the new address; the old address gets a notice | 400 invalid / same address / wrong password; 409 `EMAIL_TAKEN`; 429 |

Signup sends the first code automatically, so start the resend countdown at 60 s right after signup.
Codes are 6 digits, valid 10 minutes, and die after 5 wrong tries. Each new code (resend or email change) invalidates the previous one.
Suggested flow: after signup, open the verify screen. Allow "skip" (browsing works). On any `EMAIL_NOT_VERIFIED`, bring the user back to it.

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
| GET | `/posts/:id` | optional | – | 200 `Post` (with a token: block-filtered, `likedByMe`) | 400 `Invalid ID format`; 404 missing, expired or hidden |
| POST | `/posts` | ✓ | `{ type, text (5–1000), tags?[≤5], link?, imageUrl?, youtubeUrl?, pdfUrl?, pdfName?, pdfSize?, isAnonymous?, todayOnly? }` | 201 `Post` | 400; **403 `EMAIL_NOT_VERIFIED`** |
| POST | `/posts/upload-image` | ✓ | multipart `image` | 200 `{ url }` | 400 no file, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE` (> 5 MB); 500 Cloudinary down |
| POST | `/posts/upload-pdf` | ✓ | multipart `pdf` | 200 `{ url, name, size }` | 400 no file, `INVALID_FILE_TYPE` (not a PDF), `FILE_TOO_LARGE` (> 10 MB); 500 Cloudinary down |
| PUT | `/posts/:id/like` | ✓ | – | 200 `{ liked, count, likeCount, likes }` (toggle) | 404 |
| PUT | `/posts/:id/save` | ✓ | – | 200 `{ saved }` (toggle) | 404 |
| DELETE | `/posts/:id` | ✓ | – | 200 `{ message }` | 403 not yours, 404 |
| POST | `/posts/:id/replies` | ✓ | `{ text (≤350) }` | 201 `Reply` | 400 empty or longer than 350 (`Reply too long`), 404; **403 `EMAIL_NOT_VERIFIED`** |
| DELETE | `/posts/:id/replies/:replyId` | ✓ | – | 200 `{ message }` | 403, 404 |
| POST | `/posts/:id/interested` | ✓ | – (project posts) | 200 `{ message }` | 400 not a project post, 404; **403 `EMAIL_NOT_VERIFIED`** |
| POST | `/posts/:id/report` | ✓ | `{ reason, note? }` | 200 `{ message }` | 400 invalid reason / already reported, 404; **403 `EMAIL_NOT_VERIFIED`** |
| POST | `/posts/:id/replies/:replyId/report` | ✓ | `{ reason, note? }` | 200 `{ message }` | 400 invalid reason / own reply / already reported, 404; **403 `EMAIL_NOT_VERIFIED`** |

`reason` ∈ `spam | hate | harassment | misinformation | other`; `note` ≤ 300 characters.
Every route above with `:id` / `:replyId` also answers 400 `Invalid ID format` for a malformed id.

## Users

| Method | Path | Auth | Body / query | Success | Errors |
|---|---|---|---|---|---|
| GET | `/users/me` | ✓ | – | 200 `Me` | 401 |
| PUT | `/users/me` | ✓ | any of `{ name, bio, year, branch, skills, projects, roadmap, youtubeUrl, mediaItems, username }` | 200 `Me` (lists as ids) | 400 `{ message }`: a field of the wrong type (`name must be text`, `skills must be a list of text`, …), empty name or > 60 characters, `year` not `1st`–`4th`, project name > 60, > 30 media items, username shorter than 3 or longer than 20 after removing everything except a–z 0–9 `_` `.` (`Username too short` / `Username too long`), `Username already taken`. `bio` is cut to 250 characters. |
| POST | `/users/me/avatar` · `/users/me/cover` | ✓ | multipart `image` | 200 `{ avatar | coverImage, user: Me }` (lists as ids) | 400 no image, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE` (> 5 MB) |
| GET | `/users/me/posts` | ✓ | `?page&limit` | 200 `Post[]`: your posts, anonymous ones included; **`postedBy` is your id as a string** (not populated), `null` on anonymous posts | |
| GET | `/users/me/saved` | ✓ | – | 200 `Post[]` (max 20) | |
| GET | `/users/me/blocked` | ✓ | – | 200 `[{ _id, name, username, avatar }]` | |
| GET | `/users` | ✓ | `?search=&skill=&page=` (same college) | 200 `UserCard[]` | |
| GET | `/users/all` | ✓ | `?search=&skill=&page=` (all colleges) | 200 `UserCard[]` | |
| GET | `/users/suggestions` | ✓ | – | 200 up to 20 UserCards without `isSenior` (see Shapes) | |
| GET | `/users/requests` · `/users/following` · `/users/followers` | ✓ | – | 200 user list (`{ _id, name, year, branch, skills, college, bio, avatar }`) | |
| GET | `/users/:id` | ✓ | – | 200 `PublicUser` | 400 bad id; 404 missing or blocked either way |
| GET | `/users/:id/posts` | ✓ | – | 200 `Post[]` (named posts only) | 404 blocked |
| GET | `/users/:id/following` · `/users/:id/followers` | ✓ | – | 200 user list (blocked users removed) | 404 blocked |
| POST | `/users/:id/connect` | ✓ | – | 200 `{ message }` (follow request) | 400 self / already, 403 blocked, 404; **403 `EMAIL_NOT_VERIFIED`** |
| POST | `/users/:id/accept` | ✓ | – | 200 `{ message }` | 400 bad id / no pending request, 404 |
| POST | `/users/:id/reject` · `/unfollow` | ✓ | – | 200 `{ message }` (also when there was nothing to remove) | 400 bad id |
| POST | `/users/:id/block` | ✓ | – | 200 `{ message, blocked: true }` — also removes follows/requests both ways | 400 bad id / self, 404 |
| POST | `/users/:id/unblock` | ✓ | – | 200 `{ message, blocked: false }` | 400 bad id |
| POST | `/users/:id/report` | ✓ | `{ reason, note? }` | 200 `{ message }` | 400 invalid / self / already reported, 404; **403 `EMAIL_NOT_VERIFIED`** |

Every route above with `:id` answers 400 `Invalid ID format` for a malformed id (earlier versions answered 404 or 500).

**Blocking** hides the other person's profile, named posts, replies, follow requests and notifications, in both directions. Anonymous posts are hidden only from people their author blocked; a viewer blocking someone never hides that person's anonymous posts, so blocking can't be used to find out who wrote one.

## Notifications

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/notifications?page=1&limit=25` | ✓ | 200 `[{ _id, type, message, read, createdAt, sender: { _id, name, year, branch, college, avatar }, post: { _id, type, text } | null }]` — blocked senders excluded |
| GET | `/notifications/unread-count` | ✓ | 200 `{ count }` |
| PUT | `/notifications/mark-read` | ✓ | 200 `{ success: true }` |
| PUT | `/notifications/:id/read` | ✓ | 200 `{ message }` (also for someone else's or a missing notification); 400 bad id |

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
