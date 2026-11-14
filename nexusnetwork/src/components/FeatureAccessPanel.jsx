import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

// Admin → "Feature access": the staff allowlist for staged features (server/config/features.js).
// Only matters while a feature's mode is `staff`; the modes themselves are Render variables.
const FEATURES = [['meetnow', 'MeetNow'], ['dm', 'Messages']]
const box = { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 14, padding: 14, marginBottom: 12 }
const input = { width: '100%', height: 42, background: '#0d0d0d', border: '1.5px solid #2a2a2a', borderRadius: 10, padding: '0 12px', color: '#f0f0f0', fontFamily: 'Outfit,sans-serif', fontSize: '.85rem', outline: 'none' }
const btn = on => ({ padding: '9px 14px', background: on ? '#a73333' : '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, color: on ? 'white' : '#aaa', fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', fontSize: '.75rem' })

export default function FeatureAccessPanel({ base, token, adminKey }) {
  const [data, setData] = useState(null)
  const [email, setEmail] = useState('')
  const [feature, setFeature] = useState('meetnow')
  const [note, setNote] = useState('')
  const headers = { Authorization: `Bearer ${token}`, 'x-admin-key': adminKey }

  const load = useCallback(() => axios.get(`${base}/app/feature-access`, { headers: { Authorization: `Bearer ${token}`, 'x-admin-key': adminKey } })
    .then(r => setData(r.data))
    .catch(() => setNote('Could not load the allowlist (check the admin key).')), [base, token, adminKey])
  useEffect(() => { load() }, [load])

  async function change(targetEmail, f, grant) {
    setNote('')
    try {
      await axios.post(`${base}/app/feature-access`, { email: targetEmail, feature: f, grant }, { headers })
      setNote(`${grant ? 'Granted' : 'Revoked'} ${f} for ${targetEmail}`)
      if (grant) setEmail('')
      load()
    } catch (err) {
      setNote(err.response?.data?.message || 'Failed')
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={box}>
        <div style={{ fontSize: '.72rem', color: '#888', marginBottom: 8 }}>Modes (Render variables FEATURE_MEETNOW / FEATURE_DM)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FEATURES.map(([id, label]) => (
            <span key={id} style={{ fontSize: '.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, border: '1px solid #2a2a2a',
              color: data?.modes?.[id] === 'on' ? '#22c55e' : data?.modes?.[id] === 'staff' ? '#f59e0b' : '#666' }}>
              {label}: {data?.modes?.[id] ?? '…'}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '.66rem', color: '#555', marginTop: 8, lineHeight: 1.5 }}>
          In <b>staff</b> mode only you and the accounts below can use a feature. Deleting an account removes it from the list.
        </div>
      </div>

      <div style={box}>
        <div style={{ fontSize: '.72rem', color: '#888', marginBottom: 8 }}>Grant access</div>
        <input style={input} type="email" placeholder="account email" value={email} onChange={e => setEmail(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {FEATURES.map(([id, label]) => <button key={id} style={btn(feature === id)} onClick={() => setFeature(id)}>{label}</button>)}
          <button style={{ ...btn(true), marginLeft: 'auto' }} disabled={!email.trim()} onClick={() => change(email.trim(), feature, true)}>Grant</button>
        </div>
        {note && <div style={{ fontSize: '.7rem', color: '#aaa', marginTop: 8 }}>{note}</div>}
      </div>

      <div style={box}>
        <div style={{ fontSize: '.72rem', color: '#888', marginBottom: 8 }}>Allowlist ({data?.accounts?.length ?? 0})</div>
        {data?.accounts?.length === 0 && <div style={{ fontSize: '.75rem', color: '#555' }}>Nobody yet.</div>}
        {data?.accounts?.map(a => (
          <div key={a._id} style={{ borderTop: '1px solid #1f1f1f', padding: '8px 0' }}>
            <div style={{ fontSize: '.8rem', color: '#ddd', fontWeight: 600 }}>{a.name}</div>
            <div style={{ fontSize: '.68rem', color: '#666', wordBreak: 'break-all' }}>{a.email}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {a.features.map(f => (
                <button key={f} style={btn(false)} onClick={() => change(a.email, f, false)}>Revoke {f}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
