import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './AdminAudit.module.css'

export default function AdminAudit() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [lines, setLines] = useState(100)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/audit?lines=${lines}`)
      .then(res => { setEntries(res.data.entries); setTotal(res.data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [lines])

  const statusColor = (s) => {
    if (s >= 500) return styles.danger
    if (s >= 400) return styles.amber
    return styles.green
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Audit Log</div>
          <div className={styles.topbarSub}>{total} total entries</div>
          <select value={lines} onChange={e => setLines(e.target.value)} style={{ width: 140, marginLeft: 'auto' }}>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={500}>Last 500</option>
          </select>
        </div>
        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : entries.length === 0 ? (
            <div className={styles.empty}>No audit entries yet.</div>
          ) : (
            <div className={styles.logList}>
              {entries.map((e, i) => (
                <div key={i} className={styles.logRow}>
                  <span className={styles.ts}>{new Date(e.startedAt).toLocaleTimeString('en-IN')}</span>
                  <span className={`${styles.method} ${styles[e.method?.toLowerCase()]}`}>{e.method}</span>
                  <span className={styles.url}>{e.route}</span>
                  <span className={`${styles.status} ${statusColor(e.statusCode)}`}>{e.statusCode}</span>
                  <span className={styles.rt}>{e.durationMs}ms</span>
                  <span className={styles.ip}>{e.ip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
