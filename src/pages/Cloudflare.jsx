import { useState, useEffect, useContext, useRef } from 'react'
import { AuthContext } from '../App'
import Toast from '../components/Toast'

export default function Cloudflare() {
  const { authenticatedFetch, user } = useContext(AuthContext)
  const [loading, setLoading] = useState(true)
  const [tunnelEnabled, setTunnelEnabled] = useState(true)
  const [tunnelStatus, setTunnelStatus] = useState('Disconnected')
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [tunnelToken, setTunnelToken] = useState('')
  const [logs, setLogs] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  
  const logEndRef = useRef(null)

  const showToast = (type, title, msg) => {
    setToast({ type, title, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchStatus = async () => {
    try {
      const res = await authenticatedFetch('/api/cloudflare/status')
      if (!res?.ok) return
      const data = await res.json()
      setTunnelEnabled(data.enabled)
      setTunnelStatus(data.status)
      setTunnelUrl(data.url)
      setTunnelToken(data.token || '')
      setLogs(data.logs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const handleToggleTunnel = async (newVal) => {
    setSaving(true)
    try {
      const res = await authenticatedFetch('/api/cloudflare/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: newVal, token: tunnelToken })
      })
      if (!res?.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update tunnel state')
      }
      const data = await res.json()
      setTunnelEnabled(data.enabled)
      setTunnelStatus(data.status)
      setTunnelUrl(data.url)
      showToast(
        'success',
        newVal ? 'Tunnel Initiated' : 'Tunnel Terminated',
        newVal ? 'Cloudflare daemon starting up.' : 'Tunnel successfully stopped.'
      )
    } catch (err) {
      showToast('error', 'Execution Failure', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveToken = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await authenticatedFetch('/api/cloudflare/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: tunnelEnabled, token: tunnelToken })
      })
      if (!res?.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save token')
      }
      showToast('success', 'Token Synchronized', 'Cloudflare credentials updated successfully.')
      fetchStatus()
    } catch (err) {
      showToast('error', 'Configuration Error', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    if (!tunnelUrl) return
    navigator.clipboard.writeText(tunnelUrl)
    showToast('success', 'Address Copied', 'Tunnel URL copied to clipboard.')
  }

  const statusBadge = () => {
    switch (tunnelStatus) {
      case 'Connected':
        return (
          <span className="px-3 py-1 text-[10px] font-black rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest animate-pulse-slow">
            ONLINE
          </span>
        )
      case 'Connecting':
        return (
          <span className="px-3 py-1 text-[10px] font-black rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest animate-pulse">
            CONNECTING
          </span>
        )
      case 'Failed':
        return (
          <span className="px-3 py-1 text-[10px] font-black rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-widest">
            FAILED
          </span>
        )
      default:
        return (
          <span className="px-3 py-1 text-[10px] font-black rounded-lg bg-slate-500/10 text-slate-400 border border-white/5 uppercase tracking-widest">
            OFFLINE
          </span>
        )
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 min-h-screen bg-[#0f1115] text-slate-300">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500">
        
        {/* Header Navigation */}
        <section>
          <nav className="flex items-center gap-2 text-[10px] text-slate-500 mb-2 uppercase tracking-[0.2em] font-black">
            <span>Control Center</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary">Cloudflare Tunnel</span>
          </nav>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">Cloudflare Tunnel</h2>
          <p className="text-slate-500 text-xs sm:text-sm max-w-2xl">
            Securely expose your local Ndelok dashboard and workspaces to the internet without opening ports or configuring firewall rules.
          </p>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Interrogating Node status...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* Left Column: Config Panel */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Tunnel Status Card */}
              <div className="bg-surface-container/30 backdrop-blur-md border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-2xl rounded-full" />
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-orange-400">filter_drama</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">Tunnel Hub</h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">daemon control node</p>
                    </div>
                  </div>
                  {statusBadge()}
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-white/5">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Auto-Startup Tunnel</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={tunnelEnabled} 
                        disabled={saving} 
                        onChange={(e) => handleToggleTunnel(e.target.checked)} 
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${tunnelEnabled ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                        <div className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-all duration-200 ${tunnelEnabled ? 'translate-x-5 bg-white' : 'bg-slate-500'}`} />
                      </div>
                    </label>
                  </div>

                  {tunnelUrl && (
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block">Public Shareable Link</span>
                      <div className="flex items-center justify-between gap-3">
                        <a 
                          href={tunnelUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-primary font-bold hover:underline truncate"
                        >
                          {tunnelUrl}
                        </a>
                        <button 
                          onClick={handleCopy} 
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-primary/20 hover:text-primary text-slate-400 transition-colors shrink-0"
                        >
                          <span className="material-symbols-outlined text-[16px]">content_copy</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {!tunnelUrl && tunnelStatus === 'Connected' && (
                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Custom Tunnel Active</span>
                      <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                        Your custom domain mapped to this token is routing traffic directly to Ndelok dashboard.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tunnel Configuration Card */}
              <div className="bg-surface-container/30 backdrop-blur-md border border-white/5 rounded-3xl p-6 shadow-2xl">
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Credentials Config</h3>
                <form onSubmit={handleSaveToken} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cloudflare Tunnel Token</label>
                    <textarea
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      placeholder="Paste your cloudflared tunnel token here to map Ndelok to your custom Cloudflare DNS..."
                      rows={4}
                      className="w-full bg-[#0a0c10] border border-white/10 rounded-xl text-xs text-white p-3 focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-slate-600 font-telemetry resize-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Leave blank to automatically use Cloudflare's free quick tunnel (creates a random `*.trycloudflare.com` subdomain on startup).
                  </p>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-gradient-to-r from-primary to-primary-border text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                    )}
                    Save and Apply Config
                  </button>
                </form>
              </div>

            </div>

            {/* Right Column: Console Logs */}
            <div className="lg:col-span-7 flex flex-col h-[520px] bg-surface-container/20 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
              {/* Log Header */}
              <div className="px-6 py-4 bg-[#0a0c12]/50 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Console Terminal Logs</span>
                </div>
                <button 
                  onClick={() => setLogs([])}
                  className="text-[9px] text-slate-500 hover:text-white font-bold uppercase tracking-wider transition-colors"
                >
                  Clear logs
                </button>
              </div>
              
              {/* Log Window */}
              <div className="flex-1 p-5 overflow-y-auto bg-[#06080e] font-mono text-[11px] leading-relaxed text-slate-400 custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
                    <span className="material-symbols-outlined text-2xl">receipt_long</span>
                    <p className="font-sans text-[10px] uppercase font-bold tracking-widest">No console logs recorded</p>
                  </div>
                ) : (
                  <div className="space-y-1 whitespace-pre-wrap break-all">
                    {logs.map((log, i) => (
                      <div key={i} className={log.includes('[ERROR]') ? 'text-rose-400' : log.includes('[SYSTEM]') ? 'text-primary' : 'text-slate-400'}>
                        {log}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
      
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
