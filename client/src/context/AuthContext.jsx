import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(() => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  // Step 1: send OTP. extra carries student-only fields (currently just governmentId)
  // that an admin/coordinator registration wouldn't need.
  const registerInit = async (name, email, password, role = 'student', extra = {}) => {
    await api.post('/auth/register/init', { name, email, password, role, ...extra })
  }

  // Step 2: verify OTP and create account
  const registerVerify = async (email, otp) => {
    const res = await api.post('/auth/register/verify', { email, otp })
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    return user
  }

  // Step 1: validate password. For students, this may complete login
  // immediately (otpSkipped: true) — see auth.js for why. Returns the
  // response so the caller (Login.jsx) can branch on otpSkipped.
  const loginInit = async (email, password) => {
    const res = await api.post('/auth/login/init', { email, password })
    if (res.data.otpSkipped) {
      const { token, user } = res.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      setUser(user)
    }
    return res.data
  }

  // Step 2: verify OTP and get token
  const loginVerify = async (email, otp) => {
    const res = await api.post('/auth/login/verify', { email, otp })
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    return user
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, registerInit, registerVerify, loginInit, loginVerify, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
