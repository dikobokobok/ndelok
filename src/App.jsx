import React, { Suspense, lazy, createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import PageLoader from './components/PageLoader'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Servers = lazy(() => import('./pages/Servers'))
const Projects = lazy(() => import('./pages/Projects'))
const Logs = lazy(() => import('./pages/Logs'))
const Settings = lazy(() => import('./pages/Settings'))
const Documentation = lazy(() => import('./pages/Documentation'))
const DeployProject = lazy(() => import('./pages/DeployProject'))
const FileManager = lazy(() => import('./pages/FileManager'))
const ProjectLogs = lazy(() => import('./pages/ProjectLogs'))
const Login = lazy(() => import('./pages/Login'))
const TmuxSession = lazy(() => import('./pages/TmuxSession'))
const Cloudflare = lazy(() => import('./pages/Cloudflare'))

export const AuthContext = createContext(null)

// Auto-logout configuration
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000 // 1 hour

// Storage keys (sessionStorage so that closing the browser / system reboot
// automatically clears the session and forces re-login)
const STORAGE_KEYS = {
  user: 'ndelok_user',
  token: 'ndelok_token',
}

const ProtectedRoute = ({ children, roles = [] }) => {
  const { user, loading } = useContext(AuthContext)
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  
  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const inactivityTimerRef = useRef(null)

  useEffect(() => {
    // Migrate any legacy data from localStorage to sessionStorage on first load,
    // then clear it from localStorage so a system reboot truly logs the user out.
    const legacyUser = localStorage.getItem(STORAGE_KEYS.user)
    const legacyToken = localStorage.getItem(STORAGE_KEYS.token)
    if (legacyUser || legacyToken) {
      localStorage.removeItem(STORAGE_KEYS.user)
      localStorage.removeItem(STORAGE_KEYS.token)
    }

    const savedUser = sessionStorage.getItem(STORAGE_KEYS.user)
    const savedToken = sessionStorage.getItem(STORAGE_KEYS.token)
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser))
        setToken(savedToken)
      } catch (e) {
        sessionStorage.removeItem(STORAGE_KEYS.user)
        sessionStorage.removeItem(STORAGE_KEYS.token)
      }
    }
    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEYS.user)
    sessionStorage.removeItem(STORAGE_KEYS.token)
    // Also clear localStorage just in case any legacy entries exist
    localStorage.removeItem(STORAGE_KEYS.user)
    localStorage.removeItem(STORAGE_KEYS.token)
    setUser(null)
    setToken(null)
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
  }, [])

  // Auto logout after INACTIVITY_TIMEOUT_MS of no user interaction
  useEffect(() => {
    if (!user) return

    const handleInactivityTimeout = () => {
      logout()
      // Redirect to login on auto-logout
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    const resetTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = setTimeout(handleInactivityTimeout, INACTIVITY_TIMEOUT_MS)
    }

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
      'wheel',
      'visibilitychange',
    ]

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, resetTimer, { passive: true })
    })

    // Start timer immediately
    resetTimer()

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer))
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
    }
  }, [user, logout])

  const authenticatedFetch = async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token || sessionStorage.getItem(STORAGE_KEYS.token)}`,
      'Content-Type': options.body instanceof FormData ? undefined : (options.headers?.['Content-Type'] || 'application/json')
    }
    
    // Remove Content-Type if it's undefined (for FormData)
    if (!headers['Content-Type']) delete headers['Content-Type']

    const response = await fetch(url, { ...options, headers })
    if (response.status === 401) {
      logout()
      window.location.href = '/login'
      return null
    }
    return response
  }

  return (
    <AuthContext.Provider value={{ user, setUser, token, setToken, loading, logout, authenticatedFetch }}>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="servers" element={<Servers />} />
              <Route path="projects" element={<Projects />} />
              <Route path="logs" element={<Logs />} />
              <Route path="tmux/:sessionName" element={
                <ProtectedRoute>
                   <TmuxSession />
                </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute roles={['owner']}>
                   <Settings />
                </ProtectedRoute>
              } />
              <Route path="cloudflare" element={
                <ProtectedRoute roles={['owner']}>
                   <Cloudflare />
                </ProtectedRoute>
              } />
              <Route path="documentation" element={<Documentation />} />
              <Route path="deploy" element={
                <ProtectedRoute roles={['owner', 'admin']}>
                   <DeployProject />
                </ProtectedRoute>
              } />
              <Route path="projects/:project/files" element={
                <ProtectedRoute roles={['owner', 'admin']}>
                   <FileManager />
                </ProtectedRoute>
              } />
              <Route path="projects/:project/logs" element={
                <ProtectedRoute>
                   <ProjectLogs />
                </ProtectedRoute>
              } />
            </Route>
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
