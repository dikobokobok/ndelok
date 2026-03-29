import React, { Suspense, lazy, createContext, useContext, useState, useEffect } from 'react'
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
const Login = lazy(() => import('./pages/Login'))

export const AuthContext = createContext(null)

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

  useEffect(() => {
    const savedUser = localStorage.getItem('ndelok_user')
    const savedToken = localStorage.getItem('ndelok_token')
    if (savedUser && savedToken) {
      try { 
        setUser(JSON.parse(savedUser))
        setToken(savedToken)
      } catch (e) {
        localStorage.removeItem('ndelok_user')
        localStorage.removeItem('ndelok_token')
      }
    }
    setLoading(false)
  }, [])

  const logout = () => {
    localStorage.removeItem('ndelok_user')
    localStorage.removeItem('ndelok_token')
    setUser(null)
    setToken(null)
  }

  const authenticatedFetch = async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token || localStorage.getItem('ndelok_token')}`,
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
      <BrowserRouter>
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
              <Route path="settings" element={
                <ProtectedRoute roles={['owner']}>
                   <Settings />
                </ProtectedRoute>
              } />
              <Route path="documentation" element={<Documentation />} />
              <Route path="deploy" element={
                <ProtectedRoute roles={['owner', 'admin']}>
                   <DeployProject />
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
