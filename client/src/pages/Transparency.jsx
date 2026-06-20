import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import styles from './Transparency.module.css'

// Plain axios, not the shared api client — this page is intentionally
// unauthenticated and must never attach a JWT or redirect to /login on a 401,
// since there's no session here at all.
const publicApi = axios.create({ baseURL: '/api' })

const REVIEW_LABELS = {
  not_flagged: { label: 'No anomalies detected — not flagged', tone: 'notflagged', icon: '✓' },
  pending_human_review: { label: 'Flagged — awaiting human review', tone: 'pending', icon: '⏳' },
  reviewed_cleared: { label: 'Flagged, reviewed by a human — cleared', tone: 'clear', icon: '✓' },
  reviewed_escalated: { label: 'Flagged, reviewed by a human — escalated', tone: 'escalated', icon: '↑' },
}

const STATUS_LABELS = {
  active: 'In progress — not yet submitted',
  submitted: 'Submitted and confirmed',
  flagged: 'Flagged — under review',
}

export default function Transparency() {
  const { paperHash: hashFromUrl } = useParams()
  const [hash, setHash] = useState(hashFromUrl || '')
  const [result, setResult] = useState(null) // null = nothing searched yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runLookup = async (lookupHash) => {
    const trimmed = lookupHash.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await publicApi.get(`/transparency/${trimmed}`)
      setResult(res.data)
    } catch (err) {
      if (err.response?.status === 404) {
        setResult({ found: false })
      } else {
        setError('Lookup failed — please try again in a moment')
      }
    } finally {
      setLoading(false)
    }
  }

  // If a hash arrived via a shared link (e.g. /verify/abc123), look it up
  // immediately — someone clicking a direct link shouldn't have to paste
  // anything or press a button. That's the whole "reduce friction" point.
  useEffect(() => {
    if (hashFromUrl) runLookup(hashFromUrl)
  }, [hashFromUrl])

  const lookup = (e) => {
    e.preventDefault()
    runLookup(hash)
  }

  const review = result?.found ? REVIEW_LABELS[result.reviewState] : null

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.card}>
        <div className={styles.eyebrow}>EXAMSHIELD · PUBLIC TRANSPARENCY</div>
        <h1 className={styles.headline}>Verify a paper.<br /><em>No login. No black box.</em></h1>
        <p className={styles.sub}>
          Paste a paper hash to see exactly when it was generated, submitted, and whether
          a human reviewed it. Anyone can check this — there's nothing to take our word for.
        </p>

        <form className={styles.searchRow} onSubmit={lookup}>
          <input
            type="text"
            placeholder="Paste paper hash…"
            value={hash}
            onChange={e => setHash(e.target.value)}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={loading || !hash.trim()}>
            {loading ? 'Checking…' : 'Verify'}
          </button>
        </form>
        <div className={styles.hint}>
          Your paper hash was shown once when your exam was generated. ExamShield never stores it anywhere else for you to retrieve later.
        </div>

        {error && <div className="error-msg" style={{ marginTop: 16 }}>{error}</div>}

        {result && (
          <div className={styles.resultWrap}>
            {!result.found ? (
              <div className={styles.notFound}>
                <div className={styles.notFoundIcon}>?</div>
                <div>No record found for this hash.</div>
                <div style={{ fontSize: 12 }}>Double-check it was copied exactly, with no extra spaces.</div>
              </div>
            ) : (
              <>
                <div className={`${styles.statusBanner} ${styles[review.tone]}`}>
                  <span>{review.icon}</span>
                  <span>{review.label}</span>
                </div>

                <div className={styles.facts}>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>Exam</span>
                    <span className={styles.factVal}>{result.examName}</span>
                  </div>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>Sections</span>
                    <span className={styles.factVal}>
                      {Object.entries(result.sectionCounts || {}).map(([s, n]) => `${s}: ${n}`).join(' · ')}
                    </span>
                  </div>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>Status</span>
                    <span className={styles.factVal}>{STATUS_LABELS[result.status] || result.status}</span>
                  </div>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>Generated at</span>
                    <span className={`${styles.factVal} ${styles.mono}`}>
                      {new Date(result.generatedAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>Submitted at</span>
                    <span className={`${styles.factVal} ${styles.mono}`}>
                      {result.submittedAt ? new Date(result.submittedAt).toLocaleString('en-IN') : 'Not yet submitted'}
                    </span>
                  </div>
                  <div className={styles.factRow}>
                    <span className={styles.factLabel}>Total questions</span>
                    <span className={styles.factVal}>{result.totalQuestions}</span>
                  </div>
                  {result.confirmedMarks !== null && (
                    <div className={styles.factRow}>
                      <span className={styles.factLabel}>Confirmed marks</span>
                      <span className={styles.factVal}>{result.confirmedMarks}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className={styles.constitution}>AI flags. Human decides. System executes.</div>
        <p className={styles.footer}><Link to="/login">Coordinator / Admin sign in</Link></p>
      </div>
    </div>
  )
}
