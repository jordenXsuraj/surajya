import { Link } from 'react-router-dom'
import DocPage from '../components/DocPage'
import { SUPPORT_EMAIL } from '../config/legal'

// TODO(owner): placeholder text — review and adapt to how you moderate.
export default function CommunityGuidelines() {
  return (
    <DocPage title="Community Guidelines" updated>
      <div className="doc-todo">TODO (owner): draft text. Adjust to your moderation process before launch.</div>

      <p>MeetNet is for students helping and meeting each other. Be the kind of person you'd want in your classroom.</p>

      <h2 className="doc-h2">Not allowed — zero tolerance</h2>
      <ul>
        <li>Harassment, bullying, threats, or encouraging anyone to harm themselves</li>
        <li>Hate speech or attacks on people for caste, religion, gender, sexuality, disability, region or ethnicity</li>
        <li>Sexual content, nudity, or content that sexualises anyone</li>
        <li>Sharing someone's private information (phone number, address, photos) without consent</li>
        <li>Naming or targeting real people in anonymous posts or confessions</li>
        <li>Impersonating another person, college or organisation</li>
        <li>Spam, scams, paid promotion and fake engagement</li>
        <li>Anything illegal, including drugs, weapons and exam cheating services</li>
      </ul>

      <h2 className="doc-h2">Anonymous posts and confessions</h2>
      <p>Anonymity is for honesty, not for hurting people. The same rules apply, and MeetNet can see who wrote an anonymous post when it is reported.</p>

      <h2 className="doc-h2">Report and block</h2>
      <p>Use <strong>Report</strong> on any post, reply or profile, and <strong>Block</strong> to stop someone from seeing your profile, following you or notifying you. Reports are reviewed within 24 hours.</p>

      <h2 className="doc-h2">What happens when rules are broken</h2>
      <p>Content is removed and accounts are suspended or banned, depending on how serious the violation is. Serious cases may be reported to the authorities.</p>

      <p>Questions or appeals: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also the <Link to="/terms">Terms of Use</Link>.</p>
    </DocPage>
  )
}
