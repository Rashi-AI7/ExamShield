import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function Register() {
  const { registerInit, registerVerify } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('form') // form | otp
  const [form, setForm] = useState({ name: '', email: '', password: '', governmentId: '', otp: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleForm = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await registerInit(form.name, form.email, form.password, 'student', {
        governmentId: form.governmentId,
      })
      setStep('otp')
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOTP = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerVerify(form.email, form.otp)
      navigate('/exam')
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
        <div className={styles.eyebrow}>EXAMSHIELD · STUDENT REGISTRATION</div>
        <h1 className={styles.headline}>Create your<br /><em>exam account.</em></h1>
        <p className={styles.sub}>Your paper will be unique to you. No two students receive the same questions.</p>

        {step === 'form' ? (
          <form onSubmit={handleForm}>
            {error && <div className="error-msg">{error}</div>}
            <div className="field"><label>FULL NAME</label>
              <input type="text" placeholder="As per your government ID" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field"><label>EMAIL</label>
              <input type="email" placeholder="you@email.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="field"><label>AADHAAR NUMBER</label>
              <input type="text" placeholder="1234 5678 9012" value={form.governmentId}
                onChange={e => setForm(f => ({ ...f, governmentId: e.target.value }))} required
                maxLength={14} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '2px' }} />
              <p className={styles.fieldHint}>
                Used only to stop one person registering twice. Not shared or displayed anywhere.
                We check this is a valid Aadhaar number, but don't verify it belongs to you — yet.
              </p>
            </div>
            <div className="field"><label>PASSWORD</label>
              <input type="password" placeholder="Min. 8 characters" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Sending OTP…' : 'Send OTP →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOTP}>
            {error && <div className="error-msg">{error}</div>}
            <div className={styles.otpInfo}>
              OTP sent to <strong>{form.email}</strong>. Check your inbox. Valid for 10 minutes.
            </div>
            <div className="field"><label>OTP</label>
              <input type="text" placeholder="6-digit code" maxLength={6}
                value={form.otp} onChange={e => setForm(f => ({ ...f, otp: e.target.value }))}
                autoFocus required style={{ fontFamily: 'var(--font-mono)', letterSpacing: '6px', fontSize: '20px' }} />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Create account →'}
            </button>
            <button type="button" className={styles.backBtn} onClick={() => { setStep('form'); setError('') }}>
              ← Edit details
            </button>
          </form>
        )}

        <p className={styles.footer}>Already registered? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}
