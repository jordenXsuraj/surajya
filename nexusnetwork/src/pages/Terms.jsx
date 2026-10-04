import { Link } from 'react-router-dom'
import DocPage from '../components/DocPage'
import { SUPPORT_EMAIL } from '../config/legal'

// TODO(owner): placeholder text — have it reviewed before launch (operator name,
// address, governing law and jurisdiction are missing).
export default function Terms() {
  return (
    <DocPage title="Terms of Use" updated>
      <div className="doc-todo">TODO (owner): draft text. Add the legal operator name and address, governing law and jurisdiction, and have it reviewed before publishing the app.</div>

      <h2 className="doc-h2">1. Who can use MeetNet</h2>
      <p>MeetNet is a community for college students. You must be <strong>18 or older</strong> to create an account. One person, one account; the information you give at signup must be accurate.</p>

      <h2 className="doc-h2">2. Zero tolerance for objectionable content and abusive users</h2>
      <p>There is <strong>no tolerance</strong> for objectionable content or abusive behaviour on MeetNet. This includes harassment, bullying, threats, hate speech, sexual content, content that sexualises anyone, doxxing (sharing someone's private information), impersonation, spam and anything illegal. See the <Link to="/community-guidelines">Community Guidelines</Link>.</p>
      <p>We remove content that breaks these rules and suspend or permanently ban the accounts responsible, without warning when necessary.</p>

      <h2 className="doc-h2">3. Reporting and blocking</h2>
      <p>You can report any post, reply or user, and block any user. Blocked users can't see your profile or named posts, follow you or notify you. <strong>We review reports within 24 hours</strong> and act on content that breaks these terms.</p>

      <h2 className="doc-h2">4. Anonymous posts</h2>
      <p>Anonymous posts hide your name from other users. They are not anonymous to MeetNet: we can see who wrote them and act on reports about them, including removing them and banning the author.</p>

      <h2 className="doc-h2">5. Your content</h2>
      <p>You own what you post. You give MeetNet permission to store, display and distribute it within the service so it works as intended. Don't post anything you don't have the right to share.</p>

      <h2 className="doc-h2">6. Your account</h2>
      <p>Keep your password safe. You can change it, log out of every device, or <Link to="/delete-account">delete your account</Link> at any time.</p>

      <h2 className="doc-h2">7. Changes and contact</h2>
      <p>We may update these terms; we'll show the new date above and ask you to accept important changes. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      <p>See also the <Link to="/privacy">Privacy Policy</Link>.</p>
    </DocPage>
  )
}
