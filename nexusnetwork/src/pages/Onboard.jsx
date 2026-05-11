
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { signup, login } from '../services/api'
import { useState, useEffect, useRef } from 'react'
// ── Branch → Skills mapping ──────────────────────
const BRANCH_SKILLS = {
  'CS': [
    'React','Node.js','Python','Java','C++','DSA',
    'MongoDB','MySQL','TypeScript','Next.js','Django',
    'Flutter','Android','DevOps','ML / AI','UI / UX',
    'Figma','Firebase','Spring Boot','Git'
  ],
  'IT': [
    'React','Node.js','Python','Java','Networking',
    'Cybersecurity','Cloud (AWS)','Docker','Linux',
    'MySQL','MongoDB','PHP','Django','TypeScript',
    'Git','UI / UX','Figma','DevOps'
  ],
  'Civil': [
    'AutoCAD','STAAD Pro','Revit','SketchUp',
    'MS Project','Primavera','ETABS','SAP2000',
    'Surveying','Estimation & Costing',
    'GIS','MATLAB','Concrete Design','Steel Design'
  ],
  'Mechanical': [
    'AutoCAD','SolidWorks','CATIA','ANSYS',
    'Fusion 360','MATLAB','Pro-E','CNC Programming',
    'Thermodynamics','FEA','CAM','3D Printing',
    'PLC Programming','Hydraulics','Robotics'
  ],
  'Electrical': [
    'MATLAB','Simulink','PLC Programming','AutoCAD Electrical',
    'Circuit Design','Power Systems','SCADA',
    'Arduino','Embedded Systems','Control Systems',
    'PSPICE','Relay Protection','Transformer Design','ETAP'
  ],
  'Electronics': [
    'Arduino','Raspberry Pi','MATLAB','Embedded Systems',
    'PCB Design','VLSI','Verilog / VHDL',
    'Circuit Design','8051 / ARM','IoT',
    'Multisim','LabVIEW','Signal Processing','FPGA'
  ],
  'ENTC': [
    'Arduino','Embedded Systems','PCB Design','MATLAB',
    'Raspberry Pi','IoT','Signal Processing',
    'Verilog','8051','Communication Systems',
    'LabVIEW','VLSI','Antenna Design'
  ],
  'Chemical': [
    'MATLAB','Aspen Plus','HYSYS','AutoCAD',
    'ChemCAD','ANSYS Fluent','MS Excel (Advanced)',
    'Process Design','PFD / P&ID','Safety Engineering',
    'Python','R Programming'
  ],
  'Other': [
    'MS Office','Research','Technical Writing',
    'Data Analysis','Python','MATLAB',
    'Project Management','Communication',
    'Leadership','Teamwork','Problem Solving'
  ]
}

const BRANCHES = [
  'CS','IT','Civil','Mechanical',
  'Electrical','Electronics','ENTC','Chemical','Other'
]







// ── College list ──────────────────────────────────
// Add more colleges here as you expand.
// Format: exact official name, this is what gets saved to DB.
const COLLEGES = [
  // ── Maharashtra — Pune ───────────────────────
  'Sinhgad Academy of Engineering, Pune',
  'Sinhgad College of Engineering, Pune',
  'Sinhgad Institute of Technology, Lonavala',
  'Sinhgad Institute of Technology and Science, Pune',
  'Sinhgad Technical Education Society, Pune',
  'Smt. Kashibai Navale College of Pharmacy (SKNCOP) ',
  'Sinhgad College of Pharmacy, Vadgaon (Bk.), Pune',
  'Sinhgad Institute of Pharmacy, Narhe, Pune',
  'Sinhgad Institute of Pharmaceutical Sciences, Lonavala',

  'College of Engineering Pune (COEP)',
  'Pune Institute of Computer Technology (PICT)',
  'Vishwakarma Institute of Technology (VIT Pune)',
  'Vishwakarma Institute of Information Technology (VIIT)',
  'Cummins College of Engineering for Women, Pune',
  'MIT College of Engineering, Pune',
  'Symbiosis Institute of Technology (SIT), Pune',
  'Indira College of Engineering and Management, Pune',
  'Pimpri Chinchwad College of Engineering (PCCOE)',
  'Dr. D.Y. Patil Institute of Technology, Pune',
  'JSPM Narhe Technical Campus, Pune',
  'JSPM Imperial College of Engineering, Pune',
  'Bharati Vidyapeeth College of Engineering, Pune',
  'Army Institute of Technology (AIT), Pune',
  'Zeal College of Engineering and Research, Pune',
  'G.H. Raisoni College of Engineering, Pune',
  'Nutan Maharashtra Institute of Engineering and Technology (NMIET)',
  'Modern College of Engineering, Pune',
  'NBN Sinhgad School of Engineering, Pune',
  'Smt. Kashibai Navale College of Engineering, Pune',
  'SKN Sinhgad College of Engineering, Korti Pandharpur',
  'SKN Sinhgad Institute of Technology and Science, Lonavala',

  // ── Maharashtra — Mumbai ──────────────────────
  'Indian Institute of Technology Bombay (IIT Bombay)',
  'Veermata Jijabai Technological Institute (VJTI)',
  'K.J. Somaiya College of Engineering, Mumbai',
  'Sardar Patel College of Engineering (SPCE), Mumbai',
  'Shah and Anchor Kutchhi Engineering College, Mumbai',
  'Thadomal Shahani Engineering College, Mumbai',
  'Dwarkadas J. Sanghvi College of Engineering, Mumbai',
  'Fr. Conceicao Rodrigues College of Engineering, Mumbai',
  'University of Mumbai',
  'NMIMS Mukesh Patel School of Technology, Mumbai',

  // ── Maharashtra — Nashik / Aurangabad / Nagpur ─
  'K.K. Wagh Institute of Engineering Education and Research, Nashik',
  'Sandip Institute of Technology and Research Centre, Nashik',
  'Government College of Engineering, Aurangabad',
  'MGM College of Engineering, Aurangabad',
  'Visvesvaraya National Institute of Technology (VNIT), Nagpur',
  'Yeshwantrao Chavan College of Engineering (YCCE), Nagpur',
  'G.H. Raisoni College of Engineering, Nagpur',

  // ── Karnataka ─────────────────────────────────
  'Indian Institute of Technology Dharwad',
  'National Institute of Technology Karnataka (NITK), Surathkal',
  'R.V. College of Engineering, Bangalore',
  'M.S. Ramaiah Institute of Technology, Bangalore',
  'BMS College of Engineering, Bangalore',
  'PES University, Bangalore',
  'Dayananda Sagar College of Engineering, Bangalore',

  // ── Delhi / NCR ───────────────────────────────
  'Indian Institute of Technology Delhi (IIT Delhi)',
  'Delhi Technological University (DTU)',
  'Netaji Subhas University of Technology (NSUT)',
  'Indraprastha Institute of Information Technology Delhi (IIIT Delhi)',
  'Jamia Millia Islamia, Delhi',

  // ── Tamil Nadu ────────────────────────────────
  'Indian Institute of Technology Madras (IIT Madras)',
  'Anna University, Chennai',
  'PSG College of Technology, Coimbatore',
  'Amrita School of Engineering, Coimbatore',
  'Sri Sivasubramaniya Nadar College of Engineering, Chennai',

  // ── Other IITs / NITs ─────────────────────────
  'Indian Institute of Technology Kharagpur (IIT KGP)',
  'Indian Institute of Technology Bombay (IIT Bombay)',
  'Indian Institute of Technology Kanpur (IIT Kanpur)',
  'Indian Institute of Technology Roorkee (IIT Roorkee)',
  'Indian Institute of Technology Hyderabad (IIT Hyderabad)',
  'Indian Institute of Technology Indore (IIT Indore)',
  'National Institute of Technology Trichy (NIT Trichy)',
  'National Institute of Technology Warangal (NIT Warangal)',
  'National Institute of Technology Calicut (NIT Calicut)',

  //dyp
  'D. Y. Patil College of Engineering and Innovation, Varale, Talegaon, Pune (DYPCOEI) ',
  'Dr. D Y Patil Technical Campus , Talegaon, Pune',
  'Ajeenkya D.Y. Patil University (Lohegaon) , Pune',
  ' D.Y. Patil College of Engineering, Akurdi (DYPCOE)',
  'Dr. D.Y. Patil Institute of Technology, Pimpri (DIT)',

  'Indira College of Engineering & Management, Pune (ICEM)',
  'Marathwada Mitra Mandals College of Engineering (MMCOE), Karvenagar',
  'MM,s Institute of Management Education Research & Training (IMERT)',
  'Pimpri Chinchwad College Of Engineering (PCCOE)',
  'Pimpri Chinchwad College of Engineering and Research, Ravet(PCCoER)'
]


// ── CollegeInput component ─────────────────────────
// Drop-in replacement for your college <input> field.
// Shows suggestions when user types 2+ characters.
function CollegeInput({ value, onChange }) {
  const [suggestions, setSuggestions] = useState([])
  const [showList,    setShowList]    = useState(false)
  const [focused,     setFocused]     = useState(false)
  const wrapRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowList(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(e) {
    const val = e.target.value
    onChange(val)

    if (val.trim().length < 2) {
      setSuggestions([])
      setShowList(false)
      return
    }

    // Filter — case insensitive, matches anywhere in the name
    // So "sinh" matches "Sinhgad", "pune" matches any Pune college, etc.
    const q = val.trim().toLowerCase()
    const filtered = COLLEGES.filter(c =>
      c.toLowerCase().includes(q)
    ).slice(0, 6) // show max 6 suggestions

    setSuggestions(filtered)
    setShowList(filtered.length > 0)
  }

  function handleSelect(college) {
    onChange(college)
    setShowList(false)
    setSuggestions([])
  }

  // Highlight the matching part in the suggestion
  function highlight(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <strong style={{ color:'var(--accent)', fontWeight:700 }}>
          {text.slice(idx, idx + query.length)}
        </strong>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div ref={wrapRef} style={{ position:'relative', width:'100%' }}>
     <input
  className="ob-inp"
  placeholder="College name (e.g. Sinhgad, PICT, COEP…)"
  value={value}
  onChange={handleChange}
  onFocus={() => setFocused(true)}
  onBlur={() => setFocused(false)}
  autoComplete="off"
  spellCheck={false}
/>

      {/* Dropdown */}
      {showList && suggestions.length > 0 && (
        <div style={{
          position:        'absolute',
          top:             'calc(100% + 4px)',
          left:            0,
          right:           0,
          background:      'var(--card, #1a1a1a)',
          border:          '1px solid var(--br2, #2a2a2a)',
          borderRadius:    12,
          zIndex:          999,
          overflow:        'hidden',
          boxShadow:       '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {suggestions.map((college, i) => (
            <div
              key={i}
              onMouseDown={() => handleSelect(college)} // mousedown fires before blur
              style={{
                padding:      '11px 14px',
                fontSize:     '.85rem',
                color:        'var(--text, #fff)',
                cursor:       'pointer',
                borderBottom: i < suggestions.length - 1
                  ? '1px solid var(--br, #222)'
                  : 'none',
                lineHeight:   1.4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #222)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              🏫 {highlight(college, value.trim())}
            </div>
          ))}

          {/* If typed name not in list — allow custom entry */}
          <div style={{
            padding:    '9px 14px',
            fontSize:   '.75rem',
            color:      'var(--dim, #666)',
            background: 'var(--bg, #111)',
          }}>
            Not listed? Just type your full college name
          </div>
        </div>
      )}
    </div>
  )
}






// ── STEP 1 — Login / Signup ──────────────────────
function StepAuth({ onNext }) {
  const [mode,    setMode]    = useState('signup')
  const [form,    setForm]    = useState({
    name:'', email:'', password:'',
    college:'', year:'', branch:'CS'
  })
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  const { login: authLogin } = useAuth()
  const nav = useNavigate()

  function f(e) {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))
    setErr('')
  }

  async function submit() {


    if (loading) return


    setErr('')
    if (!form.email || !form.password) return setErr('Email and password required')
    if (mode === 'signup') {
      if (!form.name || !form.college) return setErr('All fields required')
      if (form.password.length < 6)    return setErr('Password must be 6+ characters')
      if (!/\S+@\S+\.\S+/.test(form.email)) return setErr('Enter a valid email')
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await login({email: form.email.trim().toLowerCase(), password: form.password })
        authLogin(res.data.user, res.data.token)
        nav('/home')
    /*  } else {
        onNext(form)
      }*/
     } else {
  const res = await signup({
    ...form,
    skills: [],
    projects: [],
    roadmap: ''
  })

  authLogin(res.data.user, res.data.token)
  nav('/home')
}
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

 
  return (
    <div className="ob-page">
      <div className="ob-hero">
        <div className="ob-logo">
          <span className="ob-dot" />MeetNet
        </div>
        <p className="ob-tagline">
          Your campus.<br /><strong>Connect. Post. Grow.</strong>
        </p>
        <div className="ob-chips">
          {['💼 Placement','🤫 Confession','🤝 Partner',
            '📚 Exam','🔥 Social','📰 News' ,'project'].map(c => (
            <span key={c} className="ob-chip">{c}</span>
          ))}
        </div>
      </div>

      <div className="ob-form-wrap">
        <div className="ob-toggle">
          <button
            className={mode === 'signup' ? 'on' : ''}
            onClick={() => { setMode('signup'); setErr('') }}
          >Sign Up</button>
          <button
            className={mode === 'login' ? 'on' : ''}
            onClick={() => { setMode('login'); setErr('') }}
          >Log In</button>
        </div>

        {mode === 'signup' && (
          <>
            <input className="ob-inp" name="name"
              placeholder="Enter Your Name" value={form.name} onChange={f} />

           <CollegeInput className="ob-inp" name="college"
  value={form.college}
  onChange={(val) => setForm(p => ({ ...p, college: val }))}
/>

            <div className="ob-row2">
              <select className="ob-inp" name="year" value={form.year} onChange={f}>
                <option value="">Year</option>
                {['1st','2nd','3rd','4th'].map(y => <option key={y}>{y}</option>)}
              </select>
              {/* Branch dropdown */}
              <select className="ob-inp" name="branch" value={form.branch} onChange={f}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </>
        )}

        <input className="ob-inp" name="email" type="email"
          placeholder="Enter your Email" value={form.email} onChange={f} />

        {/* Password with show/hide toggle */}
<div style={{ position:'relative', width:'100%' }}>
  <input
    className="ob-inp"
    name="password"
    type={showPass ? 'text' : 'password'}
    placeholder="Password (min 6)"
    value={form.password}
    onChange={f}
    style={{ paddingRight: 44 }}
  />
  <button
    type="button"
    onClick={() => setShowPass(p => !p)}
    style={{
      position:   'absolute',
      right:      12,
      top:        '50%',
      transform:  'translateY(-50%)',
      background: 'none',
      border:     'none',
      cursor:     'pointer',
      fontSize:   '1.1rem',
      color:      'var(--dim)',
      padding:    0,
      lineHeight: 1,
    }}
  >
    {showPass ? '🙈' : '👁️'}
  </button>
</div>

onClick={() => { setMode('signup'); setErr(''); setShowPass(false) }}
onClick={() => { setMode('login');  setErr(''); setShowPass(false) }}

        {err && <div className="ob-err">{err}</div>}

        <button className="ob-btn" onClick={submit} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'signup' ? 'Continue →' : 'Log In →'}
        </button>
        
        <p className="ob-note">Only your college. Private & safe 🔒</p>
      </div>
    </div>
  )
}

// ── STEP 2 — Build Profile ───────────────────────
function StepProfile({ authData }) {
  const branchSkills = BRANCH_SKILLS[authData.branch] || BRANCH_SKILLS['CS']

  const [skills,      setSkills]   = useState([])
  const [customSkill, setCustom]   = useState('')
  const [projName,    setProjName] = useState('')
  const [projLink,    setProjLink] = useState('')
  const [roadmap,     setRoadmap]  = useState('')
  const [loading,     setLoading]  = useState(false)
  const [err,         setErr]      = useState('')
const [showPass, setShowPass] = useState(false)


  const { login: authLogin } = useAuth()
  const nav = useNavigate()

const cleanLink = projLink.trim().slice(0, 200)


  function toggleSkill(s) {
    setSkills(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  }

function addCustom() {
  const s = customSkill.trim()
  if (!s) return
  if (skills.includes(s)) { setCustom(''); return }  // already added
  if (skills.length >= 10) return                      // max 10 skills
  setSkills(p => [...p, s])                            // ← actually add it
  setCustom('')
}

  function handleCustomKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); addCustom() }
  }

  async function finish() {
    setLoading(true)
    try {
      const res = await signup({
        ...authData,
        skills,
        //projects: projName ? [{ name: projName, link: projLink }] : [],
        projects: projName ? [{ name: projName.trim(), link: cleanLink }] : [],
        roadmap
      })
      authLogin(res.data.user, res.data.token)
      nav('/home')
    } catch (e) {
      setErr(e.response?.data?.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ob-page">
      <div className="ob-step2">

        <div className="ob-step2-header">
          <div className="ob-logo" style={{ fontSize:'1.2rem' }}>
            <span className="ob-dot" />MeetNet
          </div>
          <div className="step-badge">Step 2 of 2</div>
        </div>

        <div className="ob-step2-body">

          {/* Show which branch was selected */}
          <div className="branch-info-pill">
            🎓 {authData.branch} branch
            <span style={{ color:'var(--dim)', fontSize:'.7rem', marginLeft:4 }}>
              · showing relevant skills
            </span>
          </div>

          {/* Skills — only for this branch */}
          <h2 className="s2-title">Pick your skills ⚡</h2>
          <p className="s2-sub">Others find you by these. Select all that apply.</p>

          <div className="skill-picker">
            {/* Predefined branch skills */}
            {branchSkills.map(s => (
              <button
                key={s}
                className={`sk-chip ${skills.includes(s) ? 'on' : ''}`}
                onClick={() => toggleSkill(s)}
              >
                {skills.includes(s) ? '✓ ' : ''}{s}
              </button>
            ))}

            {/* Custom skills user added */}
            {skills.filter(s => !branchSkills.includes(s)).map(s => (
              <button
                key={s}
                className="sk-chip on sk-custom"
                onClick={() => toggleSkill(s)}
              >
                ✓ {s} ✕
              </button>
            ))}
          </div>

          {/* Custom skill add */}
          <div className="custom-skill-row">
            <input
              className="ob-inp"
              placeholder="+ Add your own skill"
              value={customSkill}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={handleCustomKey}
              style={{ marginBottom:0, flex:1 }}
            />
            <button
              className="custom-skill-add-btn"
              onClick={addCustom}
              disabled={!customSkill.trim()}
            >
              Add
            </button>
          </div>

          {/* Project */}
          <h2 className="s2-title" style={{ marginTop:22 }}>Add a project 🚀</h2>
          <p className="s2-sub">Even a small one. Others connect through your work.</p>
          <input className="ob-inp" placeholder="Project name"
            value={projName} onChange={e => setProjName(e.target.value)} />
          <input className="ob-inp" placeholder="GitHub / link (optional)"
            value={projLink} onChange={e => setProjLink(e.target.value)} />

          {/* Roadmap — PROPER MULTILINE */}
 {/*        
          <h2 className="s2-title" style={{ marginTop:22 }}>Your roadmap 📍</h2>
          <p className="s2-sub">What are you currently learning or building?</p>
          <textarea
            className="ob-textarea"
            placeholder={
              authData.branch === 'Civil'
                ? 'e.g. Learning AutoCAD, working on site survey project…\n\nTarget: internship at civil firm'
                : authData.branch === 'Mechanical'
                ? 'e.g. Learning SolidWorks, building robot arm…\n\nTarget: core mechanical placement'
                : 'e.g. Learning React, solving DSA daily…\n\nTarget: placements in 6 months'
            }
            value={roadmap}
            onChange={e => setRoadmap(e.target.value)}
          />

          {err && <div className="ob-err">{err}</div>}
          */}
        </div>

        <div className="ob-step2-foot">
          <button className="ob-btn" onClick={finish} disabled={loading}>
            {loading ? 'Creating account…' : 'Enter MeetNet🚀'}
          </button>
          <p className="ob-skip" onClick={finish}>Skip for now — fill later</p>
        </div>
      </div>
    </div>
  )
}

export default function Onboard() {
  const [step,     setStep]    = useState(1)
  const [authData, setAuthData]= useState(null)
  const { user } = useAuth()
  const nav = useNavigate()

  if (user) { nav('/home'); return null }

  if (step === 1) return <StepAuth onNext={d => { setAuthData(d); setStep(2) }} />
  return <StepProfile authData={authData} />
}