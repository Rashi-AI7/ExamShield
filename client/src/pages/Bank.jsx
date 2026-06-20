import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './Bank.module.css'

export default function Bank() {
  const [questions, setQuestions] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ subject: '', difficulty: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.subject) params.set('subject', filters.subject)
    if (filters.difficulty) params.set('difficulty', filters.difficulty)
    params.set('limit', '50')
    params.set('page', page)

    api.get(`/questions?${params}`)
      .then(res => {
        setQuestions(res.data.questions)
        setTotal(res.data.total)   // ✅ fixed: was res.data.count
        setPages(res.data.pages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filters, page])

  // reset to page 1 when filters change
  const handleFilter = (key, value) => {
    setPage(1)
    setFilters(f => ({ ...f, [key]: value }))
  }

  const diffClass = (d) =>
    d === 'Hard' ? 'badge-danger' : d === 'Medium' ? 'badge-amber' : 'badge-green'

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Question Bank</div>
          <div className={styles.topbarSub}>{total} questions</div>
        </div>
        <div className={styles.content}>
          <div className={styles.filters}>
            <select
              value={filters.subject}
              onChange={e => handleFilter('subject', e.target.value)}
              style={{ width: 160 }}
            >
              <option value="">All subjects</option>
              <option>Physics</option>
              <option>Chemistry</option>
              <option>Biology</option>
            </select>
            <select
              value={filters.difficulty}
              onChange={e => handleFilter('difficulty', e.target.value)}
              style={{ width: 160 }}
            >
              <option value="">All difficulties</option>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : (
            <>
              <div className={styles.table}>
                <div className={styles.tableHead}>
                  <span>Subject</span>
                  <span>Topic</span>
                  <span>Difficulty</span>
                  <span>Variants</span>
                  <span>Status</span>
                </div>
                {questions.map(q => (
                  <div key={q._id} className={styles.tableRow}>
                    <span className={styles.subject}>{q.subject}</span>
                    <span className={styles.topic}>{q.topic}</span>
                    <span><span className={`badge ${diffClass(q.difficulty)}`}>{q.difficulty}</span></span>
                    <span className={styles.mono}>{q.variants?.length || 0}</span>
                    <span>
                      <span className={`badge ${q.approvedByAI ? 'badge-green' : 'badge-amber'}`}>
                        {q.approvedByAI ? 'approved' : 'pending'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {pages > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{ padding: '4px 12px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    page {page} of {pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    style={{ padding: '4px 12px', cursor: page === pages ? 'not-allowed' : 'pointer', opacity: page === pages ? 0.4 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
