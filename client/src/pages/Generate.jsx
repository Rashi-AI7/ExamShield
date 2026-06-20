import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import api from '../api/client'
import styles from './Generate.module.css'

export default function Generate() {
  const [form, setForm] = useState({ subject: 'Physics', topic: '', difficulty: 'Medium' })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.post('/questions/generate', form)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>Generate Question</div>
          <div className={styles.topbarSub}>Gemini drafts it. You approve it. It goes in the bank.</div>
        </div>
        <div className={styles.content}>
          <div className={styles.formCard}>
            <form onSubmit={generate}>
              {error && <div className="error-msg">{error}</div>}
              <div className="field">
                <label>SUBJECT</label>
                <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}>
                  <option>Physics</option>
                  <option>Chemistry</option>
                  <option>Biology</option>
                </select>
              </div>
              <div className="field">
                <label>TOPIC</label>
                <input
                  type="text"
                  placeholder="e.g. Kinematics, Thermodynamics, Cell Division…"
                  value={form.topic}
                  onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>DIFFICULTY</label>
                <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Generating with Gemini…' : '✨ Generate question'}
              </button>
            </form>
          </div>

          {result && (
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <span className="badge badge-green">✓ Generated & stored</span>
                <span className={styles.resultId}>{result.question?._id}</span>
              </div>
              <div className={styles.resultMeta}>
                {result.question?.subject} · {result.question?.topic} · {result.question?.difficulty}
              </div>
              <div className={styles.approvalNote}>
                <span className={styles.approvalLabel}>AI APPROVAL REASONING</span>
                <p>{result.question?.approvalDetails?.reasoning}</p>
              </div>
              <div className={styles.variantCount}>
                {result.question?.variants?.length} variant{result.question?.variants?.length !== 1 ? 's' : ''} generated
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
