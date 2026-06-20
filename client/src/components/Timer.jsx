import { useEffect, useRef, useState } from 'react'
import styles from './Timer.module.css'

export default function Timer({ totalSeconds, onExpire }) {
  const [remaining, setRemaining] = useState(totalSeconds)
  const intervalRef = useRef(null)

  // onExpire (submitPaper in Exam.jsx) closes over current responses/currentIdx
  // state, so it's a NEW function on every render. The interval below only
  // runs setup once (empty deps — we don't want to restart the countdown
  // every render), so without this ref it would call whatever onExpire
  // existed at the very first render forever — meaning a student who lets
  // the timer run out instead of clicking Submit would have their answers
  // silently dropped, submitted as the stale, mostly-empty initial state.
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          onExpireRef.current?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const pct = remaining / totalSeconds

  // Ring math
  const r = 46
  const circ = 2 * Math.PI * r // ~289

  // Color shifts as time runs out
  const stroke = pct > 0.5 ? '#6366F1' : pct > 0.2 ? '#F59E0B' : '#EF4444'

  const urgency = pct <= 0.2 ? styles.urgent : pct <= 0.5 ? styles.warning : ''

  return (
    <div className={styles.wrap}>
      <div className={styles.ringWrap}>
        <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="55" cy="55" r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth="6"
          />
          <circle
            cx="55" cy="55" r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 1s' }}
          />
        </svg>
        <div className={styles.display}>
          <span className={`${styles.val} ${urgency}`}>
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
          <span className={styles.unit}>left</span>
        </div>
      </div>
      <div className={styles.label}>TIME REMAINING</div>
    </div>
  )
}
