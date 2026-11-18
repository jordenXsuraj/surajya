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
        <li><strong>Direct messages:</strong> the messages and photos you send, who you talk to, when messages were delivered and read, and when you were last active (see "Direct messages" below).</li>
        <li><strong>MeetNow:</strong> the title, details, category and place name you enter (a name like "Main ground", never your GPS location), who joined, and the group chat messages. See "MeetNow is temporary" below.</li>
        <li><strong>Mobile app:</strong> a push notification token and a device identifier, if you allow notifications.</li>
        <li><strong>Technical:</strong> IP address, device/browser type and request logs, used for security and rate limiting.</li>
      </ul>

      <h2 className="doc-h2">How we use it</h2>
      <p>To run MeetNet: show your profile and posts, personalise your feed, send notifications and password-reset emails, keep the service secure, and review reports. We don't sell your data and we don't show third-party ads.</p>

      <h2 className="doc-h2">Who sees what</h2>
      <p>Other students see your public profile and named posts. Your email address is never shown to other users. Anonymous posts don't show your name to other users. People you block can't see your profile or named posts.</p>

      <h2 className="doc-h2">Direct messages</h2>
      <p>Direct messages are stored on our servers so they can be delivered to the other person and shown on each of your devices. They are <strong>not end-to-end encrypted</strong>: they travel over encrypted connections (HTTPS), but our systems can technically access them. We only look at a message when it has been reported to us, or when the law requires it.</p>
      <ul>
        <li><strong>Photos</strong> you send in a message get a long, random web address that can't be guessed. Anyone who has that exact address can open the photo, so only share photos you are comfortable with the recipient forwarding.</li>
        <li><strong>Requests:</strong> if someone you don't follow messages you, it waits in your Requests until you accept. They can send one message until then and don't learn whether you read it.</li>
        <li><strong>Seen and activity:</strong> the other person sees when you have read their messages. "Show activity status" (Profile → Account) controls whether people you message see when you are active; if you turn it off, you won't see theirs either.</li>
        <li><strong>Deleting:</strong> "Unsend" deletes a message and its photo for both people. "Delete chat" removes the conversation for you; when both people have deleted it, the messages are deleted from our servers. Deleting your account deletes all of your conversations, on both sides.</li>
        <li><strong>Reports:</strong> if someone reports one of your messages, the report keeps a copy of that message (and the link to its photo) for 90 days so our team can review it.</li>
        <li>Copies in database backups remain until those backups are deleted (within 30 days), as described for MeetNow below.</li>
      </ul>

      <h2 className="doc-h2">MeetNow is temporary</h2>
      <p>A MeetNow is visible to students of your college or to everyone, as its creator chose. Members see each other's name, photo, college, year and branch, and the chat messages. MeetNow never shares anyone's live location.</p>
      <p>A MeetNow ends when its time is up (24 hours unless the creator chose otherwise, at most 72 hours), when the creator ends it, when its last member leaves, or, for "Until I leave", when the creator leaves. When it ends, we delete it from our database: the MeetNow, its member list and every chat message. There is no archive, recycle bin or restore option, for you or for us. Deletion normally happens within a minute of the end and is enforced by the database itself even if our server is offline; from the moment it ends nobody can open it any more.</p>
      <p>Honest limits of "deleted":</p>
      <ul>
        <li><strong>Backups:</strong> a database backup made while the MeetNow existed still contains it until that backup is deleted. Manual database backups are deleted within 30 days. We keep backups only for recovery after a failure and never restore deleted MeetNows from them.</li>
        <li><strong>Database change log:</strong> our database host keeps a short internal log of recent changes for replication, which is overwritten within hours.</li>
        <li><strong>Server logs</strong> (about 7 days) record which pages were requested, including a MeetNow's ID, but not titles or messages.</li>
        <li><strong>Devices:</strong> a phone or browser that had the chat open may still show it until the page is closed or refreshed; screenshots taken by other members are outside our control.</li>
        <li><strong>Reports:</strong> if someone reports a MeetNow or one of its messages, the report keeps a copy of the reported title or message and who wrote it, so our team can review it. That copy is deleted 90 days after the report.</li>
      </ul>

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
      <p>Account data is kept until you delete your account. Direct messages are kept until they are unsent, both people delete the chat, or an account is deleted. MeetNow data is deleted when the MeetNow ends (see above); reports about MeetNows and messages after 90 days. Server request logs are kept for a short period (currently about 7 days). Password-reset links expire after 30 minutes.</p>

      <h2 className="doc-h2">Your choices and rights</h2>
      <p>You can view and edit your profile, change your password, log out of every device, and <Link to="/delete-account">delete your account</Link>, which removes your data as described on that page. You can ask us for a copy of your data or to correct it.</p>

      <h2 className="doc-h2">Age</h2>
      <p>MeetNet is only for people aged 18 and over.</p>

      <h2 className="doc-h2">Contact</h2>
      <p>Privacy questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </DocPage>
  )
}
