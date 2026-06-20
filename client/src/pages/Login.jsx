import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function Login() {
  const { loginInit, loginVerify } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('credentials') // credentials | otp
  const [form, setForm] = useState({ email: '', password: '', otp: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCredentials = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await loginInit(form.email, form.password)
      if (data.otpSkipped) {
        navigate(data.user.role === 'student' ? '/exam' : '/dashboard')
      } else {
        setStep('otp')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOTP = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await loginVerify(form.email, form.otp)
      navigate(user.role === 'student' ? '/exam' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.card}>
        <div className={styles.eyebrow}>EXAMSHIELD · OPEN SOURCE</div>
        <h1 className={styles.headline}>No two papers.<br /><em>No two students.</em></h1>
        <p className={styles.sub}>AI-assisted exam integrity. Every decision stays with humans.</p>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials}>
            {error && <div className="error-msg">{error}</div>}
            <div className="field">
              <label>EMAIL</label>
              <input type="email" placeholder="you@email.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="field">
              <label>PASSWORD</label>
              <input type="password" placeholder="••••••••" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Sending OTP…' : 'Continue →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOTP}>
            {error && <div className="error-msg">{error}</div>}
            <div className={styles.otpInfo}>
              OTP sent to <strong>{form.email}</strong>. Check your inbox. Valid for 10 minutes.
            </div>
            <div className="field">
              <label>OTP</label>
              <input type="text" placeholder="6-digit code" maxLength={6}
                value={form.otp} onChange={e => setForm(f => ({ ...f, otp: e.target.value }))}
                autoFocus required style={{ fontFamily: 'var(--font-mono)', letterSpacing: '6px', fontSize: '20px' }} />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Sign in →'}
            </button>
            <button type="button" className={styles.backBtn} onClick={() => { setStep('credentials'); setError('') }}>
              ← Use a different email
            </button>
          </form>
        )}

        <p className={styles.footer}>New student? <Link to="/register">Create account</Link></p>
      </div>
    </div>
  )
}
