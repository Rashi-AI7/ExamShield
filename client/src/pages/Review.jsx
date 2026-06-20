import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './Review.module.css'

export default function Review() {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const [papers, setPapers] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [message, setMessage] = useState('')

  // Load flagged list
  useEffect(() => {
    api.get('/review/flagged?limit=50')
      .then(res => {
        setPapers(res.data.papers)
        if (paperId) {
          setSelected(paperId)
        } else if (res.data.papers.length > 0) {
          setSelected(res.data.papers[0].paperId)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Load detail when selected changes
  useEffect(() => {
    if (!selected) return
    setDetail(null)
    setMessage('')
    setNote('')
    api.get(`/review/flagged/${selected}`)
      .then(res => setDetail(res.data.paper))
      .catch(console.error)
  }, [selected])

  const decide = async (decision) => {
    setDeciding(true)
    try {
      const res = await api.patch(`/review/flagged/${selected}`, { decision, note })
      setMessage(res.data.message)
      // Remove from list if cleared
      if (res.data.status === 'submitted') {
        setPapers(prev => prev.filter(p => p.paperId !== selected))
        setSelected(papers.find(p => p.paperId !== selected)?.paperId || null)
        setDetail(null)
      }
    } catch (err) {
      setMessage(err.response?.data?.error || 'Action failed')
    } finally {
      setDeciding(false)
    }
  }

  const flagIcon = (type) => {
    if (type === 'IMPOSSIBLE_TIMING') return '⏱'
    if (type === 'LAST_SECOND_CHANGES') return '🔄'
    if (type === 'IDENTICAL_ANSWER_PATTERN') return '⎘'
    return '⚑'
  }

  return (
    <div className={styles.layout}>
      <Sidebar flagCount={papers.length} />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Flag Review</div>
          <div className={styles.topbarSub}>Review evidence. You decide — the system waits.</div>
        </div>
        <div className={styles.body}>

          {/* Left — paper list */}
          <div className={styles.list}>
            {loading && <div className={styles.listEmpty}>Loading…</div>}
            {!loading && papers.length === 0 && (
              <div className={styles.listEmpty}>No flagged papers. All clear ✓</div>
            )}
            {papers.map(p => (
              <div
                key={p.paperId}
                className={`${styles.listItem} ${selected === p.paperId ? styles.listItemActive : ''} ${p.flags[0]?.severity === 'HIGH' ? styles.borderDanger : styles.borderAmber}`}
                onClick={() => setSelected(p.paperId)}
              >
                <div className={styles.listIcon}>{flagIcon(p.flags[0]?.type)}</div>
                <div className={styles.listMeta}>
                  <div className={styles.listStudent}>
                    Student {String(p.studentId).slice(-8)} · {Object.entries(p.sectionCounts || {}).map(([s, n]) => `${s.slice(0,4)}:${n}`).join(' ')}
                  </div>
                  <div className={styles.listDesc}>{p.flags[0]?.description?.slice(0, 55)}…</div>
                </div>
                <span className={`badge ${p.flags[0]?.severity === 'HIGH' ? 'badge-danger' : 'badge-amber'}`}>
                  {p.flags[0]?.severity}
                </span>
              </div>
            ))}
          </div>

          {/* Right — detail */}
          <div className={styles.detail}>
            {!detail && !message && (
              <div className={styles.detailEmpty}>Select a flagged paper to review</div>
            )}
            {message && (
              <div className={styles.successMsg}>{message}</div>
            )}
            {detail && (
              <>
                <div className={styles.detailHeader}>
                  <span className={`badge ${detail.anomalyFlags[0]?.severity === 'HIGH' ? 'badge-danger' : 'badge-amber'}`}>
                    {detail.anomalyFlags[0]?.severity} SEVERITY
                  </span>
                  <span className={styles.flagType}>{detail.anomalyFlags[0]?.type}</span>
                </div>

                <p className={styles.flagDesc}>{detail.anomalyFlags[0]?.description}</p>

                <div className={styles.evidenceBlock}>
                  {Object.entries(detail.anomalyFlags[0]?.evidence || {}).map(([k, v]) => (
                    <div key={k} className={styles.evidenceLine}>
                      <span className={styles.evidenceKey}>{k}</span>
                      <span className={styles.evidenceArrow}>→</span>
                      <span className={styles.evidenceVal}>{String(v)}</span>
                    </div>
                  ))}
                </div>

                <div className={styles.scoreRow}>
                  {[
                    { label: 'CORRECT',   val: detail.score?.correct,     cls: styles.green },
                    { label: 'WRONG',     val: detail.score?.incorrect,   cls: styles.danger },
                    { label: 'SKIPPED',   val: detail.score?.unattempted, cls: '' },
                    { label: 'MARKS',     val: detail.score?.marks,       cls: styles.indigo },
                  ].map(s => (
                    <div key={s.label} className={styles.scoreMini}>
                      <div className={`${styles.scoreVal} ${s.cls}`}>{s.val ?? '—'}</div>
                      <div className={styles.scoreLabel}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className={styles.hashRow}>
                  <span className={styles.hashLabel}>paper</span>
                  <span className={styles.hash}>{detail.paperId}</span>
                </div>

                <div className={styles.noteLabel}>Add a note (saved to audit log)</div>
                <textarea
                  className={styles.noteInput}
                  placeholder="e.g. Student reported connectivity issue — verified with institution records."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                />

                <div className={styles.actions}>
                  <button
                    className={styles.btnDismiss}
                    onClick={() => decide('dismiss')}
                    disabled={deciding}
                  >
                    ✓ Dismiss — result confirmed
                  </button>
                  <button
                    className={styles.btnEscalate}
                    onClick={() => decide('escalate')}
                    disabled={deciding}
                  >
                    ↑ Escalate to admin
                  </button>
                </div>

                {detail.anomalyFlags.length > 1 && (
                  <div className={styles.moreFlags}>
                    +{detail.anomalyFlags.length - 1} more flag{detail.anomalyFlags.length > 2 ? 's' : ''} on this paper
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
