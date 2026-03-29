import React, { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { setUser, setToken } = useContext(AuthContext)

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
        setUser(data.user)
        setToken(data.token)
        navigate('/dashboard')
      } else {
        setError(data.error || 'Identity verification failed')
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
            <div className="w-16 h-16 bg-gradient-to-tr from-primary to-primary-container rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-2xl shadow-primary/30 rotate-3 hover:rotate-0 transition-transform duration-500">
              <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
            </div>
            <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">ndelok.me</h1>
            <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-bold">Secure Infrastructure Node</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-5">
              <div className="group">
                <label className="block text-slate-500 text-[10px] font-black mb-2 ml-1 uppercase tracking-[0.2em]">Agent Identity</label>
                <div className="relative">
                   <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 group-focus-within:bg-primary/20 transition-all">
                      <span className="material-symbols-outlined text-slate-500 group-focus-within:text-primary transition-colors text-[18px]">person</span>
                   </div>
                   <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.05] rounded-2xl py-4 pl-14 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 focus:bg-black/60 transition-all placeholder:text-slate-800 font-medium"
                    placeholder="Enter agent username"
                    required
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-slate-500 text-[10px] font-black mb-2 ml-1 uppercase tracking-[0.2em]">Cryptographic Key</label>
                <div className="relative">
                   <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 group-focus-within:bg-primary/20 transition-all">
                      <span className="material-symbols-outlined text-slate-500 group-focus-within:text-primary transition-colors text-[18px]">lock</span>
                   </div>
                   <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.05] rounded-2xl py-4 pl-14 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 focus:bg-black/60 transition-all placeholder:text-slate-800 font-medium"
                    placeholder="••••••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-error/10 border border-error/20 text-error-container text-[10px] p-4 rounded-xl flex items-center animate-shake font-bold uppercase tracking-wider backdrop-blur-sm">
                <span className="material-symbols-outlined text-sm mr-3">report</span>
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-black text-[11px] uppercase tracking-[0.3em] py-5 rounded-2xl transition-all shadow-2xl shadow-primary/20 flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.97] border border-white/10"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>
                  <span>Initialize Session</span>
                  <span className="material-symbols-outlined text-lg group-hover:translate-x-1.5 transition-transform">arrow_forward</span>
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
