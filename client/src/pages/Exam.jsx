import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Timer from '../components/Timer'
import api from '../api/client'
import styles from './Exam.module.css'

const TOTAL_SECONDS = 180 * 60 // 3 hours

export default function Exam() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('select') // select | exam | submitting
  const [subject, setSubject] = useState('Physics')
  const [examCode, setExamCode] = useState('')
  const [paper, setPaper] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [responses, setResponses] = useState({}) // questionId → { selectedOption, changes, lastChangeSec }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const startTimeRef = useRef(null)
  const questionStartRef = useRef(null)

  const generatePaper = async () => {
    if (!examCode.trim()) {
      setError('Enter your exam access code to begin')
      return
    }
    setLoading(true)
    setError('')
    try {
      // subject is no longer sent — the backend assigns it from the student's
      // roster entry. We don't know what it'll be until the response comes back.
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
    // Bank the time spent on the question we're leaving before switching.
    const currentQ = paper?.questions[currentIdx]
    if (currentQ) {
      const spentNow = Math.floor((Date.now() - questionStartRef.current) / 1000)
      setResponses(prev => {
        const existing = prev[currentQ.questionId] || { selectedOption: null, changesCount: 0, finalChangeSecondsBefore: null, timeSpentSeconds: 0 }
        return {
          ...prev,
          [currentQ.questionId]: {
            ...existing,
            timeSpentSeconds: (existing.timeSpentSeconds || 0) + spentNow,
          }
        }
      })
    }
    questionStartRef.current = Date.now()
    setCurrentIdx(idx)
  }

  const submitPaper = async () => {
    if (!paper) return
    setPhase('submitting')

    const totalTimeSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000)

    // Bank time for whichever question was on screen when Submit was clicked —
    // navigateTo() only fires on Next/Previous/grid-click, not on final submit.
    const finalQ = paper.questions[currentIdx]
    const finalSpent = Math.floor((Date.now() - questionStartRef.current) / 1000)
    const finalResponses = {
      ...responses,
      [finalQ.questionId]: {
        ...(responses[finalQ.questionId] || { selectedOption: null, changesCount: 0, finalChangeSecondsBefore: null, timeSpentSeconds: 0 }),
        timeSpentSeconds: (responses[finalQ.questionId]?.timeSpentSeconds || 0) + finalSpent,
      },
    }

    const responseArray = paper.questions.map(q => ({
      questionId: q.questionId,
      selectedOption: finalResponses[q.questionId]?.selectedOption || null,
      timeSpentSeconds: finalResponses[q.questionId]?.timeSpentSeconds || 0,
      changesCount: finalResponses[q.questionId]?.changesCount || 0,
      finalChangeSecondsBefore: finalResponses[q.questionId]?.finalChangeSecondsBefore || totalTimeSeconds,
    }))

    try {
      const res = await api.post('/paper/submit', {
        paperId: paper._id,
        accessToken: sessionStorage.getItem('paperAccessToken'),
        totalTimeSeconds,
        responses: responseArray,
      })
      navigate('/result', { state: res.data })
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed')
      setPhase('exam')
    }
  }

  // ── Start screen ─────────────────────────────────────────────────────────────
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
            <span>4 sections</span>
            <span>·</span>
            <span>3 hours</span>
            <span>·</span>
            <span>NEET marking (+4 / -1)</span>
          </div>
          <button className="btn-primary" onClick={generatePaper} disabled={loading}>
            {loading ? 'Assembling your paper…' : 'Begin exam →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Submitting screen ───────────────────────────────────────────────────────
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

  // ── Exam screen ─────────────────────────────────────────────────────────────
  const q = paper?.questions[currentIdx]
  const answered = Object.keys(responses).filter(id => responses[id]?.selectedOption)

  return (
    <div className={styles.examWrap}>
      <div className={styles.examTopbar}>
        <div className={styles.examTopbarLeft}>
          <span className={styles.examSubject}>{q?.subject}</span>
          <span className={styles.examPaperId}>
            {paper?._id?.slice(-8)}
          </span>
        </div>
        <div className={styles.examTopbarRight}>
          <span className={styles.examUser}>{user?.name}</span>
        </div>
      </div>

      <div className={styles.examBody}>
        {/* Question area */}
        <div className={styles.questionArea}>
          <div className={styles.questionCard}>
            <div className={styles.qMeta}>
              <span className={styles.qNum}>Q{currentIdx + 1} of {paper?.questions.length}</span>
              <span className={`badge badge-indigo`}>{q?.topic}</span>
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
              <button
                className="btn-ghost"
                onClick={() => navigateTo(currentIdx - 1)}
                disabled={currentIdx === 0}
              >
                ← Previous
              </button>
              {currentIdx < paper?.questions.length - 1 ? (
                <button className="btn-ghost" onClick={() => navigateTo(currentIdx + 1)}>
                  Next →
                </button>
              ) : (
                <button className={styles.btnSubmit} onClick={submitPaper}>
                  Submit paper
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className={styles.examSidebar}>
          <Timer totalSeconds={TOTAL_SECONDS} onExpire={submitPaper} />

          <div className={styles.qGridCard}>
            <div className={styles.qGridLabel}>QUESTIONS</div>
            <div className={styles.qGrid}>
              {paper?.questions.map((qq, i) => {
                const prevSection = i > 0 ? paper.questions[i - 1].subject : null
                const showSectionLabel = qq.subject !== prevSection
                return (
                  <div key={qq.questionId} style={{ display: 'contents' }}>
                    {showSectionLabel && (
                      <div className={styles.qSectionLabel}>{qq.subject}</div>
                    )}
                    <button
                      className={`${styles.qBtn}
                        ${i === currentIdx ? styles.qBtnCurrent : ''}
                        ${responses[qq.questionId]?.selectedOption && i !== currentIdx ? styles.qBtnAnswered : ''}
                      `}
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
