import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './AdminRoster.module.css'

// This page is view-only. Roster entries are created automatically the
// moment a candidate self-registers (see auth.js register/verify) — there's
// no institution holding a pre-existing list to upload for an open exam like
// NEET. This dashboard exists so a coordinator can see who's registered and
// manage exam access codes, not to create entries directly.
//
// NEET is ONE exam with four sections (Physics, Chemistry, Botany, Zoology)
// — there's no per-subject scoping anywhere here. Every registered candidate
// gets one code for one exam sitting.
export default function AdminRoster() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [codesIssued, setCodesIssued] = useState(0)
  const [codesUsed, setCodesUsed] = useState(0)
  const [codeStatusFilter, setCodeStatusFilter] = useState('') // '', 'issued', 'used', 'none'
  const [loading, setLoading] = useState(true)

  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [generatingCodes, setGeneratingCodes] = useState(false)
  const [codeResult, setCodeResult] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/admin/roster')
      .then(res => {
        setEntries(res.data.entries)
        setTotal(res.data.total)
        setCodesIssued(res.data.codesIssued)
        setCodesUsed(res.data.codesUsed)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleGenerateCodes = async () => {
    if (!windowStart || !windowEnd) {
      setCodeResult({ error: 'Set both a start and end time for the exam window' })
      return
    }
    setGeneratingCodes(true)
    setCodeResult(null)
    try {
      const res = await api.post('/admin/roster/generate-codes', {
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
      })
      setCodeResult(res.data)
      load()
    } catch (err) {
      setCodeResult({ error: err.response?.data?.error || 'Code generation failed' })
    } finally {
      setGeneratingCodes(false)
    }
  }

  const codeStatus = (e) => !e.examCode ? 'none' : e.examCodeUsed ? 'used' : 'issued'
  // NOTE: this filters only the current page of entries (max 50), not the
  // full roster — fine while the roster is small, but would need a matching
  // backend query param to stay fully correct once registration scales up.
  // The stat cards above don't have this problem since they use server-side
  // aggregates.
  const visibleEntries = codeStatusFilter
    ? entries.filter(e => codeStatus(e) === codeStatusFilter)
    : entries

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Exam Roster</div>
          <div className={styles.topbarSub}>{total} self-registered candidates</div>
        </div>
        <div className={styles.content}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Total registered</div>
              <div className={styles.statVal} style={{ color: 'var(--indigo)' }}>{total}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Codes issued</div>
              <div className={styles.statVal} style={{ color: 'var(--green)' }}>{codesIssued}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Codes redeemed</div>
              <div className={styles.statVal} style={{ color: 'var(--amber)' }}>{codesUsed}</div>
            </div>
          </div>

          <div className={styles.uploadPanel}>
            <div className={styles.uploadHead}>
              <span className={styles.uploadTitle}>Generate & email exam access codes</span>
              <span className={styles.uploadHint}>Sent automatically to every registered candidate without a code yet</span>
            </div>
            <div className={styles.codeFormRow}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>WINDOW START</label>
                <input type="datetime-local" value={windowStart} onChange={e => setWindowStart(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>WINDOW END</label>
                <input type="datetime-local" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} />
              </div>
            </div>
            <p className={styles.uploadHint} style={{ marginTop: -2 }}>
              Codes only work inside this window — this is what makes them an exam-day gate, not a permanent password.
              One exam, one code per candidate — there's no subject to choose.
            </p>
            {codeResult?.error && <div className="error-msg">{codeResult.error}</div>}
            {codeResult?.success && (
              <div className={styles.actionMsg}>
                {codeResult.message} — {codeResult.emailsSent} email{codeResult.emailsSent !== 1 ? 's' : ''} sent
                {codeResult.emailFailures?.length > 0 && `, ${codeResult.emailFailures.length} failed`}
              </div>
            )}
            {codeResult?.emailFailures?.length > 0 && (
              <div className={styles.skippedList}>
                {codeResult.emailFailures.map((f, i) => (
                  <div key={i}>{f.email} (Roll {f.rollNumber}) — {f.reason}</div>
                ))}
              </div>
            )}
            <div className={styles.uploadActions}>
              <button className="btn-primary" onClick={handleGenerateCodes} disabled={generatingCodes}>
                {generatingCodes ? 'Generating & sending…' : 'Generate codes for all registered candidates'}
              </button>
            </div>
          </div>

          <div className={styles.filters}>
            {[['', 'All codes'], ['none', 'No code yet'], ['issued', 'Issued'], ['used', 'Redeemed']].map(([val, label]) => (
              <button key={val} className={`${styles.filterBtn} ${codeStatusFilter === val ? styles.filterActive : ''}`}
                onClick={() => setCodeStatusFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Name</span><span>Email</span><span>Roll No.</span><span>Registered</span><span>Exam code</span>
            </div>
            {loading ? (
              <div className={styles.empty}>Loading…</div>
            ) : visibleEntries.length === 0 ? (
              <div className={styles.empty}>No matching roster entries.</div>
            ) : visibleEntries.map(e => (
              <div key={e._id} className={styles.tableRow}>
                <span className={styles.name}>{e.name}</span>
                <span className={styles.email}>{e.email}</span>
                <span className={styles.mono}>{e.rollNumber}</span>
                <span className={styles.mono}>{new Date(e.claimedAt || e.createdAt).toLocaleString('en-IN')}</span>
                <span>
                  {codeStatus(e) === 'none' ? (
                    <span className="badge badge-amber">not issued</span>
                  ) : codeStatus(e) === 'used' ? (
                    <span className="badge badge-green">redeemed</span>
                  ) : (
                    <span className="badge badge-indigo">issued</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
