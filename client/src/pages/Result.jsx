import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import styles from './Result.module.css'

export default function Result() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  if (!state) {
    navigate('/exam')
    return null
  }

  const { score, status, message, flagged, paperHash } = state

  const copyHash = () => {
    navigator.clipboard.writeText(paperHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.eyebrow}>EXAMSHIELD · RESULT</div>

        {flagged ? (
          <>
            <div className={styles.statusIcon}>⏳</div>
            <h2 className={styles.title}>Under Review</h2>
            <p className={styles.message}>{message}</p>
            <p className={styles.sub}>A coordinator will review your submission. Results will be confirmed shortly. This does not mean your result is negative.</p>
          </>
        ) : (
          <>
            <div className={styles.marksDisplay}>
              <span className={styles.marksVal}>{score.marks}</span>
              <span className={styles.marksLabel}>marks</span>
            </div>
            <h2 className={styles.title}>Submission confirmed</h2>
            <p className={styles.message}>{message}</p>

            <div className={styles.scoreGrid}>
              <div className={styles.scoreItem}>
                <div className={`${styles.scoreVal} ${styles.green}`}>{score.correct}</div>
                <div className={styles.scoreLabel}>Correct (+{score.correct * 4})</div>
              </div>
              <div className={styles.scoreItem}>
                <div className={`${styles.scoreVal} ${styles.danger}`}>{score.incorrect}</div>
                <div className={styles.scoreLabel}>Wrong (−{score.incorrect})</div>
              </div>
              <div className={styles.scoreItem}>
                <div className={styles.scoreVal}>{score.unattempted}</div>
                <div className={styles.scoreLabel}>Skipped</div>
              </div>
              <div className={styles.scoreItem}>
                <div className={styles.scoreVal}>{score.total}</div>
                <div className={styles.scoreLabel}>Total Qs</div>
              </div>
            </div>
          </>
        )}

        {paperHash && (
          <div className={styles.hashBlock}>
            <div className={styles.hashLabel}>Your paper hash — save this</div>
            <div className={styles.hashRow}>
              <code className={styles.hashVal}>{paperHash}</code>
              <button type="button" className="btn-ghost" onClick={copyHash}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className={styles.hashHint}>
              Anyone — including you, a parent, or a journalist — can use this to verify
              your submission was processed honestly, with no login needed.
            </p>
          </div>
        )}

        <div className={styles.constitution}>
          ExamShield constitution: AI flagged, human reviewed, system executed.
        </div>
      </div>
    </div>
  )
}
