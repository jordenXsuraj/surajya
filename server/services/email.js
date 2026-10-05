// Transactional email via the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email).
//   RESEND_API_KEY  — required in production
//   EMAIL_FROM      — e.g. 'MeetNet <no-reply@themeetnet.com>' (domain must be verified in Resend)
//   EMAIL_REPLY_TO  — optional; where replies go (themeetnet.com has no inbox)
// Without a key outside production, the email is printed to the console instead.

const DEFAULT_FROM = 'MeetNet <no-reply@themeetnet.com>'

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

async function sendEmail({ to, subject, html, text, devLog }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [dev email, RESEND_API_KEY not set] to=${to} subject="${subject}"\n${devLog ?? text}`)
      return { dev: true }
    }
    // Never print the email (it may contain a reset link) in production logs
    console.error('❌ Email not sent: RESEND_API_KEY is not configured')
    return { skipped: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM, to: [to], subject, html, text,
      // themeetnet.com can't receive mail, so replies go to a real inbox when configured
      ...(process.env.EMAIL_REPLY_TO && { reply_to: process.env.EMAIL_REPLY_TO }),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

function layout({ heading, bodyHtml }) {
  return `<!doctype html>
<html><body style="margin:0;background:#0d0d0d;font-family:Helvetica,Arial,sans-serif;color:#f0f0f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#181818;border-radius:16px;padding:28px">
        <tr><td style="font-size:20px;font-weight:800;padding-bottom:18px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#a73333;margin-right:8px"></span>MeetNet
        </td></tr>
        <tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${heading}</td></tr>
        <tr><td style="font-size:15px;line-height:1.55;color:#cfcfcf">${bodyHtml}</td></tr>
      </table>
      <p style="font-size:12px;color:#666;margin-top:16px">MeetNet · themeetnet.com</p>
    </td></tr>
  </table>
</body></html>`
}

function sendPasswordReset({ to, name, link, minutes }) {
  const hello = name ? `Hi ${escapeHtml(name)},` : 'Hi,'
  const text = [
    name ? `Hi ${name},` : 'Hi,',
    '',
    'Someone asked to reset the password for your MeetNet account.',
    `Open this link within ${minutes} minutes to choose a new password:`,
    link,
    '',
    "If you didn't ask for this, ignore this email — your password won't change.",
  ].join('\n')
  const html = layout({
    heading: 'Reset your password',
    bodyHtml: `<p>${hello}</p>
      <p>Someone asked to reset the password for your MeetNet account. This link works once and expires in ${minutes} minutes.</p>
      <p style="padding:8px 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#a73333;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">Choose a new password</a></p>
      <p style="font-size:13px;color:#888;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(link)}</p>
      <p style="font-size:13px;color:#888">If you didn't ask for this, ignore this email — your password won't change.</p>`,
  })
  return sendEmail({ to, subject: 'Reset your MeetNet password', html, text, devLog: `Reset link: ${link}` })
}

function sendVerificationCode({ to, name, code, minutes }) {
  const hello = name ? `Hi ${escapeHtml(name)},` : 'Hi,'
  const text = [
    name ? `Hi ${name},` : 'Hi,',
    '',
    'Your MeetNet verification code is:',
    '',
    `    ${code}`,
    '',
    `It expires in ${minutes} minutes.`,
    '',
    "If you didn't sign up for MeetNet, ignore this email.",
  ].join('\n')
  const html = layout({
    heading: 'Verify your email',
    bodyHtml: `<p>${hello}</p>
      <p>Your MeetNet verification code is:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:10px;color:#ffffff;margin:18px 0;font-family:'Courier New',Courier,monospace">${escapeHtml(code)}</p>
      <p>It expires in ${minutes} minutes.</p>
      <p style="font-size:13px;color:#888">If you didn't sign up for MeetNet, ignore this email.</p>`,
  })
  return sendEmail({ to, subject: 'Your MeetNet verification code', html, text, devLog: `Verification code for ${to}: ${code}` })
}

// Sent to the OLD address after an email change. Best effort: the old address may bounce.
function sendEmailChangedNotice({ to, name, newEmailMasked }) {
  const hello = name ? `Hi ${escapeHtml(name)},` : 'Hi,'
  const text = [
    name ? `Hi ${name},` : 'Hi,',
    '',
    `The email address on your MeetNet account was just changed to ${newEmailMasked}.`,
    'If you made this change, you can ignore this email.',
    "If you didn't, reply to this email so we can help you recover the account.",
  ].join('\n')
  const html = layout({
    heading: 'Your email address was changed',
    bodyHtml: `<p>${hello}</p>
      <p>The email address on your MeetNet account was just changed to <strong>${escapeHtml(newEmailMasked)}</strong>.</p>
      <p>If you made this change, you can ignore this email.</p>
      <p style="font-size:13px;color:#888">If you didn't, reply to this email so we can help you recover the account.</p>`,
  })
  return sendEmail({ to, subject: 'Your MeetNet email address was changed', html, text, devLog: `Email-changed notice to ${to} (new: ${newEmailMasked})` })
}

module.exports = { sendEmail, sendPasswordReset, sendVerificationCode, sendEmailChangedNotice }
