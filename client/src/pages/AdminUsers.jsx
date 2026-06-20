import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './AdminUsers.module.css'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')

  const load = () => {
    setLoading(true)
    const params = roleFilter ? `?role=${roleFilter}` : ''
    api.get(`/admin/users${params}`)
      .then(res => { setUsers(res.data.users); setTotal(res.data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [roleFilter])

  const toggle = async (user) => {
    const endpoint = user.isActive ? 'deactivate' : 'reactivate'
    try {
      await api.patch(`/admin/users/${user._id}/${endpoint}`)
      setActionMsg(`${user.name} ${user.isActive ? 'deactivated' : 'reactivated'}`)
      load()
      setTimeout(() => setActionMsg(''), 3000)
    } catch (err) {
      setActionMsg(err.response?.data?.error || 'Action failed')
    }
  }

  const roleColor = (r) => r === 'admin' ? 'badge-danger' : r === 'coordinator' ? 'badge-amber' : 'badge-indigo'

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>User Management</div>
          <div className={styles.topbarSub}>{total} users total</div>
        </div>
        <div className={styles.content}>
          {actionMsg && <div className={styles.actionMsg}>{actionMsg}</div>}
          <div className={styles.filters}>
            {['', 'student', 'coordinator', 'admin'].map(r => (
              <button key={r} className={`${styles.filterBtn} ${roleFilter === r ? styles.filterActive : ''}`}
                onClick={() => setRoleFilter(r)}>
                {r || 'All'}
              </button>
            ))}
          </div>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Name</span><span>Email</span><span>Role</span><span>Joined</span><span>Status</span><span>Action</span>
            </div>
            {loading ? <div className={styles.empty}>Loading…</div> : users.map(u => (
              <div key={u._id} className={styles.tableRow}>
                <span className={styles.name}>{u.name}</span>
                <span className={styles.email}>{u.email}</span>
                <span><span className={`badge ${roleColor(u.role)}`}>{u.role}</span></span>
                <span className={styles.mono}>{new Date(u.createdAt).toLocaleDateString('en-IN')}</span>
                <span><span className={`badge ${u.isActive ? 'badge-green' : 'badge-danger'}`}>{u.isActive ? 'active' : 'inactive'}</span></span>
                <span>
                  <button className={`${styles.actionBtn} ${u.isActive ? styles.deactivate : styles.reactivate}`}
                    onClick={() => toggle(u)}>
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
