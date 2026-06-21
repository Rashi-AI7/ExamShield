import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './AdminAudit.module.css'

const friendlyIp = (ip) => {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return 'Local machine'
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '')
  return ip
}

const friendlyStatus = (s) => {
  if (s === 200 || s === 201) return '✓ Success'
  if (s === 400) return '✗ Bad request'
  if (s === 401) return '✗ Unauthorized'
  if (s === 403) return '✗ Forbidden'
  if (s === 404) return '✗ Not found'
  if (s === 409) return '✗ Conflict'
  if (s >= 500) return '✗ Server error'
  return s
}

const friendlyRoute = (route) => {
  if (!route) return '—'
  const r = route.split('?')[0]

  const map = {
    '/api/auth/register/init':           'Student registered (init)',
    '/api/auth/register/verify':         'Student registration verified',
    '/api/auth/login/init':              'Login attempt',
    '/api/auth/login/verify':            'Login verified',
    '/api/auth/me':                      'Session check',
    '/api/paper/generate':               'Exam paper generated',
    '/api/paper/submit':                 'Exam paper submitted',
    '/api/admin/roster/generate-codes':  'Exam codes generated',
    '/api/admin/roster':                 'Roster viewed',
    '/api/admin/users':                  'Users viewed',
    '/api/admin/coordinators/register':  'Coordinator account created',
    '/api/review/flagged':               'Flagged papers viewed',
    '/api/questions':                    'Question bank viewed',
    '/api/transparency':                 'Result verified (public)',
  }

  // Exact match
  if (map[r]) return map[r]

  // Pattern matches
  if (r.startsWith('/api/paper/')) return 'Exam paper fetched'
  if (r.startsWith('/api/review/flagged/') && route.includes('PATCH')) return 'Flag reviewed'
  if (r.startsWith('/api/review/flagged/')) return 'Flag detail viewed'
  if (r.startsWith('/api/admin/users/') && r.includes('deactivate')) return 'User deactivated'
  if (r.startsWith('/api/admin/users/') && r.includes('reactivate')) return 'User reactivated'
  if (r.startsWith('/api/admin/users/') && r.includes('promote')) return 'User promoted to coordinator'
  if (r.startsWith('/api/admin/users/') && r.includes('demote')) return 'User demoted to student'
  if (r.startsWith('/api/transparency/')) return 'Result verified (public)'

  return r
}

const statusColor = (s) => {
  if (s >= 500) return styles.danger
  if (s >= 400) return styles.amber
  return styles.green
}

export default function AdminAudit() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [lines, setLines] = useState(100)
  const [oldest, setOldest] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/audit?lines=${lines}&oldest=${oldest}`)
      .then(res => { setEntries(res.data.entries); setTotal(res.data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [lines, oldest])

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Audit Log</div>
          <div className={styles.topbarSub}>{total} total entries</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setOldest(o => !o)}
              className='btn-ghost'
              style={{ fontSize: 12 }}
            >
              {oldest ? '↑ Oldest first' : '↓ Newest first'}
            </button>
            <select value={lines} onChange={e => setLines(e.target.value)} style={{ width: 140 }}>
              <option value={50}>Last 50</option>
              <option value={100}>Last 100</option>
              <option value={500}>Last 500</option>
              <option value={99999}>All entries</option>
            </select>
          </div>
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
                  <span className={styles.ts}>
                    {new Date(e.startedAt).toLocaleTimeString('en-IN')}
                  </span>
                  <span className={`${styles.status} ${statusColor(e.statusCode)}`}>
                    {friendlyStatus(e.statusCode)}
                  </span>
                  <span className={styles.url}>
                    {friendlyRoute(e.route)}
                  </span>
                  <span className={styles.rt}>{e.durationMs}ms</span>
                  <span className={styles.ip}>{friendlyIp(e.ip)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
