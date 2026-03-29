import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PageLoader from './components/PageLoader'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Servers = lazy(() => import('./pages/Servers'))
const Projects = lazy(() => import('./pages/Projects'))
const Logs = lazy(() => import('./pages/Logs'))
const Settings = lazy(() => import('./pages/Settings'))
const Documentation = lazy(() => import('./pages/Documentation'))
const DeployProject = lazy(() => import('./pages/DeployProject'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="servers" element={<Servers />} />
            <Route path="projects" element={<Projects />} />
            <Route path="logs" element={<Logs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="documentation" element={<Documentation />} />
            <Route path="deploy" element={<DeployProject />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
