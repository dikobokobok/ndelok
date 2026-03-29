import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      
      if (data.success) {
        localStorage.setItem('ndelok_user', JSON.stringify(data.user))
        localStorage.setItem('ndelok_token', data.token)
        navigate('/dashboard')
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Connection error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1115] flex items-center justify-center p-4 selection:bg-primary/30">
      {/* Background Orbs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
         <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full"></div>
         <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-tertiary/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="bg-surface-container/30 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-primary to-primary-container rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
              <span className="material-symbols-rounded text-white text-3xl">terminal</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Ndelok.me</h1>
            <p className="text-slate-400 text-sm">Secure Infrastructure Management</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="group">
                <label className="block text-slate-300 text-xs font-semibold mb-2 ml-1 uppercase tracking-wider">Username</label>
                <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-rounded text-slate-500 group-focus-within:text-primary transition-colors">person</span>
                   <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-surface-container-highest/50 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-surface-container-highest/80 transition-all placeholder:text-slate-600"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-slate-300 text-xs font-semibold mb-2 ml-1 uppercase tracking-wider">Password</label>
                <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-rounded text-slate-500 group-focus-within:text-primary transition-colors">lock</span>
                   <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-container-highest/50 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-surface-container-highest/80 transition-all placeholder:text-slate-600"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-error/10 border border-error/20 text-error-container text-xs p-3 rounded-lg flex items-center animate-shake">
                <span className="material-symbols-rounded text-sm mr-2">error</span>
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>
                  <span>Sign In</span>
                  <span className="material-symbols-rounded text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-slate-500 text-xs">
              &copy; 2026 Ndelok Infrastructure Dashboard
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
