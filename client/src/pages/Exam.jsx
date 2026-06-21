import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Timer from '../components/Timer'
import api from '../api/client'
import styles from './Exam.module.css'

const TOTAL_SECONDS = 180 * 60 // 3 hours
const MAX_VIOLATIONS = 3       // auto-submit after this many tab switches

export default function Exam() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('select')
  const [subject, setSubject] = useState('Physics')
  const [examCode, setExamCode] = useState('')
  const [paper, setPaper] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [responses, setResponses] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Security state
  const [violations, setViolations] = useState(0)
  const [warningVisible, setWarningVisible] = useState(false)
  const [warningMsg, setWarningMsg] = useState('')
  const violationsRef = useRef(0)
  const phaseRef = useRef('select')

  const startTimeRef = useRef(null)
  const questionStartRef = useRef(null)

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ── Submit paper (defined early so security hooks can call it) ───────────────
  const submitPaper = useCallback(async (currentPaper, currentResponses, reason) => {
    if (!currentPaper) return
    setPhase('submitting')

    const totalTimeSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000)
    const responseArray = currentPaper.questions.map(q => ({
      questionId: q.questionId,
      selectedOption: currentResponses[q.questionId]?.selectedOption || null,
      timeSpentSeconds: currentResponses[q.questionId]?.timeSpentSeconds || 0,
      changesCount: currentResponses[q.questionId]?.changesCount || 0,
      finalChangeSecondsBefore: currentResponses[q.questionId]?.finalChangeSecondsBefore || totalTimeSeconds,
    }))

    try {
      const res = await api.post('/paper/submit', {
        paperId: currentPaper._id,
        accessToken: sessionStorage.getItem('paperAccessToken'),
        totalTimeSeconds,
        responses: responseArray,
        securityNote: reason || null,
      })
      navigate('/result', { state: res.data })
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed')
      setPhase('exam')
    }
  }, [navigate])

  // ── Security enforcement (only during exam phase) ────────────────────────────
  useEffect(() => {
    if (phase !== 'exam') return

    const showWarning = (msg) => {
      setWarningMsg(msg)
      setWarningVisible(true)
      setTimeout(() => setWarningVisible(false), 4000)
    }

    const handleViolation = (msg) => {
      violationsRef.current += 1
      setViolations(violationsRef.current)
      showWarning(msg)
      if (violationsRef.current >= MAX_VIOLATIONS) {
        setPaper(prev => {
          setResponses(resp => {
            submitPaper(prev, resp, `Auto-submitted after ${MAX_VIOLATIONS} security violations`)
            return resp
          })
          return prev
        })
      }
    }

    // 1. Disable right click
    const onContextMenu = (e) => {
      e.preventDefault()
      showWarning('Right-click is disabled during the exam.')
    }

    // 2. Tab switch / window blur
    const onVisibilityChange = () => {
      if (document.hidden && phaseRef.current === 'exam') {
        handleViolation(`Tab switch detected! Warning ${violationsRef.current + 1} of ${MAX_VIOLATIONS}. Auto-submit after ${MAX_VIOLATIONS} violations.`)
      }
    }

    const onBlur = () => {
      if (phaseRef.current === 'exam') {
        handleViolation(`Window focus lost! Warning ${violationsRef.current} of ${MAX_VIOLATIONS}.`)
      }
    }

    // 3. Disable keyboard shortcuts
    const onKeyDown = (e) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S, Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+P
      const blocked = (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) ||
        (e.ctrlKey && ['u', 'U', 's', 'S', 'p', 'P'].includes(e.key))
      )
      if (blocked) {
        e.preventDefault()
        showWarning('Keyboard shortcut disabled during exam.')
      }

      // Block Ctrl+A and Ctrl+C for copy
      if (e.ctrlKey && ['a', 'A', 'c', 'C'].includes(e.key)) {
        e.preventDefault()
      }
    }

    // 4. Disable text selection
    const onSelectStart = (e) => { e.preventDefault() }

    // 5. Disable copy/paste
    const onCopy = (e) => { e.preventDefault() }
    const onCut = (e) => { e.preventDefault() }
    const onPaste = (e) => { e.preventDefault() }

    // 6. Print disabled
    const onBeforePrint = (e) => { e.preventDefault() }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('selectstart', onSelectStart)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    window.addEventListener('beforeprint', onBeforePrint)

    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('selectstart', onSelectStart)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
      window.removeEventListener('beforeprint', onBeforePrint)
    }
  }, [phase, submitPaper])

  // ── Paper generation ─────────────────────────────────────────────────────────
  const generatePaper = async () => {
    if (!examCode.trim()) { setError('Enter your exam access code to begin'); return }
    setLoading(true); setError('')
    try {
      const res = await api.post('/paper/generate', { examCode: examCode.trim() })
      const { paperId, accessToken, subject: assignedSubject } = res.data
      sessionStorage.setItem('paperAccessToken', accessToken)
      const paperRes = await api.get(`/paper/${paperId}?accessToken=${accessToken}`)
      setPaper(paperRes.data.paper)
      setSubject(assignedSubject)
      startTimeRef.current = Date.now()
      questionStartRef.current = Date.now()
      setPhase('exam')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate paper')
    } finally {
      setLoading(false)
    }
  }

  const selectOption = (questionId, option) => {
    const totalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
    const remaining = TOTAL_SECONDS - totalElapsed
    setResponses(prev => {
      const existing = prev[questionId] || { selectedOption: null, changesCount: 0, finalChangeSecondsBefore: null }
      const isChange = existing.selectedOption !== null && existing.selectedOption !== option
      return {
        ...prev,
        [questionId]: {
          selectedOption: option,
          changesCount: existing.changesCount + (isChange ? 1 : 0),
          finalChangeSecondsBefore: remaining,
        }
      }
    })
  }

  const navigateTo = (idx) => {
    const currentQ = paper?.questions[currentIdx]
    if (currentQ) {
      const spentNow = Math.floor((Date.now() - questionStartRef.current) / 1000)
      setResponses(prev => {
        const existing = prev[currentQ.questionId] || { selectedOption: null, changesCount: 0, finalChangeSecondsBefore: null, timeSpentSeconds: 0 }
        return { ...prev, [currentQ.questionId]: { ...existing, timeSpentSeconds: (existing.timeSpentSeconds || 0) + spentNow } }
      })
    }
    questionStartRef.current = Date.now()
    setCurrentIdx(idx)
  }

  const handleSubmit = () => {
    setPaper(prev => {
      setResponses(resp => {
        submitPaper(prev, resp, null)
        return resp
      })
      return prev
    })
  }

  // ── Select screen ────────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div className={styles.selectWrap}>
        <div className={styles.selectCard}>
          <div className={styles.selectEyebrow}>EXAMSHIELD · STUDENT EXAM</div>
          <h2 className={styles.selectTitle}>Ready to begin</h2>
          <p className={styles.selectSub}>
            One exam, four sections — Physics, Chemistry, Botany, and Zoology — all in a
            single paper. Your paper is assembled uniquely for you at the moment of generation.
          </p>
          {error && <div className="error-msg">{error}</div>}
          <div className="field">
            <label>EXAM ACCESS CODE</label>
            <input
              type="text"
              placeholder="e.g. K7P9R2MX"
              value={examCode}
              onChange={e => setExamCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoFocus
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '4px', fontSize: '18px', textAlign: 'center' }}
            />
          </div>
          <p className={styles.codeHint}>
            This was emailed to you ahead of today as your exam access code. It works once —
            enter it now to begin.
          </p>
          <div className={styles.selectMeta}>
            <span>4 sections</span><span>·</span><span>3 hours</span><span>·</span><span>NEET marking (+4 / -1)</span>
          </div>
          <button className="btn-primary" onClick={generatePaper} disabled={loading}>
            {loading ? 'Assembling your paper…' : 'Begin exam →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Submitting screen ────────────────────────────────────────────────────────
  if (phase === 'submitting') {
    return (
      <div className={styles.selectWrap}>
        <div className={styles.selectCard} style={{ textAlign: 'center' }}>
          <div className={styles.selectEyebrow}>EXAMSHIELD</div>
          <h2 className={styles.selectTitle}>Submitting…</h2>
          <p className={styles.selectSub}>Please do not close this window.</p>
        </div>
      </div>
    )
  }

  // ── Exam screen ──────────────────────────────────────────────────────────────
  const q = paper?.questions[currentIdx]
  const answered = Object.keys(responses).filter(id => responses[id]?.selectedOption)

  return (
    <div className={styles.examWrap} style={{ userSelect: 'none' }}>

      {/* Security warning overlay */}
      {warningVisible && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#dc2626', color: '#fff',
          padding: '14px 24px', textAlign: 'center',
          fontWeight: 600, fontSize: 14, letterSpacing: '0.5px',
          boxShadow: '0 4px 24px rgba(220,38,38,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
        }}>
          ⚠️ {warningMsg}
        </div>
      )}

      {/* Violation counter */}
      {violations > 0 && (
        <div style={{
          position: 'fixed', top: warningVisible ? 52 : 0, right: 0, zIndex: 9998,
          background: '#7f1d1d', color: '#fca5a5',
          padding: '6px 16px', fontSize: 12, fontWeight: 600,
          borderBottomLeftRadius: 8
        }}>
          Violations: {violations}/{MAX_VIOLATIONS}
        </div>
      )}

      <div className={styles.examTopbar}>
        <div className={styles.examTopbarLeft}>
          <span className={styles.examSubject}>{q?.subject}</span>
          <span className={styles.examPaperId}>{paper?._id?.slice(-8)}</span>
        </div>
        <div className={styles.examTopbarRight}>
          <span className={styles.examUser}>{user?.name}</span>
        </div>
      </div>

      <div className={styles.examBody}>
        <div className={styles.questionArea}>
          <div className={styles.questionCard}>
            <div className={styles.qMeta}>
              <span className={styles.qNum}>Q{currentIdx + 1} of {paper?.questions.length}</span>
              <span className="badge badge-indigo">{q?.topic}</span>
              <span className={`badge ${q?.difficulty === 'Hard' ? 'badge-danger' : q?.difficulty === 'Medium' ? 'badge-amber' : 'badge-green'}`}>
                {q?.difficulty}
              </span>
            </div>
            <p className={styles.qText}>{q?.variant?.questionText}</p>
            <div className={styles.options}>
              {['A', 'B', 'C', 'D'].map(opt => (
                <button
                  key={opt}
                  className={`${styles.option} ${responses[q?.questionId]?.selectedOption === opt ? styles.optionSelected : ''}`}
                  onClick={() => selectOption(q.questionId, opt)}
                >
                  <span className={styles.optLabel}>{opt}</span>
                  <span className={styles.optText}>{q?.variant?.options?.[opt]}</span>
                </button>
              ))}
            </div>
            <div className={styles.navRow}>
              <button className="btn-ghost" onClick={() => navigateTo(currentIdx - 1)} disabled={currentIdx === 0}>
                ← Previous
              </button>
              {currentIdx < paper?.questions.length - 1 ? (
                <button className="btn-ghost" onClick={() => navigateTo(currentIdx + 1)}>Next →</button>
              ) : (
                <button className={styles.btnSubmit} onClick={handleSubmit}>Submit paper</button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.examSidebar}>
          <Timer totalSeconds={TOTAL_SECONDS} onExpire={handleSubmit} />
          <div className={styles.qGridCard}>
            <div className={styles.qGridLabel}>QUESTIONS</div>
            <div className={styles.qGrid}>
              {paper?.questions.map((qq, i) => {
                const prevSection = i > 0 ? paper.questions[i - 1].subject : null
                const showSectionLabel = qq.subject !== prevSection
                return (
                  <div key={qq.questionId} style={{ display: 'contents' }}>
                    {showSectionLabel && <div className={styles.qSectionLabel}>{qq.subject}</div>}
                    <button
                      className={`${styles.qBtn} ${i === currentIdx ? styles.qBtnCurrent : ''} ${responses[qq.questionId]?.selectedOption && i !== currentIdx ? styles.qBtnAnswered : ''}`}
                      onClick={() => navigateTo(i)}
                    >
                      {i + 1}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className={styles.qGridLegend}>
              <span className={styles.legendDot} style={{ background: 'var(--indigo)' }} /> Current
              <span className={styles.legendDot} style={{ background: 'var(--indigo-glow)', border: '1px solid var(--indigo)', marginLeft: 10 }} /> Answered ({answered.length})
            </div>
          </div>
          {error && <div className="error-msg" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}
