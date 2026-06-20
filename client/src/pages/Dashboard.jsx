import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const navigate = useNavigate()
  const [flagged, setFlagged] = useState([])
  const [stats, setStats] = useState({ flagged: 0, questionBank: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/review/flagged?limit=5'),
      api.get('/questions?limit=1'),
    ])
      .then(([reviewRes, questionsRes]) => {
        setFlagged(reviewRes.data.papers)
        setStats({
          flagged: reviewRes.data.total,
          questionBank: questionsRes.data.total,
        })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const severityClass = (s) =>
    s === 'HIGH' ? styles.high : s === 'MEDIUM' ? styles.medium : styles.low

  const flagIcon = (type) => {
    if (type === 'IMPOSSIBLE_TIMING') return '⏱'
    if (type === 'LAST_SECOND_CHANGES') return '🔄'
    if (type === 'IDENTICAL_ANSWER_PATTERN') return '⎘'
    return '⚑'
  }

  return (
    <div className={styles.layout}>
      <Sidebar flagCount={stats.flagged} />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Dashboard</div>
        </div>
        <div className={styles.content}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>TOTAL PAPERS</div>
              <div className={`${styles.statVal} ${styles.indigo}`}>—</div>
              <div className={styles.statSub}>all time</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>FLAGGED</div>
              <div className={`${styles.statVal} ${styles.danger}`}>{stats.flagged}</div>
              <div className={styles.statSub}>awaiting review</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>QUESTION BANK</div>
              <div className={`${styles.statVal} ${styles.amber}`}>
                {loading ? '…' : stats.questionBank}
              </div>
              <div className={styles.statSub}>4 sections — Physics, Chemistry, Botany, Zoology</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>AI MODEL</div>
              <div className={`${styles.statVal} ${styles.green}`} style={{ fontSize: 14, marginTop: 6 }}>gemini-3.1-flash-lite</div>
              <div className={styles.statSub}>free tier · 500 RPD</div>
            </div>
          </div>

          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>Flagged — awaiting human review</div>
            <button className="btn-ghost" onClick={() => navigate('/review')}>View all</button>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : flagged.length === 0 ? (
            <div className={styles.empty}>No flagged papers. All clear.</div>
          ) : (
            <div className={styles.flagList}>
              {flagged.map(paper => (
                <div
                  key={paper.paperId}
                  className={`${styles.flagCard} ${severityClass(paper.flags[0]?.severity)}`}
                  onClick={() => navigate(`/review/${paper.paperId}`)}
                >
                  <div className={`${styles.flagIcon} ${severityClass(paper.flags[0]?.severity)}`}>
                    {flagIcon(paper.flags[0]?.type)}
                  </div>
                  <div className={styles.flagMeta}>
                    <div className={styles.flagStudent}>
                      {paper.studentId} · {Object.entries(paper.sectionCounts || {}).map(([s, n]) => `${s}:${n}`).join(' ')}
                    </div>
                    <div className={styles.flagDesc}>{paper.flags[0]?.description}</div>
                  </div>
                  <div className={styles.flagRight}>
                    <span className={`badge badge-${paper.flags[0]?.severity === 'HIGH' ? 'danger' : 'amber'}`}>
                      {paper.flags[0]?.severity}
                    </span>
                    <div className={styles.flagTime}>
                      {new Date(paper.submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
