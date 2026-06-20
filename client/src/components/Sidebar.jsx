import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Sidebar.module.css'

const coordinatorNav = [
  { to: '/dashboard', icon: '⬛', label: 'Dashboard' },
  { to: '/review',    icon: '🚩', label: 'Flagged Papers', badge: true },
  { to: '/generate',  icon: '✨', label: 'Generate' },
  { to: '/bank',      icon: '🗄', label: 'Question Bank' },
]

const adminOnlyNav = [
  { to: '/admin/roster', icon: '🎓', label: 'Exam Roster' },
  { to: '/admin/users', icon: '👥', label: 'Users' },
  { to: '/admin/audit', icon: '📋', label: 'Audit Log' },
]

export default function Sidebar({ flagCount = 0 }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
  const isAdmin = user?.role === 'admin'

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoMark}>Exam<span>Shield</span></div>
        <div className={styles.logoSub}>INTEGRITY PLATFORM</div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navLabel}>Overview</div>
        {coordinatorNav.map(item => (
          <NavLink key={item.to} to={item.to}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
            {item.badge && flagCount > 0 && <span className={styles.badge}>{flagCount}</span>}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className={styles.navLabel} style={{ marginTop: 16 }}>Admin</div>
            {adminOnlyNav.map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className={styles.userArea}>
        <div className={styles.userCard}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.userInfo}>
            <p>{user?.name}</p>
            <span>{user?.role}</span>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
      </div>
    </aside>
  )
}
