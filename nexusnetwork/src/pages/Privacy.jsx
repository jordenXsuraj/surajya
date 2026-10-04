import { Link } from 'react-router-dom'
import DocPage from '../components/DocPage'
import { SUPPORT_EMAIL } from '../config/legal'

// TODO(owner): placeholder text — have it reviewed before launch (India DPDP Act
// grievance officer, operator name/address, exact retention periods).
export default function Privacy() {
  return (
    <DocPage title="Privacy Policy" updated>
      <div className="doc-todo">TODO (owner): draft text. Add the operator name and address, a grievance officer if required (India DPDP Act), confirm the retention periods, and have it reviewed.</div>

      <h2 className="doc-h2">What we collect</h2>
      <ul>
        <li><strong>Account:</strong> name, email address, password (stored only as a bcrypt hash), college, year, branch.</li>
        <li><strong>Profile and content:</strong> bio, skills, projects, media links, photos, posts, replies, likes, saves, follows, reports and blocks.</li>
        <li><strong>Mobile app:</strong> a push notification token and a device identifier, if you allow notifications.</li>
        <li><strong>Technical:</strong> IP address, device/browser type and request logs, used for security and rate limiting.</li>
      </ul>

      <h2 className="doc-h2">How we use it</h2>
      <p>To run MeetNet: show your profile and posts, personalise your feed, send notifications and password-reset emails, keep the service secure, and review reports. We don't sell your data and we don't show third-party ads.</p>

      <h2 className="doc-h2">Who sees what</h2>
      <p>Other students see your public profile and named posts. Your email address is never shown to other users. Anonymous posts don't show your name to other users. People you block can't see your profile or named posts.</p>

      <h2 className="doc-h2">Service providers (processors)</h2>
      <ul>
        <li><strong>MongoDB Atlas</strong> — database hosting</li>
        <li><strong>Render</strong> — API server hosting and server logs</li>
        <li><strong>Vercel</strong> — website hosting</li>
        <li><strong>Cloudinary</strong> — image and PDF storage</li>
        <li><strong>Expo</strong> — delivering push notifications to the mobile app</li>
        <li><strong>Resend</strong> — sending emails (password reset)</li>
      </ul>
      {/* TODO(owner): list the regions where each provider stores data */}

      <h2 className="doc-h2">How long we keep it</h2>
      <p>Account data is kept until you delete your account. Server request logs are kept for a short period (currently about 7 days). Password-reset links expire after 30 minutes.</p>

      <h2 className="doc-h2">Your choices and rights</h2>
      <p>You can view and edit your profile, change your password, log out of every device, and <Link to="/delete-account">delete your account</Link>, which removes your data as described on that page. You can ask us for a copy of your data or to correct it.</p>

      <h2 className="doc-h2">Age</h2>
      <p>MeetNet is only for people aged 18 and over.</p>

      <h2 className="doc-h2">Contact</h2>
      <p>Privacy questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </DocPage>
  )
}
