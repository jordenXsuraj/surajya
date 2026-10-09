// LOCAL ONLY: fills the local dev database (meetnet_local in Docker Mongo) with the test accounts
// the Maestro flows and the phone checks use. Safe to run again: it only creates what is missing
// and puts the profile people's details and the relations between seed accounts back to
// seed-data.mjs. Talks only to the local API (localhost:5000) and the Docker database.
//
//   node .maestro/seed.mjs
//
// Creates, if missing:
// - the tester (tester@meetnet.local) and the three feed authors from Prompt 3 with ~120 posts;
// - eight profile people (seed-p-<key>@example.com, password seedpass123) with photos uploaded
//   through the API (stored in server/uploads), bios, skills, projects, media and a few posts.
// Then sets the tester's profile and every follow / request / block between seed accounts.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BASE_PEOPLE, PROFILE_PEOPLE, SEED_COLLEGE, SEED_PASSWORD, TESTER, TESTER_PROFILE, relationsScript,
} from './seed-data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:5000/api';
const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(HERE, '..', '..', 'server', 'uploads');
const LOCAL_UPLOAD = /^http:\/\/(localhost|127\.0\.0\.1):5000\/uploads\/images\/([\w.-]+)$/;

const mongo = (js) => {
  const out = String(execFileSync('docker', ['exec', 'meetnet-mongo', 'mongosh', 'meetnet_local', '--quiet', '--eval', js])).trim();
  return out ? JSON.parse(out) : null;
};
const q = (v) => JSON.stringify(v);

async function api(method, route, body, token) {
  const res = await fetch(API + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${data?.message ?? ''}`);
  return data;
}

const login = async (email, password) => (await api('POST', '/auth/login', { email, password })).token;

/** Signs up when the account does not exist yet; always marks it verified and long-standing. */
async function ensureAccount({ email, password, name, year, branch }, { oldAccount = true } = {}) {
  let user = mongo(`print(JSON.stringify(db.users.findOne({ email: ${q(email)} }, { _id: 1 })))`);
  if (!user) {
    await api('POST', '/auth/signup', { name, email, password, college: SEED_COLLEGE, year, branch, acceptTerms: true });
    user = mongo(`print(JSON.stringify(db.users.findOne({ email: ${q(email)} }, { _id: 1 })))`);
    console.log(`created ${name}`);
  }
  mongo(`db.users.updateOne({ _id: ObjectId(${q(user._id)}) }, { $set: { emailVerified: true, emailVerifiedAt: new Date('2020-01-02'),
    ${oldAccount ? "createdAt: new Date('2020-01-01')," : ''} } }); print('true')`);
  return String(user._id);
}

/** Downloads a picsum photo and uploads it as the user's avatar or cover (local disk only). */
async function uploadPhoto(token, kind, picsumId) {
  const size = kind === 'avatar' ? '600/600' : '1500/500';
  const img = await fetch(`https://picsum.photos/id/${picsumId}/${size}.jpg`);
  if (!img.ok) throw new Error(`picsum ${picsumId} → ${img.status}`);
  const form = new FormData();
  form.append('image', new Blob([await img.arrayBuffer()], { type: 'image/jpeg' }), `${kind}.jpg`);
  const res = await fetch(`${API}/users/me/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`upload ${kind} → ${res.status} ${data?.message ?? ''}`);
  const url = kind === 'avatar' ? data.avatar : data.coverImage;
  if (!LOCAL_UPLOAD.test(url)) throw new Error(`upload went somewhere else than local disk: ${url}`);
  return url;
}

const fileExists = (url) => {
  const m = LOCAL_UPLOAD.exec(url || '');
  return !!m && existsSync(path.join(UPLOAD_DIR, 'images', m[2]));
};

// ── 0. local API is up ─────────────────────────────────
const health = await fetch('http://localhost:5000/healthz').catch(() => null);
if (!health?.ok) throw new Error('local API is not running on localhost:5000');

// ── 1. tester ──────────────────────────────────────────
const ids = {};
ids.tester = await ensureAccount({ ...TESTER, year: TESTER_PROFILE.year, branch: TESTER_PROFILE.branch }, { oldAccount: false });

// ── 2. Prompt 3 feed authors and their posts ──────────
const base = mongo(`print(JSON.stringify(Object.fromEntries(db.users.find({ college: ${q(SEED_COLLEGE)}, email: /^seed-[0-2]-/ })
  .toArray().map(u => [u.name, String(u._id)]))))`);
const baseTokens = {};
for (const [i, person] of BASE_PEOPLE.entries()) {
  if (base[person.name]) { ids[person.key] = base[person.name]; continue; }
  ids[person.key] = await ensureAccount({ ...person, email: `seed-${i}-base@example.com`, password: SEED_PASSWORD });
  baseTokens[person.key] = await login(`seed-${i}-base@example.com`, SEED_PASSWORD);
}
if (Object.keys(baseTokens).length) await seedFeed();

// ── 3. profile people ──────────────────────────────────
for (const p of PROFILE_PEOPLE) {
  const email = `seed-p-${p.key}@example.com`;
  ids[p.key] = await ensureAccount({ ...p, email, password: SEED_PASSWORD });
  const token = await login(email, SEED_PASSWORD);
  const { username, bio, skills, projects, roadmap, mediaItems, name, year, branch } = p;
  await api('PUT', '/users/me', { name, year, branch, username, bio, skills, projects, roadmap, mediaItems }, token);
  mongo(`db.users.updateOne({ _id: ObjectId(${q(ids[p.key])}) }, { $set: { isContributor: ${!!p.contributor} },
    $push: { mediaItems: { $each: ${q(p.legacyMedia ?? [])}.map(m => ({ ...m, addedAt: new Date() })) } } }); print('true')`);

  const doc = mongo(`print(JSON.stringify(db.users.findOne({ _id: ObjectId(${q(ids[p.key])}) }, { avatar: 1, coverImage: 1 })))`);
  if (p.avatar && !fileExists(doc.avatar)) await uploadPhoto(token, 'avatar', p.avatar);
  if (p.cover && !fileExists(doc.coverImage)) await uploadPhoto(token, 'cover', p.cover);
  if (!p.avatar) mongo(`db.users.updateOne({ _id: ObjectId(${q(ids[p.key])}) }, { $set: { avatar: '', coverImage: '' } }); print('true')`);

  const posts = mongo(`print(db.posts.countDocuments({ postedBy: ObjectId(${q(ids[p.key])}) }))`);
  if (posts === 0 && p.posts.length) {
    const created = [];
    for (const post of p.posts) created.push((await api('POST', '/posts', post, token))._id);
    // 12+ days old, so they never outrank the Prompt 3/4 fixture posts in the feeds
    mongo(`${q(created)}.forEach((id, i) => db.posts.updateOne({ _id: ObjectId(id) },
      { $set: { createdAt: new Date(Date.now() - (12 + i * 2) * 86400000 - ${PROFILE_PEOPLE.indexOf(p)} * 3600000) } })); print('true')`);
  }
}

// ── 4. tester's profile and all relations ─────────────
await api('PUT', '/users/me', TESTER_PROFILE, await login(TESTER.email, TESTER.password));
mongo(relationsScript(ids));

const summary = mongo(`print(JSON.stringify(db.users.find({ _id: { $in: ${q(Object.values(ids))}.map(id => ObjectId(id)) } }).toArray().map(u => ({
  name: u.name, photo: !!u.avatar, cover: !!u.coverImage, skills: u.skills.length, media: (u.mediaItems || []).length,
  following: u.following.length, followers: u.followers.length, requestsIn: u.pendingRequests.length,
  requestsOut: u.sentRequests.length, blocked: u.blockedUsers.length }))))`);
console.table(summary);
console.log('seed done (local database only)');

// Prompt 3 feed: ~120 varied posts by Riya, Kabir and Sneha over the last 10 days
async function seedFeed() {
  const authors = BASE_PEOPLE.map((p) => ({ ...p, token: baseTokens[p.key] })).filter((p) => p.token);
  const IMAGES = ['https://picsum.photos/id/1011/1200/800', 'https://picsum.photos/id/1025/800/1200',
    'https://picsum.photos/id/1043/1200/1200', 'https://picsum.photos/id/1050/1600/900', 'https://picsum.photos/id/1062/900/1400'];
  const YOUTUBE = ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'https://youtu.be/ScMzIvxBSi4', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'];
  const PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  const LONG = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: notes from the DSA session — arrays, two pointers and sliding window.`).join('\n');
  const types = ['social', 'placement', 'qa', 'study', 'project', 'confession'];
  const texts = {
    social: ['Hackathon this Saturday at the main auditorium! 🚀', 'Who is coming to the cultural fest tonight?', 'Free pizza at the library steps 🍕'],
    placement: ['TCS NQT tips: practise aptitude daily, 30 min.', 'Interview experience at Infosys — 3 rounds, all DSA.', 'Internship openings at a Pune startup, DM me.'],
    qa: ['How do I start with competitive programming?', 'Best resources for DBMS before the exam?', 'Is the 4th-year project mandatory in a team?'],
    study: ['Sharing my OS notes (unit 1–3).', 'Previous year question papers for CN.', 'DSA sheet that helped me crack placements.'],
    project: ['Looking for a React Native dev for our app idea.', 'Need 2 teammates for Smart India Hackathon.', 'Building an IoT plant monitor, anyone interested?'],
    confession: ['I still have no idea what my branch is about.', 'I skipped every 8 AM lecture this semester.', 'I am scared of the placement season.'],
  };
  const created = [];
  for (let i = 0; i < 120; i++) {
    const type = types[i % types.length];
    const author = authors[i % authors.length];
    const post = await api('POST', '/posts', {
      type,
      text: i % 17 === 0 ? LONG : `${texts[type][i % 3]} (#${i + 1})`,
      tags: i % 4 === 0 ? ['campus', type] : [],
      isAnonymous: type === 'confession' || i % 23 === 0,
      todayOnly: i % 19 === 0,
      ...(i % 9 === 0 && i % 13 !== 7 ? { imageUrl: IMAGES[i % IMAGES.length] } : {}),
      ...(i % 13 === 7 ? { youtubeUrl: YOUTUBE[i % YOUTUBE.length] } : {}),
      ...(i % 21 === 5 ? { pdfUrl: PDF, pdfName: 'OS unit 1 notes.pdf', pdfSize: 13264 } : {}),
      ...(i % 11 === 3 ? { link: 'github.com/expo/expo' } : {}),
    }, author.token);
    created.push(post._id);
    if (i % 5 === 0) {
      for (const other of authors.filter((u) => u !== author).slice(0, 1 + (i % 3))) {
        await api('POST', `/posts/${post._id}/replies`, { text: `Reply from ${other.name.split(' ')[0]} on #${i + 1}` }, other.token);
      }
    }
  }
  mongo(`${q(created)}.forEach((id, i) => db.posts.updateOne({ _id: ObjectId(id) },
    { $set: { createdAt: new Date(Date.now() - i * 2 * 3600 * 1000) } })); print('true')`);
  console.log(`seeded ${created.length} feed posts`);
}
