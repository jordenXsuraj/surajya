#!/usr/bin/env node
// One-off: email every user about the 2026-06-11 → 2026-10-04 data exposure.
// Prints counts only — never addresses. Stores nothing on disk.
//
//   MONGO_URI=… RESEND_API_KEY=… node scripts/sendSecurityNotice.js [options]
//
//   (default)                 dry run: recipient count + the rendered email, sends nothing
//   --test=<addr>             send ONE copy to <addr> (use your reply-to address)
//   --send                    send to everyone, in batches
//   --reply-to=<addr>         required for --test and --send
//   --exclude-domains=a,b     skip addresses at these domains (e.g. obvious typos)
//   --from-index=<n>          resume a stopped run at recipient n (0-based, same order every run)
//   --batch-size=<n>          1–100 (Resend's batch maximum), default 100
//
// Wording must match nexusnetwork/src/config/securityNotice.js (the web banner).

const crypto   = require('crypto')
const mongoose = require('mongoose')
const User     = require('../models/User')

const FROM    = 'MeetNet <no-reply@themeetnet.com>'
const SUBJECT = 'Security notice about your MeetNet account'
const RESEND  = 'https://api.resend.com'
const CAMPAIGN = 'security-notice-2026-10'
const MIN_GAP_MS = 550           // Resend allows 2 requests/second per team

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.length ? v.join('=') : true]
}))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const sleep = ms => new Promise(r => setTimeout(r, ms))
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0]
  return first && first.length <= 40 ? first : 'there'
}

function render(name) {
  const hi = `Hi ${firstName(name)},`
  const paragraphs = [
    "We're writing to tell you about two security problems on MeetNet that we have now fixed.",
    "Between 11 June and 4 October 2026, a bug let anyone who opened a post's link see the post author's " +
      'email address and password hash (bcrypt — never the actual password), and who wrote anonymous posts. ' +
      'If you never published a post, your password hash was not exposed.',
    "Separately, from May until 4 October, any logged-in member could look up other members' email addresses.",
    'We found no sign of misuse in the server logs we still have, which cover only the final week before the fix.',
    'We fixed both problems on 4 October and signed everyone out as a precaution.',
    'If you used your MeetNet password on any other site, change it there. You can change your MeetNet ' +
      'password in Profile → Account, or use Forgot password: https://themeetnet.com/forgot-password',
    "We're sorry this happened. If you have any questions, just reply to this email.",
  ]
  const text = [hi, '', ...paragraphs.flatMap(p => [p, '']), '— The MeetNet team'].join('\n')
  const html = [
    `<p>${esc(hi)}</p>`,
    ...paragraphs.map(p => `<p>${esc(p).replace('https://themeetnet.com/forgot-password',
      '<a href="https://themeetnet.com/forgot-password">https://themeetnet.com/forgot-password</a>')}</p>`),
    '<p>— The MeetNet team</p>',
  ].join('\n')
  return { subject: SUBJECT, text, html }
}

let lastRequestAt = 0
async function resendRequest(path, body, idempotencyKey) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const res = await fetch(RESEND + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, data }

    const name = data.name || ''
    if (res.status === 429 && /quota/i.test(name)) return { ok: false, quota: true, status: res.status, name }
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < 5) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt)
      continue
    }
    return { ok: false, status: res.status, name, message: data.message }
  }
}

const emailFor = (u, replyTo) => ({ from: FROM, to: [u.email], reply_to: replyTo, ...render(u.name) })

async function main() {
  const replyTo = typeof args['reply-to'] === 'string' ? args['reply-to'].trim() : ''
  const sending = Boolean(args.send || args.test)
  if (sending && !EMAIL_RE.test(replyTo)) throw new Error('--reply-to=<address> is required for --test and --send')
  if (sending && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')

  if (args.test) {
    if (!EMAIL_RE.test(String(args.test))) throw new Error('--test needs an address')
    const r = await resendRequest('/emails', emailFor({ email: String(args.test), name: args['test-name'] || '' }, replyTo))
    console.log(r.ok ? 'test copy sent to the --test address' : `test copy FAILED: HTTP ${r.status} ${r.name} ${r.message || ''}`)
    return
  }

  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set')
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 })
  const users = await User.find({}, 'name email').sort({ _id: 1 }).lean()
  await mongoose.disconnect()

  const excluded = new Set(String(args['exclude-domains'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean))
  const seen = new Set()
  const counts = { users: users.length, invalid: 0, duplicate: 0, excludedDomain: 0 }
  const recipients = []
  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { counts.invalid++; continue }
    if (seen.has(email)) { counts.duplicate++; continue }
    seen.add(email)
    if (excluded.has(email.split('@')[1])) { counts.excludedDomain++; continue }
    recipients.push({ _id: String(u._id), email, name: u.name })
  }

  console.log(`users: ${counts.users} | recipients: ${recipients.length} | skipped: invalid ${counts.invalid}, duplicate ${counts.duplicate}, excluded domains ${counts.excludedDomain}`)

  if (!args.send) {
    const sample = render('[FirstName]')   // real emails use each user's first name
    console.log(`\n--- DRY RUN: nothing sent ---\nFrom: ${FROM}\nReply-To: ${replyTo || '<--reply-to>'}\nSubject: ${sample.subject}\n\n${sample.text}\n\n--- HTML part ---\n${sample.html}`)
    return
  }

  const size = Math.min(100, Math.max(1, Number(args['batch-size']) || 100))
  const start = Math.max(0, Number(args['from-index']) || 0)
  let sent = 0, failed = 0, index = start, stopped = false
  const stop = name => { stopped = true; console.log(`STOPPED: Resend ${name} (sending quota reached). Resume later with --from-index=${index}`) }

  while (index < recipients.length && !stopped) {
    const batch = recipients.slice(index, index + size)
    const key = `${CAMPAIGN}/` + crypto.createHash('sha256').update(batch.map(u => u._id).join(',')).digest('hex').slice(0, 40)
    const r = await resendRequest('/emails/batch', batch.map(u => emailFor(u, replyTo)), key)
    if (r.quota) { stop(r.name); break }

    if (r.ok) {
      sent += batch.length
      index += batch.length
    } else if (r.status === 422 || r.status === 400) {
      // A single bad address rejects the whole batch: send this batch one by one
      for (const u of batch) {
        const one = await resendRequest('/emails', emailFor(u, replyTo), `${key}/${u._id}`)
        if (one.quota) { stop(one.name); break }
        if (one.ok) sent++; else failed++
        index++
      }
    } else {
      failed += batch.length
      index += batch.length
      console.log(`batch failed: HTTP ${r.status} ${r.name} ${r.message || ''}`)
    }
    console.log(`progress: sent ${sent}, failed ${failed}, next index ${index}`)
  }
  console.log(`${stopped ? 'PAUSED' : 'DONE'}: recipients ${recipients.length} | sent ${sent} | failed ${failed} | remaining ${recipients.length - index}${stopped ? ` | resume with --from-index=${index}` : ''}`)
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1) })
