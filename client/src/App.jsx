import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

import Login from './pages/Login'
import Register from './pages/Register'
import Transparency from './pages/Transparency'
import Dashboard from './pages/Dashboard'
import Review from './pages/Review'
import Generate from './pages/Generate'
import Bank from './pages/Bank'
import Exam from './pages/Exam'
import Result from './pages/Result'
import AdminUsers from './pages/AdminUsers'
import AdminRoster from './pages/AdminRoster'
import AdminAudit from './pages/AdminAudit'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<Transparency />} />
          <Route path="/verify/:paperHash" element={<Transparency />} />

          {/* Student only */}
          <Route path="/exam" element={<ProtectedRoute roles={['student']}><Exam /></ProtectedRoute>} />
          <Route path="/result" element={<ProtectedRoute roles={['student']}><Result /></ProtectedRoute>} />

          {/* Coordinator + admin */}
          <Route path="/dashboard" element={<ProtectedRoute roles={['coordinator', 'admin']}><Dashboard /></ProtectedRoute>} />
          <Route path="/review" element={<ProtectedRoute roles={['coordinator', 'admin']}><Review /></ProtectedRoute>} />
          <Route path="/review/:paperId" element={<ProtectedRoute roles={['coordinator', 'admin']}><Review /></ProtectedRoute>} />
          <Route path="/generate" element={<ProtectedRoute roles={['coordinator', 'admin']}><Generate /></ProtectedRoute>} />
          <Route path="/bank" element={<ProtectedRoute roles={['coordinator', 'admin']}><Bank /></ProtectedRoute>} />

          {/* Admin only */}
          <Route path="/admin/roster" element={<ProtectedRoute roles={['admin']}><AdminRoster /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute roles={['admin']}><AdminAudit /></ProtectedRoute>} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
