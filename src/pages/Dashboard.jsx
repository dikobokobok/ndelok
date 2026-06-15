import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import React, { useState, useEffect, useContext, useRef, useMemo } from 'react'
import socket from '../lib/socket'
import { AuthContext } from '../App'

const AnimatedGauge = React.memo(function AnimatedGauge({ value, max, label, unit, icon, color, sub }) {
  const [animVal, setAnimVal] = useState(0)
  const r = 72
  const circumference = 2 * Math.PI * r
  const pct = Math.min(value / max, 1)
  const offset = circumference * (1 - pct)

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimVal(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])

  const val = Math.round(value)

  return (
    <div className="bg-surface-container-low p-4 sm:p-6 rounded-xl flex flex-col items-center border border-white/5">
      <div className="relative w-[120px] h-[120px] sm:w-[140px] sm:h-[140px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
          <circle cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - animVal)}
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 0.5s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl sm:text-3xl font-black text-white">{val}{unit}</span>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{label}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        <span className="material-symbols-outlined text-[14px]" style={{ color }}>{icon}</span>
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{sub}</span>
      </div>
    </div>
  )
})

const CpuCoreBar = React.memo(function CpuCoreBar({ core, usage }) {
  const color = usage > 80 ? '#ef4444' : usage > 60 ? '#f59e0b' : '#4d8eff'
  return (
    <div className="flex items-center gap-2 sm:gap-3 group">
      <span className="text-[9px] font-bold text-slate-500 w-6 sm:w-8 font-telemetry">CPU{core}</span>
      <div className="flex-1 h-5 sm:h-6 bg-[#0a0f1d] rounded-md overflow-hidden border border-white/5 relative">
        <div className="h-full rounded-md transition-all duration-500 ease-out relative"
          style={{ width: `${usage}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
      <span className="text-[10px] font-bold font-telemetry w-8 text-right" style={{ color }}>{usage}%</span>
    </div>
  )
})

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec || bytesPerSec === 0) return '0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1048576).toFixed(2)} MB/s`
}

const colorMap = {
  error:   { bg: 'bg-error/10',    text: 'text-error' },
  tertiary:{ bg: 'bg-tertiary/10', text: 'text-tertiary' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
}

const loadColor = { healthy: 'bg-emerald-500', latency: 'bg-tertiary', lost: 'bg-error' }
const categoryIcon = {
  Security:   'shield_lock', Deployment: 'rocket_launch', System: 'settings_suggest',
  Traffic:    'router',      Management: 'person_add',    Process: 'memory',
  Audit:      'history_edu', General:    'notes',
}

export default function Dashboard() {
  const { user, authenticatedFetch } = useContext(AuthContext)
  const [osStats, setOsStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [summary, setSummary] = useState({ total: 0, running: 0, stopped: 0, warnings: 0, health: 99.9 })

  useEffect(() => {
    authenticatedFetch('/api/logs').then(r => r?.json()).then(data => data && setLogs(data)).catch(() => {})

    const fetchStats = () => {
      authenticatedFetch('/api/stats').then(r => r?.json()).then(data => {
        if (data?.os) setOsStats(data.os)
        if (data?.projects) setSummary({
          total: data.projects.total, running: data.projects.running,
          stopped: data.projects.stopped, warnings: data.projects.warnings,
          health: data.health
        })
      }).catch(() => {})
    }
    fetchStats()
    const pollId = setInterval(fetchStats, 10000)

    socket.on('init_logs', (data) => setLogs(data))
    socket.on('new_log', (log) => setLogs(prev => [log, ...prev].slice(0, 5000)))
    socket.on('stats_update', (data) => {
      if (data?.os) setOsStats(data.os)
      if (data?.projects) setSummary({
        total: data.projects.total, running: data.projects.running,
        stopped: data.projects.stopped, warnings: data.projects.warnings,
        health: data.health
      })
    })
    return () => {
      clearInterval(pollId)
      socket.off('init_logs'); socket.off('new_log'); socket.off('stats_update')
    }
  }, [])

  const firstName = user?.name?.split(' ')[0] || 'User'
  const memPct = osStats ? Math.round((osStats.memUsed / osStats.memTotal) * 100) : 0
  const diskPct = osStats ? Math.round((osStats.diskUsed / osStats.diskTotal) * 100) : 0
  const upDays = osStats ? Math.floor(osStats.uptime / 86400) : 0
  const upHours = osStats ? Math.floor((osStats.uptime % 86400) / 3600) : 0
  const upMins = osStats ? Math.floor((osStats.uptime % 3600) / 60) : 0
  const cpuCores = osStats?.cpuCores || []

  const recentActivity = logs.slice(0, 4)

  let displayInfra = []
  if (osStats) {
    let ip = '127.0.0.1'
    if (osStats.netInterfaces) {
      for (const nets of Object.values(osStats.netInterfaces)) {
        for (const net of nets) {
          if ((net.family === 'IPv4' || net.family === 4) && !net.internal) { ip = net.address; break }
        }
      }
    }
    displayInfra = [{
      name: osStats.hostname.toLowerCase().slice(0, 15) + (osStats.hostname.length > 15 ? '...' : ''),
      ip, location: 'Local Network', status: osStats.cpuUsage > 85 ? 'latency' : 'healthy',
      uptime: `${upDays}d ${upHours}h ${upMins}m`, load: Math.round(osStats.cpuUsage)
    }]
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 sm:space-y-8 animate-in transition-all text-on-surface">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Monitoring Center</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Real-time resource telemetry & system observability</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-highest border border-white/5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
          </div>
          <span className="text-[10px] font-telemetry text-slate-500">
            {osStats ? `${osStats.hostname.toUpperCase()} · ${osStats.platform.toUpperCase()}` : '...'}
          </span>
        </div>
      </div>

      {/* Top Row: 3 Gauges + Health Card */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        <AnimatedGauge value={osStats?.cpuUsage || 0} max={100} label="CPU" unit="%" icon="speed"
          color={osStats?.cpuUsage > 80 ? '#ef4444' : osStats?.cpuUsage > 60 ? '#f59e0b' : '#4d8eff'}
          sub={osStats ? `${osStats.cores} Cores` : '...'} />
        <AnimatedGauge value={memPct} max={100} label="RAM" unit="%" icon="memory"
          color={memPct > 80 ? '#ef4444' : memPct > 60 ? '#f59e0b' : '#06b6d4'}
          sub={osStats ? `${(osStats.memUsed / 1e9).toFixed(1)} / ${(osStats.memTotal / 1e9).toFixed(1)} GB` : '...'} />
        <AnimatedGauge value={diskPct} max={100} label="STORAGE" unit="%" icon="storage"
          color={diskPct > 85 ? '#ef4444' : diskPct > 70 ? '#f59e0b' : '#8b5cf6'}
          sub={osStats ? `${(osStats.diskUsed / 1e9).toFixed(1)} / ${(osStats.diskTotal / 1e9).toFixed(1)} GB` : '...'} />

        {/* Health summary card */}
        <div className="col-span-2 lg:col-span-1 bg-surface-container-low p-5 sm:p-6 rounded-xl flex flex-col justify-between border border-white/5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Global Health</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-primary">{summary.health.toFixed(1)}%</h2>
            <div className="flex gap-3 mt-3 text-[10px] font-bold">
              <span className="text-emerald-400">{summary.running} running</span>
              <span className="text-slate-600">|</span>
              <span className="text-tertiary">{summary.warnings} warnings</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
            <span className="material-symbols-outlined text-[14px] text-slate-500">schedule</span>
            <span className="text-[10px] font-telemetry text-slate-400">Uptime: {upDays}d {upHours}h {upMins}m</span>
          </div>
        </div>
      </div>

      {/* Middle: Per-Core CPU + Network + Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Per-Core CPU */}
        <div className="lg:col-span-2 bg-surface-container-low p-4 sm:p-6 rounded-xl border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Per-Core CPU Utilization</h3>
            <span className="text-[10px] text-slate-500 font-telemetry">{cpuCores.length} Cores</span>
          </div>
          <div className="space-y-2 sm:space-y-2.5">
            {cpuCores.length > 0 ? cpuCores.map(c => (
              <CpuCoreBar key={c.core} core={c.core} usage={c.usage} />
            )) : (
              <div className="flex items-center justify-center h-32 text-slate-500 text-[11px]">
                <span className="material-symbols-outlined text-lg mr-2">info</span>
                Collecting per-core data...
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">Total Load:</span>
              <span className="text-sm font-bold text-white">{osStats?.cpuUsage || 0}%</span>
            </div>
            <span className="text-[9px] text-slate-600 font-telemetry">{osStats?.cpuModel || ''}</span>
          </div>
        </div>

        {/* Right sidebar: Network + Quick stats */}
        <div className="space-y-4">
          <div className="bg-surface-container-low p-4 sm:p-6 rounded-xl border border-white/5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Network I/O</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                  <span className="font-bold">Download</span>
                  <span className="font-telemetry">{formatSpeed(osStats?.netSpeed?.download)}</span>
                </div>
                <div className="h-2 bg-[#0a0f1d] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-500 transition-all duration-700" style={{
                    width: `${Math.min(100, ((osStats?.netSpeed?.download || 0) / (125 * 1024 * 1024)) * 100)}%`,
                    boxShadow: '0 0 8px #06b6d440'
                  }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                  <span className="font-bold">Upload</span>
                  <span className="font-telemetry">{formatSpeed(osStats?.netSpeed?.upload)}</span>
                </div>
                <div className="h-2 bg-[#0a0f1d] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{
                    width: `${Math.min(100, ((osStats?.netSpeed?.upload || 0) / (125 * 1024 * 1024)) * 100)}%`,
                    boxShadow: '0 0 8px #4d8eff40'
                  }} />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="Projects" value={summary.total.toString()} trend="Total deployed" icon="rocket_launch" iconBg="bg-primary/10" iconColor="text-primary" />
            <StatCard title="Online" value={summary.running.toString()} trend="Running now" icon="dns" iconBg="bg-emerald-500/10" iconColor="text-emerald-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="Warnings" value={summary.warnings.toString()} trend="Needs attention" trendIcon="warning" icon="emergency_home" iconBg="bg-tertiary/10" iconColor="text-tertiary" />
            <StatCard title="Offline" value={summary.stopped.toString()} trend="Stopped or failed" trendIcon="cloud_off" icon="dangerous" iconBg="bg-error/10" iconColor="text-error" />
          </div>
        </div>
      </div>

      {/* Bottom: Storage Breakdown + Recent Activity + Infrastructure */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Storage Breakdown */}
        <div className="bg-surface-container-low p-4 sm:p-6 rounded-xl border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Storage Breakdown</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="font-bold text-slate-400">Used</span>
                <span className="font-telemetry text-slate-300">{osStats ? `${(osStats.diskUsed / 1e9).toFixed(1)} GB` : '...'}</span>
              </div>
              <div className="h-3 bg-[#0a0f1d] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-violet-500 transition-all duration-700"
                  style={{ width: `${diskPct}%`, boxShadow: '0 0 8px #8b5cf640' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="font-bold text-slate-400">Free</span>
                <span className="font-telemetry text-slate-300">{osStats ? `${((osStats.diskTotal - osStats.diskUsed) / 1e9).toFixed(1)} GB` : '...'}</span>
              </div>
              <div className="h-3 bg-[#0a0f1d] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${100 - diskPct}%`, boxShadow: '0 0 8px #10b98140' }} />
              </div>
            </div>
            <div className="pt-4 border-t border-white/5 flex justify-between text-[10px]">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Total Capacity</span>
              <span className="font-telemetry text-white font-bold">{osStats ? `${(osStats.diskTotal / 1e9).toFixed(1)} GB` : '...'}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-surface-container-low p-4 sm:p-6 rounded-xl border border-white/5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Activity</h3>
            <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-white text-[18px]">history</span>
          </div>
          <div className="flex-1 space-y-3">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-8">
                <span className="material-symbols-outlined text-3xl mb-2 opacity-50">event_note</span>
                <p className="text-[10px] font-bold">No activity recorded</p>
              </div>
            ) : recentActivity.map((a, i) => {
              const icon = categoryIcon[a.category] || 'notes'
              const levelCol = a.level === 'ERROR' ? 'text-error' : a.level === 'WARN' ? 'text-tertiary' : 'text-primary'
              return (
                <div key={i} className="flex gap-3 group relative">
                  <div className={`w-7 h-7 rounded-lg bg-[#0a0f1d] flex items-center justify-center flex-shrink-0 border border-white/5 ${levelCol}`}>
                    <span className="material-symbols-outlined text-[14px]">{icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">{a.service}</p>
                      <span className="text-[8px] font-telemetry text-slate-600 flex-shrink-0">{a.time}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-1">{a.msg}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <a href="/logs" className="mt-4 w-full py-2 text-[10px] font-bold text-primary hover:bg-primary/5 rounded-lg transition-all border border-primary/10 text-center flex items-center justify-center gap-1.5 group">
            Audit Control Center
            <span className="material-symbols-outlined text-[14px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </a>
        </div>

        {/* Infrastructure Status */}
        <div className="bg-surface-container-low rounded-xl border border-white/5 overflow-hidden">
          <div className="p-4 sm:p-6 flex items-center justify-between border-b border-white/5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Infrastructure</h3>
          </div>
          {displayInfra.length > 0 ? (
            <div className="p-4 space-y-3">
              {displayInfra.map(s => (
                <div key={s.name} className="p-4 bg-[#0a0f1d] rounded-xl border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${loadColor[s.status]}`} style={{ boxShadow: '0 0 8px currentColor' }} />
                    <div>
                      <p className="text-sm font-bold text-white">{s.name}</p>
                      <p className="text-[9px] text-slate-500 font-telemetry">{s.ip}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[8px] text-slate-600 uppercase font-bold mb-1">Status</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-600 uppercase font-bold mb-1">Uptime</p>
                      <p className="text-[11px] font-telemetry text-slate-400">{s.uptime}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-600 uppercase font-bold mb-1">Load</p>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-[#0a0f1d] rounded-full overflow-hidden">
                          <div className={`h-full ${loadColor[s.status]}`} style={{ width: `${s.load}%` }} />
                        </div>
                        <span className="text-[10px] font-telemetry text-slate-400">{s.load}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <span className="material-symbols-outlined text-3xl opacity-50">dns</span>
              <p className="text-[10px] font-bold mt-2">Waiting for data...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}