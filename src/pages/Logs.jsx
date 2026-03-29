import { useState, useEffect, useRef, useContext } from 'react'
import { useSearchParams } from 'react-router-dom'
import socket from '../lib/socket'
import Terminal from '../components/Terminal'
import { AuthContext } from '../App'

const levelConfig = {
  ERROR:   { badge: 'bg-error/10 text-error',       dot: 'bg-error' },
  WARN:    { badge: 'bg-tertiary/10 text-tertiary',  dot: 'bg-tertiary' },
  INFO:    { badge: 'bg-primary/10 text-primary',    dot: 'bg-primary' },
  SUCCESS: { badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
}

const levels   = ['All', 'ERROR', 'WARN', 'INFO', 'SUCCESS']

export default function Logs() {
  const { user } = useContext(AuthContext)
  const [searchParams] = useSearchParams()
  const initProject = searchParams.get('project') || ''

  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [selLevel, setSelLevel] = useState('All')
  const [selService, setSelService] = useState(initProject || 'All')
  const [streaming, setStreaming] = useState(true)

  const streamingRef = useRef(streaming)
  useEffect(() => {
    streamingRef.current = streaming
  }, [streaming])

  useEffect(() => {
    fetch('/api/logs').then(r => r.json()).then(data => {
      setLogs(data)
    }).catch(e => console.error(e))

    socket.on('init_logs', (data) => {
      setLogs(data)
    })

    socket.on('new_log', (log) => {
      if (streamingRef.current) {
        setLogs(prev => [log, ...prev].slice(0, 5000))
      }
    })

    return () => {
      socket.off('init_logs')
      socket.off('new_log')
    }
  }, [])

  const filtered = logs.filter(l => {
    if (selLevel   !== 'All' && l.level   !== selLevel)   return false
    if (selService !== 'All' && l.service !== selService) return false
    
    if (search) {
      const q = search.toLowerCase()
      if (!l.msg.toLowerCase().includes(q) && !l.service.toLowerCase().includes(q)) return false
    }
    return true
  })

  const handleExport = () => {
    if (filtered.length === 0) return
    const textLines = filtered.map(l => `[${l.time}] [${l.level}] [${l.service}] ${l.msg}`).join('\n')
    const blob = new Blob([textLines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ndelok_logs_${selService === 'All' ? 'all_services' : selService.replace(/\s+/g, '_')}_${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2 uppercase tracking-widest font-bold">
            <span>Infrastructure</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">System Logs</span>
          </nav>
          <h2 className="text-4xl font-black tracking-tight text-on-surface">Log Stream</h2>
          <p className="text-slate-500 mt-2 text-sm">Aggregated log output from all services and nodes.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${streaming ? 'bg-primary/10 text-primary' : 'bg-surface-container text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${streaming ? 'bg-primary animate-pulse' : 'bg-slate-500'}`} />
            {streaming ? 'Live' : 'Paused'}
          </div>
          <button onClick={() => setStreaming(v => !v)}
            className="px-4 py-2 bg-surface-container-highest text-xs font-bold rounded-xl hover:text-primary transition-colors">
            {streaming ? 'Pause Stream' : 'Resume Stream'}
          </button>
          <button onClick={handleExport} disabled={filtered.length === 0 || user?.role === 'viewer'}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest text-xs font-bold rounded-xl hover:text-primary transition-colors disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed">
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export
          </button>
        </div>
      </div>

      <Terminal />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-surface-container p-4 rounded-xl">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[16px]">search</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            type="text" placeholder="Filter log messages..."
            className="w-full bg-surface-container-highest border-none rounded-lg py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={selLevel} onChange={e => setSelLevel(e.target.value)}
          className="bg-surface-container-highest border-none text-xs font-bold text-on-surface rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-primary">
          {levels.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={selService} onChange={e => setSelService(e.target.value)}
          className="bg-surface-container-highest border-none text-xs font-bold text-on-surface rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-primary">
          {['All', ...new Set([selService, ...logs.map(l => l.service)].filter(x => x !== 'All'))].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Log Entries */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden">
        <div className="bg-surface-container-lowest px-5 py-2 flex items-center gap-4 border-b border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold w-28">Timestamp</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold w-20">Level</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold w-32">Service</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold flex-1">Message</span>
        </div>
        <div className="divide-y divide-white/5 font-telemetry text-sm">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No log entries match your filters.</div>
          ) : filtered.map((l, i) => {
            const cfg = levelConfig[l.level]
            return (
              <div key={i} className="px-5 py-3.5 flex items-start gap-4 hover:bg-surface-container transition-colors group">
                <span className="text-slate-600 w-28 flex-shrink-0 text-[11px] pt-0.5">{l.time}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest w-20 flex-shrink-0 flex items-center gap-1 ${cfg.badge}`}>
                  <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />{l.level}
                </span>
                <span className="text-slate-400 w-32 flex-shrink-0 text-[11px] pt-0.5">{l.service}</span>
                <span className="text-on-surface-variant text-[12px] leading-relaxed">{l.msg}</span>
                <button className="ml-auto opacity-0 group-hover:opacity-100 text-slate-600 hover:text-white transition-all">
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="px-5 py-3 bg-surface-container-lowest border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
          <span>Showing {filtered.length} of {logs.length} entries</span>
          <span>Auto-refreshes every 5s · {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}
