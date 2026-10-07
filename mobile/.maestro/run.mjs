// Runs the Maestro checks for Prompts 3 and 4 against the LOCAL stack on an Android emulator (never
// on someone's phone) and checks every step in the local database and in server/uploads, not only
// on screen.
//
//   node .maestro/run.mjs                        (from mobile/) all steps on emulator-5554
//   node .maestro/run.mjs --only p4-05,p4-06     some steps; --only p3 / p4 for a group
//   ANDROID_SERIAL=emulator-5556 node .maestro/run.mjs   another emulator
//
// Needs: the device with MeetNet Dev installed, Metro on 8081, the local API on 5000 WITHOUT
// Cloudinary (uploads go to server/uploads), Docker Mongo `meetnet-mongo` (db meetnet_local), the
// seed accounts and the test files in the device's Download folder (README.md).
// Report: .maestro/reports/<run>/report.md (+ screenshots of failures).
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '../../server');
const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || join(SERVER, 'uploads');
const API = 'http://127.0.0.1:5000/api';
const TESTER = { email: 'tester@meetnet.local', password: 'MeetNet-Test-2026' };
const SEED_PASSWORD = 'seedpass123';
const YT_ID = 'dQw4w9WgXcQ';
// Red pixels (quarter-size frames) the heart adds to the middle of the image: ~6000 at full size,
// a few hundred while it pops in; nothing else there is red
const HEART_MIN = 400;

const RUN = `mt${Date.now().toString(36)}`;
const REPORT_DIR = join(HERE, 'reports', RUN);
mkdirSync(REPORT_DIR, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? process.argv[process.argv.indexOf('--only') + 1] ?? '')
  .replace('--only=', '')
  .split(',')
  .filter((s) => /^p\d/.test(s));

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const expect = (cond, message) => { if (!cond) throw new Error(message); };

// ── device ────────────────────────────────────────────────────────────────────────────────────
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
const listDevices = () => run('adb', ['devices']).split(/\r?\n/).slice(1).map((l) => l.trim().split(/\s+/)).filter((d) => d[0]);

// The run owns adb: the adb server is restarted so that it sees emulators only (no USB devices at
// all) and restarted normally when the run ends. Maestro refuses every device while any attached
// device is unauthorized, even with --device, and a phone on USB can turn unauthorized mid-run
// (screen locked). Every adb call still names the emulator (-s), every Maestro call --device.
let adbLimited = false;
function adbServer(emulatorsOnly) {
  spawnSync('adb', ['kill-server']);
  // --one-device with a serial no USB device has: the server connects to no USB device (needs the
  // libusb backend on Windows)
  if (emulatorsOnly) spawnSync('adb', ['--one-device', 'emulators-only', 'start-server'], { env: { ...process.env, ADB_LIBUSB: '1' } });
  else spawnSync('adb', ['start-server']);
  adbLimited = emulatorsOnly;
}
// Normal adb server again; a server restart drops the emulator's reverse ports (Metro, local API),
// so they are set up again for using the emulator by hand afterwards
function restoreAdb() {
  if (!adbLimited) return;
  adbServer(false);
  if (!SERIAL) return;
  spawnSync('adb', ['-s', SERIAL, 'wait-for-device'], { timeout: 30_000 });
  for (const port of ['tcp:8081', 'tcp:5000']) spawnSync('adb', ['-s', SERIAL, 'reverse', port, port]);
}
process.on('exit', restoreAdb);
process.on('SIGINT', () => process.exit(130));

const attached = listDevices();
const wanted = process.env.ANDROID_SERIAL;
if (wanted && !wanted.startsWith('emulator-')) {
  console.error(`ANDROID_SERIAL=${wanted} is not an emulator: these checks only run on an emulator.`);
  process.exit(2);
}
adbServer(true);
let SERIAL = '';
for (let i = 0; i < 60 && !SERIAL; i++) { // the emulator reconnects to the new server within seconds
  const ready = listDevices().filter((d) => d[1] === 'device').map((d) => d[0]);
  SERIAL = wanted ? (ready.includes(wanted) ? wanted : '') : ready.includes('emulator-5554') ? 'emulator-5554' : ready.find((s) => s.startsWith('emulator-')) ?? '';
  if (!SERIAL) execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);
}
if (!SERIAL) {
  console.error(`No emulator to run on (attached: ${attached.map((d) => d.join(' ')).join(', ') || 'none'}). Start the emulator${wanted ? '' : ' or set ANDROID_SERIAL'}.`);
  process.exit(2);
}
const others = attached.filter((d) => d[0] !== SERIAL);
if (others.length) {
  console.warn(`⚠️  Other devices attached, ignored: ${others.map((d) => `${d[0]} (${d[1]})`).join(', ')}. adb sees only emulators during the run (restored afterwards); running on ${SERIAL}.`);
}
const adb = (...args) => run('adb', ['-s', SERIAL, ...args]);

// Maestro is started straight through Java (maestro.bat would need cmd.exe quoting for "Q&A" etc.)
const MAESTRO_HOME = process.env.MAESTRO_HOME ?? join(homedir(), '.maestro');
const MAESTRO_ENV = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' };
function maestroArgs(flow, env, debugDir) {
  const args = ['--enable-native-access=ALL-UNNAMED', '-classpath', join(MAESTRO_HOME, 'lib', '*'), 'maestro.cli.AppKt',
    'test', '--device', SERIAL, '--debug-output', debugDir, '--flatten-debug-output'];
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(join(HERE, 'flows', flow));
  return args;
}
// Maestro now and then loses its device server while connecting ("Device server died during
// 'deviceInfo'") or its driver does not start in time, before the flow's first command: such a
// run is repeated once
function diedAtStart(r, debugDir) {
  if (r.ok) return false;
  const logFile = join(debugDir, 'maestro.log');
  const text = r.output + (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
  return /Device server died during 'deviceInfo'|Android driver did not start up in time/.test(text);
}
function maestro(flow, env, debugDir) {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync('java', maestroArgs(flow, env, debugDir), { encoding: 'utf8', cwd: HERE, timeout: 15 * 60_000, env: MAESTRO_ENV });
    const result = { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    if (attempt > 1 || !diedAtStart(result, debugDir)) return result;
    log(`  ${flow}: Maestro lost the device while connecting, trying once more`);
  }
}

// First line Maestro marks as failed (and the reason it printed), on one line for the report
function maestroError(output) {
  const lines = output.split(/\r?\n/);
  const failed = lines.find((l) => /\.\.\. FAILED\s*$/.test(l));
  const reason = lines.find((l) => /Assertion is false|Element not found|Parsing Failed|DeviceServerDied|Device server died|Exception/.test(l));
  return [failed, reason].filter(Boolean).map((l) => l.trim()).join(' — ').replace(/\|/g, '/')
    || output.trim().split(/\r?\n/).slice(-2).join(' ');
}

// Same as maestro(), without blocking: lets the runner watch the screen while a flow runs
async function maestroAsync(flow, env, debugDir) {
  const once = () => new Promise((resolveRun) => {
    let output = '';
    const child = spawn('java', maestroArgs(flow, env, debugDir), { cwd: HERE, env: MAESTRO_ENV });
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolveRun({ ok: code === 0, output }));
  });
  const first = await once();
  if (!diedAtStart(first, debugDir)) return first;
  log(`  ${flow}: Maestro lost the device while connecting, trying once more`);
  return once();
}

// One raw screen frame (RGBA, no PNG decoding needed): { width, height, top: 0, header, data }
function rawFrame() {
  return new Promise((resolveFrame, reject) => {
    execFile('adb', ['-s', SERIAL, 'exec-out', 'screencap'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, buf) => {
      if (err) return reject(err);
      const width = buf.readUInt32LE(0), height = buf.readUInt32LE(4);
      const header = buf.length - width * height * 4; // 12 or 16 bytes depending on Android version
      resolveFrame({ width, height, top: 0, header, data: buf.subarray(header) });
    });
  });
}
// White pixels: the fixture image's centre square (grows when the image viewer zooms in)
function whitePixels({ data }) {
  let n = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) n++;
  return n;
}
// Where the fixture image (blue 30/80/200) is on screen: { x0, y0, x1, y1 } in pixels, or null.
// Only rows that are mostly blue count, so blue-ish text (avatar initials) does not widen the box.
function blueBox({ width, height, data }) {
  const blue = (i) => Math.abs(data[i] - 30) < 30 && Math.abs(data[i + 1] - 80) < 30 && Math.abs(data[i + 2] - 200) < 30;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 2) {
    const xs = [];
    for (let x = 0; x < width; x += 4) if (blue((y * width + x) * 4)) xs.push(x);
    if (xs.length < width / 4 * 0.4) continue;
    x0 = Math.min(x0, xs[0]); x1 = Math.max(x1, xs.at(-1)); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 - x0 > 200 && y1 - y0 > 200 ? { x0, y0, x1, y1 } : null;
}
// Is the toast (.toast-msg) on this quarter-size RGB frame? A #222 box almost as wide as the screen
// (nothing else in the app is #222; text boxes are #1c1c1c), at least 12 rows high.
function toastBoxIn({ width, height, data }) {
  let run = 0;
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (Math.abs(data[i] - 34) < 4 && Math.abs(data[i + 1] - 34) < 4 && Math.abs(data[i + 2] - 34) < 4) n++;
    }
    run = n > width * 0.6 ? run + 1 : 0;
    if (run >= 12) return true;
  }
  return false;
}

// Has Maestro started the flow's command labelled "… [watch]"? (its log has "<label> RUNNING")
function watchStarted(logFile, state) {
  if (!existsSync(logFile)) return false;
  const size = statSync(logFile).size;
  if (size < state.offset) state.offset = 0; // a retried run starts the log again
  if (size === state.offset) return false;
  const fd = openSync(logFile, 'r');
  const buf = Buffer.alloc(size - state.offset);
  readSync(fd, buf, 0, buf.length, state.offset);
  closeSync(fd);
  state.offset = size;
  return /\[watch\] RUNNING\s*$/m.test(buf.toString('utf8'));
}

// Records every frame the screen shows (screenrecord's raw RGB frames at a quarter of the screen
// size: no video decoder needed, and unlike screencap it misses no frame) and hands each one to
// onFrame as it streams in. Returns stop(), which ends the recording and resolves to the frame count.
function recordFrames(full, onFrame, seconds = 60) {
  const w = full.width / 4, h = full.height / 4, size = w * h * 3;
  const child = spawn('adb', ['-s', SERIAL, 'exec-out', `screenrecord --output-format=raw-frames --size ${w}x${h} --time-limit ${seconds} -`]);
  let pending = Buffer.alloc(0), frames = 0;
  child.stdout.on('data', (d) => {
    pending = Buffer.concat([pending, d]);
    while (pending.length >= size) {
      onFrame({ width: w, height: h, data: pending.subarray(0, size) });
      frames++;
      pending = pending.subarray(size);
    }
  });
  const closed = new Promise((r) => child.on('close', r));
  return async () => { child.kill(); await closed; return frames; };
}
// The most red pixels seen in the middle of the fixture image (quarter-size RGB frames)
function redInQuarter({ width, data }, box) {
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * width + x) * 3;
      if (data[i] > 100 && data[i] - data[i + 2] > 60) n++;
    }
  }
  return n;
}
// Runs a flow and records every frame from its command labelled "… [watch]" until 2 s after the
// flow ends; onFrame gets each quarter-size frame. Only from there: watching a whole flow keeps
// the emulator busy enough to slow the app down.
async function recordWatch(flow, env, debugDir, full, onFrame) {
  let done = false;
  const runPromise = maestroAsync(flow, env, debugDir).then((r) => { done = true; return r; });
  const logFile = join(debugDir, 'maestro.log'), logState = { offset: 0 };
  let marked = false;
  while (!done && !(marked = watchStarted(logFile, logState))) await sleep(250);
  if (!marked && !watchStarted(logFile, logState)) return { ...(await runPromise), frames: 0 }; // never got there
  const stop = recordFrames(full, onFrame);
  const m = await runPromise;
  await sleep(2000);
  return { ...m, frames: await stop() };
}
// The double-tap heart: most red pixels seen in the middle of the fixture image (on screen ~0.7 s)
async function watchForRed(flow, env, debugDir) {
  const first = await rawFrame();
  const image = blueBox(first);
  if (!image) throw new Error('fixture image not on screen');
  // the heart pops in the middle of the image: count only the middle 60 % (quarter-size pixels)
  const w = image.x1 - image.x0, h = image.y1 - image.y0;
  const q = (v) => Math.round(v / 4);
  const box = { x0: q(image.x0 + w * 0.2), x1: q(image.x1 - w * 0.2), y0: q(image.y0 + h * 0.2), y1: q(image.y1 - h * 0.2) };
  let before = null, peak = 0;
  const m = await recordWatch(flow, env, debugDir, first, (f) => {
    const n = redInQuarter(f, box);
    if (before === null) before = n; // the first frame: the screen as the double-tap starts
    peak = Math.max(peak, n);
  });
  return { ...m, peak, before: before ?? 0 };
}
// Toasts (on screen for 2.6 s): which ones the app showed comes from logcat (development builds log
// "[toast] <type> <message>"), and the recording shows whether a toast box really was on screen
async function watchForToast(flow, env, debugDir) {
  const full = await rawFrame();
  spawnSync('adb', ['-s', SERIAL, 'logcat', '-c']);
  let visible = false, last = null;
  const m = await recordWatch(flow, env, debugDir, full, (f) => {
    if (!visible && toastBoxIn(f)) visible = true;
    last = f;
  });
  const shown = run('adb', ['-s', SERIAL, 'logcat', '-d', '-s', 'ReactNativeJS:I'], { maxBuffer: 64 * 1024 * 1024 })
    .split(/\r?\n/).map((l) => l.match(/\[toast\] (\w+) (.*)$/)).filter(Boolean).map(([, type, message]) => ({ type, message }));
  mkdirSync(debugDir, { recursive: true });
  writeFileSync(join(debugDir, 'toasts.json'), JSON.stringify({ shown, visible, frames: m.frames }));
  if (!visible && last) writeFileSync(join(debugDir, 'last-recorded-frame.png'), framePng(last)); // copied to the report on failure
  return { ...m, toasts: shown.map((t) => t.type), messages: shown.map((t) => t.message), visible };
}

// Fixture image without image libraries: blue with a white square in the middle
// (red is free for the heart; zooming in makes the white area grow)
function fixturePng(width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const white = Math.abs(x - width / 2) < width / 10 && Math.abs(y - height / 2) < width / 10;
      row.set(white ? [255, 255, 255] : [30, 80, 200], 1 + x * 3);
    }
    rows.push(row);
  }
  return encodePng(width, height, Buffer.concat(rows), 2);
}
// PNG from filtered rows (each row: a 0 filter byte, then the pixels); colorType 2 = RGB, 6 = RGBA
function encodePng(width, height, raw, colorType) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, colorType, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A quarter-size RGB frame as PNG, for the report
function framePng({ width, height, data }) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    data.copy(row, 1, y * width * 3, (y + 1) * width * 3);
    rows.push(row);
  }
  return encodePng(width, height, Buffer.concat(rows), 2);
}

// Network loss for the app: airplane mode AND no route to the local API (adb reverse goes over
// the adb connection, which airplane mode does not cut). Metro (8081) stays so the dev client runs.
function network(online) {
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', online ? 'disable' : 'enable');
  if (online) adb('reverse', 'tcp:5000', 'tcp:5000');
  else spawnSync('adb', ['-s', SERIAL, 'reverse', '--remove', 'tcp:5000']);
}

// Fast flings for long lists (Maestro's own scroll reads the whole screen after every swipe)
async function fling(times) {
  for (let i = 0; i < times; i++) {
    adb('shell', 'input', 'swipe', '540', '1900', '540', '400', '60');
    await sleep(800); // lets the next page load
  }
}

// ── database and uploaded files ───────────────────────────────────────────────────────────────
const mongo = (js) => {
  const out = run('docker', ['exec', 'meetnet-mongo', 'mongosh', 'meetnet_local', '--quiet', '--eval', js]);
  return out ? JSON.parse(out) : null;
};
const q = (v) => JSON.stringify(v);

async function api(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.message ?? ''}`);
  return data;
}

const ctx = {};
const postByText = (text) => mongo(`
  const p = db.posts.findOne({ text: ${q(text)} });
  print(p ? JSON.stringify({ ...p, _id: String(p._id), postedBy: String(p.postedBy),
    likes: (p.likes || []).map(String), replies: (p.replies || []).map(r => ({ text: r.text, postedBy: String(r.postedBy) })) }) : 'null');`);
const testerDoc = () => mongo(`
  const u = db.users.findOne({ email: ${q(TESTER.email)} });
  print(JSON.stringify({ savedPosts: (u.savedPosts || []).map(String), blockedUsers: (u.blockedUsers || []).map(String) }));`);
const testerPostCount = () => mongo(`print(db.posts.countDocuments({ postedBy: ObjectId(${q(ctx.testerId)}) }))`);

// http://localhost:5000/uploads/<images|pdfs>/<file> → the file in server/uploads
function uploadedFile(url) {
  const m = String(url).match(/^https?:\/\/(?:localhost|127\.0\.0\.1):5000\/uploads\/(images|pdfs)\/([\w.-]+)$/);
  if (!m) throw new Error(`not a local upload: ${url}`);
  const file = join(UPLOAD_DIR, m[1], m[2]);
  expect(existsSync(file), `file missing on disk: ${m[1]}/${m[2]}`);
  return { file, name: `${m[1]}/${m[2]}` };
}
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
function uploadsSince(since, folder) {
  const dir = join(UPLOAD_DIR, folder);
  // the run's own image fixture (uploaded by setup, maybe moments before the first step) never counts
  return existsSync(dir) ? readdirSync(dir).filter((f) => f !== ctx.fixtureImageFile && statSync(join(dir, f)).mtime >= since) : [];
}

async function expectPost(text, checks = {}) {
  const p = postByText(`Maestro ${RUN} ${text}`);
  expect(p, `no post "${text}" in the database`);
  expect(p.postedBy === ctx.testerId, 'post is not by the tester');
  for (const [k, v] of Object.entries(checks)) {
    expect(JSON.stringify(p[k]) === JSON.stringify(v), `${k} is ${JSON.stringify(p[k])}, expected ${JSON.stringify(v)}`);
  }
  return p;
}
function expectPhoto(p) {
  expect(p.imageUrl, 'post has no imageUrl');
  expect(!p.youtubeUrl, 'post also has a YouTube link');
  const { file, name } = uploadedFile(p.imageUrl);
  const buf = readFileSync(file);
  const size = jpegSize(buf);
  expect(size, 'stored file is not a JPEG (the app should send JPEG, HEIC included)');
  expect(size.width <= 1200, `stored ${size.width}px wide, expected ≤ 1200`);
  expect(buf.length < 5 * 1024 * 1024, `stored ${buf.length} bytes, expected < 5 MB`);
  return `${name}: JPEG ${size.width}×${size.height}, ${(buf.length / 1024).toFixed(0)} KB`;
}
const noPost = (text) => () => {
  expect(!postByText(`Maestro ${RUN} ${text}`), `a post "${text}" was created`);
  return 'no post created';
};

// ── steps ─────────────────────────────────────────────────────────────────────────────────────
const TYPES = [
  { id: 'placement', re: 'Placement. .*', ph: 'Share placement experience.*' },
  { id: 'qa', re: 'Q&A. .*', ph: 'Ask your question.*' },
  { id: 'study', re: 'Study Material. .*', ph: 'Share notes, PDF link.*' },
  { id: 'project', re: 'Project / Need Partner. .*', ph: 'Describe your project.*' },
  { id: 'social', re: 'Social. .*', ph: 'Share a useful tip.*' },
];

const POSTED = [{ type: 'success', text: 'Posted!' }];

const STEPS = [
  { id: 'p3-01', title: 'Login (signed out → Home)', flow: 'p3-01-login.yaml' },
  { id: 'p3-02', title: 'Home feed scrolls to the end', flow: 'p3-02-feed-scroll.yaml',
    prepare: 'p3-02-prepare.yaml', before: () => fling(60),
    verify: () => `${mongo(`print(db.posts.countDocuments({ college: 'Seed Test College', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }))`)} posts in the tester's college feed` },
  { id: 'p3-03', title: 'Following tab: followed people only', flow: 'p3-03-following.yaml' },
  { id: 'p3-04', title: 'Like', flow: 'p3-04-like.yaml',
    verify: () => { expect(postByText(ctx.fixtureText).likes.includes(ctx.testerId), 'tester not in likes'); return 'likes contains the tester'; } },
  { id: 'p3-05', title: 'Unlike', flow: 'p3-05-unlike.yaml', needs: 'p3-04',
    verify: () => { expect(!postByText(ctx.fixtureText).likes.includes(ctx.testerId), 'tester still in likes'); return 'tester removed from likes'; } },
  { id: 'p3-06', title: 'Reply', flow: 'p3-06-reply.yaml',
    verify: () => {
      const r = postByText(ctx.fixtureText).replies.find((x) => x.text === `Maestro ${RUN} reply`);
      expect(r && r.postedBy === ctx.testerId, 'reply not saved'); return 'reply saved by the tester';
    } },
  { id: 'p3-07', title: 'Save from ⋯ menu', flow: 'p3-07-save.yaml', toasts: [{ type: 'success', text: 'Saved!' }],
    verify: () => { expect(testerDoc().savedPosts.includes(ctx.fixtureId), 'not in savedPosts'); return 'post in savedPosts'; } },
  { id: 'p3-08', title: 'Report (spam)', flow: 'p3-08-report.yaml',
    verify: () => {
      const n = mongo(`print(db.reports.countDocuments({ post: ObjectId(${q(ctx.fixtureId)}), reportedBy: ObjectId(${q(ctx.testerId)}), reason: 'spam' }))`);
      expect(n === 1, `${n} matching reports`); return 'one spam report by the tester';
    } },
  { id: 'p3-09', title: 'Block author (Sneha)', flow: 'p3-09-block.yaml', toasts: [{ type: 'success', text: 'Sneha blocked' }],
    verify: () => { expect(testerDoc().blockedUsers.includes(ctx.snehaId), 'Sneha not in blockedUsers'); return 'Sneha in blockedUsers'; } },
  { id: 'p3-10', title: 'Delete own post', flow: 'p3-10-delete.yaml', toasts: [{ type: 'success', text: 'Deleted' }],
    verify: () => { expect(!postByText(ctx.ownText), 'post still exists'); return 'post removed'; } },
  { id: 'p3-11', title: 'Double-tap like: heart animates on Home', flow: 'p3-11-heart-tap.yaml',
    prepare: 'p3-11-heart-home.yaml', watchRed: true,
    verify: () => {
      expect(postByText(ctx.imageText).likes.includes(ctx.testerId), 'double-tap did not like the post');
      expect(ctx.heartPeak - ctx.heartBefore > HEART_MIN, `no heart on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels over ${ctx.heartFrames} frames)`);
      return `liked; heart seen on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels)`;
    } },
  { id: 'p3-12', title: 'Double-tap heart animates on the post screen (pushed)', flow: 'p3-11-heart-tap.yaml',
    // not liked before the post screen opens, so the database shows whether the double-tap counted
    beforePrepare: () => mongo(`print(db.posts.updateOne({ _id: ObjectId(${q(ctx.imagePostId)}) }, { $pull: { likes: ObjectId(${q(ctx.testerId)}) } }).modifiedCount)`),
    prepare: 'p3-12-heart-post.yaml', watchRed: true,
    verify: () => {
      expect(postByText(ctx.imageText).likes.includes(ctx.testerId), 'the double-tap did not like the post (not recognised as a double-tap)');
      expect(ctx.heartPeak - ctx.heartBefore > HEART_MIN, `liked, but no heart on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels over ${ctx.heartFrames} frames)`);
      return `liked; heart seen on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels)`;
    } },
  { id: 'p3-13', title: 'Image viewer (Modal): double-tap zooms in', flow: 'p3-13-viewer-zoom.yaml',
    prepare: 'p3-13-viewer-open.yaml',
    before: async () => { ctx.whiteBefore = whitePixels(await rawFrame()); },
    after: async () => { await sleep(600); ctx.whiteAfter = whitePixels(await rawFrame()); },
    verify: () => {
      const ratio = ctx.whiteAfter / Math.max(1, ctx.whiteBefore);
      expect(ratio > 2, `white area ${ctx.whiteBefore} → ${ctx.whiteAfter} (×${ratio.toFixed(1)}), expected the zoom to grow it`);
      return `white square ${ctx.whiteBefore} → ${ctx.whiteAfter} pixels (×${ratio.toFixed(1)})`;
    } },

  ...TYPES.map((t, i) => ({
    id: `p4-01${String.fromCharCode(97 + i)}`, title: `Compose: ${t.id} post`, flow: 'p4-01-compose-type.yaml', toasts: POSTED,
    env: { TYPE_RE: t.re, PLACEHOLDER_RE: t.ph, TYPE_WORD: t.id },
    verify: async () => { await expectPost(`${t.id} post`, { type: t.id, isAnonymous: false }); return `type ${t.id}, named`; },
  })),
  { id: 'p4-02', title: 'Confession is anonymous (form + feed)', flow: 'p4-02-confession.yaml', toasts: POSTED,
    verify: async () => { await expectPost('confession post', { type: 'confession', isAnonymous: true }); return 'type confession, isAnonymous true'; } },
  { id: 'p4-03', title: 'Anonymous + Today Only', flow: 'p4-03-anon-today.yaml', toasts: POSTED,
    verify: async () => {
      const p = await expectPost('anonymous today post', { type: 'social', isAnonymous: true });
      const h = (new Date(p.expiresAt) - new Date(p.createdAt)) / 3600e3;
      expect(Math.abs(h - 24) < 0.1, `expires after ${h.toFixed(2)} h`); return `isAnonymous true, expires after ${h.toFixed(1)} h`;
    } },
  { id: 'p4-04', title: 'Text limits (5 min, 1000 max)', prepare: 'p4-04-text-limits.yaml', flow: 'p4-04-text-max.yaml',
    // 1100 characters into the focused text box with adb, 100 at a time: Maestro's inputText times
    // out on that many, and one long adb call types faster than the text box keeps up (keys dropped)
    before: async () => {
      ctx.count = testerPostCount();
      for (let i = 0; i < 11; i++) { adb('shell', 'input', 'text', 'x'.repeat(100)); await sleep(400); }
    },
    verify: () => { expect(testerPostCount() === ctx.count, 'a post was created'); return 'nothing posted'; } },
  { id: 'p4-05', title: 'HEIC photo upload', flow: 'p4-05-photo-heic.yaml', toasts: POSTED,
    verify: async () => expectPhoto(await expectPost('heic photo post')) },
  { id: 'p4-06', title: '12 MB photo upload', flow: 'p4-06-photo-12mb.yaml', toasts: POSTED,
    verify: async () => expectPhoto(await expectPost('12mb photo post')) },
  { id: 'p4-07', title: 'Image XOR YouTube', flow: 'p4-07-image-xor-youtube.yaml',
    toasts: [{ type: 'info', text: 'Remove image first' }, { type: 'info', text: 'Remove YouTube video first' }], verify: noPost('xor check') },
  { id: 'p4-08', title: '11 MB PDF refused', flow: 'p4-08-pdf-too-big.yaml', toasts: [{ type: 'error', text: 'PDF must be under 10 MB' }],
    verify: (start) => { const n = uploadsSince(start, 'pdfs').length; expect(n === 0, `${n} PDF uploads`); return 'no PDF uploaded'; } },
  { id: 'p4-09', title: 'Small PDF upload', flow: 'p4-09-pdf-small.yaml', toasts: POSTED,
    verify: async () => {
      const p = await expectPost('pdf post', { pdfName: 'meetnet-test-notes.pdf', pdfSize: 38981 });
      const { file, name } = uploadedFile(p.pdfUrl);
      const buf = readFileSync(file);
      expect(buf.length === 38981 && buf.subarray(0, 5).toString() === '%PDF-', 'stored PDF differs from the test file');
      return `${name}: ${buf.length} bytes, same as the test file`;
    } },
  { id: 'p4-10', title: 'YouTube: channel refused, Shorts posted', flow: 'p4-10-youtube-shorts.yaml', toasts: POSTED,
    verify: async () => { await expectPost('shorts post', { youtubeId: YT_ID, youtubeUrl: `https://youtube.com/shorts/${YT_ID}?feature=share` }); return `youtubeId ${YT_ID}`; } },
  { id: 'p4-11', title: 'Link + tags rules', flow: 'p4-11-link-tags.yaml', toasts: POSTED,
    verify: async () => { await expectPost('link tags post', { link: 'https://github.com/test', tags: ['DSA', 'placement', 'TCS', 'a', 'b'] }); return 'link https://github.com/test, 5 clean tags'; } },
  { id: 'p4-12', title: 'Discard dialog (✕ and Android back)', flow: 'p4-12-discard.yaml', verify: noPost('discard test') },
  { id: 'p4-13', title: 'Draft restored after the app is killed', flow: 'p4-13-draft-restore.yaml',
    toasts: [{ type: 'info', text: 'Draft restored' }],
    verify: noPost('draft text') },
  { id: 'p4-14', title: 'Photo upload with network lost', flow: 'p4-14-upload-offline.yaml',
    before: () => network(false), after: () => network(true),
    verify: (start) => {
      noPost('offline upload post')();
      const n = uploadsSince(start, 'images').length;
      expect(n === 0, `${n} images reached the server`); return 'nothing uploaded, nothing posted';
    } },
  { id: 'p4-15', title: 'Retry upload when network is back, then post', flow: 'p4-15-upload-retry.yaml', toasts: POSTED, needs: 'p4-14',
    verify: async () => expectPhoto(await expectPost('offline upload post')) },
  { id: 'p4-16', title: 'Post with network lost keeps the input', flow: 'p4-16-post-offline.yaml', toasts: [{ type: 'error', text: 'No internet connection' }],
    before: () => network(false), after: () => network(true), verify: noPost('offline post') },
  { id: 'p4-17', title: 'Post again when network is back', flow: 'p4-17-post-retry.yaml', toasts: POSTED, needs: 'p4-16',
    verify: async () => { await expectPost('offline post', { type: 'social' }); return 'post saved'; } },
  { id: 'p4-18', title: 'Attachment chips all on screen; Link and Tags tappable (360 dp)', flow: 'p4-18-attachments-visible.yaml',
    before: () => { ctx.count = testerPostCount(); },
    verify: () => { expect(testerPostCount() === ctx.count, 'a post was created'); return 'Tags and Link fields opened; nothing posted'; } },
];

// ── setup ─────────────────────────────────────────────────────────────────────────────────────
// Can Maestro reach the emulator? ("Device … was requested, but it is not connected" when adb lists
// an unauthorized device; the emulators-only adb server above prevents that)
function maestroReachesDevice() {
  const r = spawnSync('java', ['--enable-native-access=ALL-UNNAMED', '-classpath', join(MAESTRO_HOME, 'lib', '*'),
    'maestro.cli.AppKt', '--device', SERIAL, 'hierarchy'], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
  });
  return r.status === 0 && !/not connected/i.test(`${r.stdout}${r.stderr}`);
}

function preflight() {
  if (maestroReachesDevice()) return;
  log(`Maestro cannot reach ${SERIAL}; restarting the (emulators-only) adb server once`);
  adbServer(true);
  spawnSync('adb', ['-s', SERIAL, 'wait-for-device'], { timeout: 60_000 });
  if (maestroReachesDevice()) return;
  const usb = listDevices().filter((d) => !d[0].startsWith('emulator-'));
  throw new Error(usb.length
    ? `Maestro cannot reach ${SERIAL}: adb still lists ${usb.map((d) => `${d[0]} (${d[1]})`).join(', ')} — this adb has no libusb backend; unplug the device.`
    : `Maestro cannot reach ${SERIAL}.`);
}

// App crashes and "not responding" the device recorded ("2026-10-06 19:31:42 data_app_native_crash"):
// listed in the report, so a cold start that open-app.yaml retried is not hidden
const appProblems = () => run('adb', ['-s', SERIAL, 'shell', 'dumpsys', 'dropbox'], { maxBuffer: 16 * 1024 * 1024 })
  .split(/\r?\n/).map((l) => l.trim().match(/^(\S+ \S+) (data_app_(?:native_crash|crash|anr))\b/)).filter(Boolean).map((m) => `${m[1]} ${m[2]}`);
let problemsBefore = [];

async function setup() {
  preflight();
  problemsBefore = appProblems();
  adb('reverse', 'tcp:5000', 'tcp:5000');
  adb('reverse', 'tcp:8081', 'tcp:8081');
  network(true);
  expect((await fetch('http://127.0.0.1:5000/healthz')).ok, 'local API not running on 5000');
  expect((await (await fetch('http://127.0.0.1:8081/status')).text()).includes('running'), 'Metro not running on 8081');

  const seed = mongo(`print(JSON.stringify(Object.fromEntries(db.users.find({ email: /^seed-[02]-/ }).toArray().map(u => [u.name, { id: String(u._id), email: u.email }]))))`);
  const riya = seed['Riya Deshmukh'], sneha = seed['Sneha Kulkarni'];
  expect(riya && sneha, 'seed users Riya / Sneha missing');
  ctx.snehaId = sneha.id;

  const me = await api('POST', '/auth/login', TESTER);
  ctx.testerId = String(me.user?._id ?? me.user?.id);
  // Uploads must go to local disk: a 1×1 probe through the API, removed again
  const fd = new FormData();
  fd.append('image', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005000157a0c5e10000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'probe.png');
  const probe = await (await fetch(`${API}/posts/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${me.token}` }, body: fd })).json();
  const { file: probeFile } = uploadedFile(probe.url); // throws for a Cloudinary URL
  execFileSync(process.execPath, ['-e', `require('fs').unlinkSync(${q(probeFile)})`]);

  // Leftovers from earlier runs: unblock Sneha, forget saved posts, remove Maestro posts
  await api('POST', `/users/${sneha.id}/unblock`, {}, me.token).catch(() => {});
  mongo(`
    db.users.updateOne({ _id: ObjectId(${q(ctx.testerId)}) }, { $set: { savedPosts: [] } });
    const old = db.posts.find({ text: /^Maestro / }, { _id: 1 }).toArray().map(p => p._id);
    db.reports.deleteMany({ post: { $in: old } });
    print(JSON.stringify(db.posts.deleteMany({ _id: { $in: old } }).deletedCount));`);

  // Fixtures: Riya's post (like/reply/save/report), Sneha's post (block), the tester's own (delete)
  const riyaToken = (await api('POST', '/auth/login', { email: riya.email, password: SEED_PASSWORD })).token;
  const snehaToken = (await api('POST', '/auth/login', { email: sneha.email, password: SEED_PASSWORD })).token;
  ctx.fixtureText = `Maestro ${RUN} fixture post`;
  ctx.ownText = `Maestro ${RUN} delete fixture`;
  ctx.fixtureId = (await api('POST', '/posts', { type: 'social', text: ctx.fixtureText }, riyaToken))._id;
  ctx.blockPostId = (await api('POST', '/posts', { type: 'social', text: `Maestro ${RUN} block fixture` }, snehaToken))._id;
  ctx.ownPostId = (await api('POST', '/posts', { type: 'qa', text: ctx.ownText }, me.token))._id;
  // Riya's post with a solid blue image (double-tap heart checks look for red over blue)
  const img = new FormData();
  img.append('image', new Blob([fixturePng(600, 400)], { type: 'image/png' }), 'fixture.png');
  const { url: imageUrl } = await (await fetch(`${API}/posts/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${riyaToken}` }, body: img })).json();
  ctx.fixtureImageFile = uploadedFile(imageUrl).name.split('/').pop();
  ctx.imageText = `Maestro ${RUN} image fixture`;
  ctx.imagePostId = (await api('POST', '/posts', { type: 'social', text: ctx.imageText, imageUrl }, riyaToken))._id;
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────
const results = [];
const startedAt = new Date();
try {
  await setup();
  log(`run ${RUN} on ${SERIAL}: setup done, uploads go to ${UPLOAD_DIR}`);
  for (const step of STEPS) {
    if (only.length && !only.some((o) => step.id.startsWith(o))) continue;
    const r = { id: step.id, title: step.title, flow: step.flow };
    results.push(r);
    if (step.needs && results.find((x) => x.id === step.needs)?.result !== 'PASS') { r.result = 'SKIPPED'; r.details = `needs ${step.needs}`; log(step.id, 'SKIPPED'); continue; }
    const debugDir = join(REPORT_DIR, 'debug', step.id);
    const expectedToasts = step.toasts ?? [];
    const start = new Date(Date.now() - 2000);
    const t0 = Date.now();
    const flowEnv = {
      EMAIL: TESTER.email, PASSWORD: TESTER.password, RUN,
      POST_ID: ctx.fixtureId, BLOCK_POST_ID: ctx.blockPostId, OWN_POST_ID: ctx.ownPostId,
      IMAGE_POST_ID: ctx.imagePostId, ...step.env,
    };
    try {
      await step.beforePrepare?.();
      if (step.prepare) {
        const p = maestro(step.prepare, flowEnv, join(debugDir, 'prepare'));
        if (!p.ok) throw new Error(`prepare: ${maestroError(p.output)}`);
      }
      await step.before?.();
      let m;
      if (step.watchRed) {
        m = await watchForRed(step.flow, flowEnv, debugDir);
        ctx.heartPeak = m.peak; ctx.heartBefore = m.before; ctx.heartFrames = m.frames;
        // what the screen showed right after the double-tap (kept with the report if the step fails)
        mkdirSync(debugDir, { recursive: true });
        writeFileSync(join(debugDir, 'after-double-tap.png'), execFileSync('adb', ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
      } else if (expectedToasts.length) {
        m = await watchForToast(step.flow, flowEnv, debugDir);
      } else {
        m = maestro(step.flow, flowEnv, debugDir);
      }
      r.screen = m.ok ? 'pass' : 'fail';
      if (!m.ok) r.screenError = maestroError(m.output);
      else if (expectedToasts.length) {
        // each expected toast: the first logged one of that type whose text matches
        const found = expectedToasts.map((e) => m.messages.find((msg, i) => m.toasts[i] === e.type && (!e.text || msg.includes(e.text))));
        const missing = expectedToasts.filter((_, k) => !found[k]);
        if (missing.length) {
          r.screen = 'fail';
          r.screenError = `no ${missing.map((e) => `${e.type} toast${e.text ? ` "${e.text}"` : ''}`).join(', ')} (${m.messages.length ? `shown: ${m.messages.join(' / ')}` : 'none shown'})`;
        } else if (!m.visible) {
          r.screen = 'fail';
          r.screenError = `${found.map((f) => `"${f}"`).join(', ')} shown, but no toast box was on screen (${m.frames} frames recorded)`;
        } else r.toast = found.map((f) => `"${f}"`).join(', ');
      }
    } catch (e) {
      r.screen = 'fail'; r.screenError = e.message;
    } finally {
      try { await step.after?.(); } catch (e) { r.screenError = `${r.screenError ?? ''} (restore failed: ${e.message})`; }
    }
    if (r.screen === 'pass' && step.verify) {
      await sleep(1500); // background writes (notifications etc.)
      try { r.db = await step.verify(start); r.dbOk = true; } catch (e) { r.db = e.message; r.dbOk = false; }
    }
    r.result = r.screen === 'pass' && r.dbOk !== false ? 'PASS' : 'FAIL';
    r.seconds = Math.round((Date.now() - t0) / 1000);
    if (r.result === 'FAIL' && existsSync(debugDir)) {
      const shots = readdirSync(debugDir, { recursive: true }).filter((f) => String(f).endsWith('.png'));
      r.screenshots = shots.map((f) => {
        const to = `${step.id}-${String(f).split(/[\\/]/).pop().replace(/[^\w.-]/g, '_')}`;
        copyFileSync(join(debugDir, String(f)), join(REPORT_DIR, to));
        return to;
      });
    }
    log(step.id, r.result, `${r.seconds}s`, r.screenError ?? '', r.db ?? '');
  }
} catch (e) {
  results.push({ id: 'setup', title: 'Setup', result: 'FAIL', details: e.message });
  log('setup failed:', e.message);
} finally {
  try { network(true); } catch {}
}

// ── report ────────────────────────────────────────────────────────────────────────────────────
const count = (s) => results.filter((r) => r.result === s).length;
let model = '?';
try { model = `${adb('shell', 'getprop', 'ro.product.model')}, Android ${adb('shell', 'getprop', 'ro.build.version.release')}, ${adb('shell', 'wm', 'size').replace('Physical size: ', '')}`; } catch {}
const cell = (s) => String(s ?? '–').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
let problemsDuring = [];
try { problemsDuring = appProblems().filter((p) => !problemsBefore.includes(p)); } catch {}
const lines = [
  `# Maestro run ${RUN}`,
  '',
  `${startedAt.toISOString()} · ${SERIAL} (${model}) · uploads: local disk`,
  '',
  `**${count('PASS')} passed · ${count('FAIL')} failed · ${count('SKIPPED')} skipped**`,
  '',
  `App crashes / not responding during the run: ${problemsDuring.length ? problemsDuring.join(', ') : 'none'}`,
  '',
  '| Step | Check | Result | Screen | Database / uploaded file | Time |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.result} | ${r.screen === 'fail' ? `fail: ${cell(r.screenError)}` : r.toast ? `pass, toast ${cell(r.toast)} on screen` : cell(r.screen)} | ${cell(r.db ?? r.details)} | ${r.seconds ?? '–'}s |`),
  '',
  ...results.filter((r) => r.screenshots?.length).map((r) => `- ${r.id} screenshots: ${r.screenshots.join(', ')}`),
];
writeFileSync(join(REPORT_DIR, 'report.md'), lines.join('\n') + '\n');
writeFileSync(join(REPORT_DIR, 'results.json'), JSON.stringify({ run: RUN, device: SERIAL, results }, null, 2));
log(`report: ${join(REPORT_DIR, 'report.md')}`);
process.exitCode = count('FAIL') ? 1 : 0;
