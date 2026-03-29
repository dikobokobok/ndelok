import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import React, { useState, useEffect } from 'react'
import socket from '../lib/socket'

const cpuPoints = [180, 160, 190, 140, 170, 120, 150, 80, 110, 60, 90, 40]
const W = 1000
const H = 220

function CpuChart({ currentUsage }) {
  const [points, setPoints] = useState(cpuPoints)
  const usageRef = React.useRef(currentUsage)

  useEffect(() => {
    usageRef.current = currentUsage
  }, [currentUsage])

  useEffect(() => {
    const id = setInterval(() => {
      setPoints(prev => {
        let newVal;
        const usage = usageRef.current
        if (usage !== null && usage !== undefined) {
          // currentUsage is 0-100. Y axis is 0 at top, 220 at bottom.
          // 100% usage -> y = 20. 0% usage -> y = 200.
          newVal = 200 - (usage * 1.8)
        } else {
          newVal = Math.max(20, Math.min(200, prev[prev.length - 1] + (Math.random() - 0.5) * 30))
        }
        return [...prev.slice(1), newVal]
      })
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const step = W / (points.length - 1)
  const d = points.map((y, i) => `${i === 0 ? 'M' : 'L'}${i * step},${y}`).join(' ')
  const areaD = `${d} L${W},${H} L0,${H} Z`

  return (
    <div className="h-56 relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="cpuGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#adc6ff" />
            <stop offset="100%" stopColor="#4d8eff" />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#adc6ff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#adc6ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid lines */}
        {[0, 55, 110, 165].map(y2 => (
          <line key={y2} x1="0" y1={y2} x2={W} y2={y2} stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        ))}
        <path d={areaD} fill="url(#areaGrad)" />
        <path d={d} fill="none" stroke="url(#cpuGradient)" strokeWidth="3" className="glow-line text-primary" style={{ filter: 'drop-shadow(0 0 6px #adc6ff)' }} />
      </svg>
    </div>
  )
}



const colorMap = {
  error:   { bg: 'bg-error/10',    text: 'text-error' },
  tertiary:{ bg: 'bg-tertiary/10', text: 'text-tertiary' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
}


const loadColor = { healthy: 'bg-emerald-500', latency: 'bg-tertiary', lost: 'bg-error' }

export default function Dashboard() {
  const [osStats, setOsStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [summary, setSummary] = useState({ total: 0, running: 0, stopped: 0, warnings: 0, health: 99.9 })

  useEffect(() => {
    fetch('/api/logs').then(r => r.json()).then(data => setLogs(data)).catch(console.error)

    socket.on('init_logs', (data) => setLogs(data))
    socket.on('new_log', (log) => setLogs(prev => [log, ...prev].slice(0, 5000)))
    
    socket.on('stats_update', (data) => {
      setOsStats(data.os)
      setSummary({
        total: data.projects.total,
        running: data.projects.running,
        stopped: data.projects.stopped,
        warnings: data.projects.warnings,
        health: data.health
      })
    })

    return () => {
      socket.off('init_logs')
      socket.off('new_log')
      socket.off('stats_update')
    }
  }, [])

  let displayInfra = []
  if (osStats) {
      let ip = '127.0.0.1'
      if (osStats.netInterfaces) {
        for (const nets of Object.values(osStats.netInterfaces)) {
          for (const net of nets) {
            if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
              ip = net.address
              break
            }
          }
        }
      }
      
      const upDays = Math.floor(osStats.uptime / 86400)
      const upHours = Math.floor((osStats.uptime % 86400) / 3600)
      const upMins = Math.floor((osStats.uptime % 3600) / 60)

      displayInfra = [{
        name: osStats.hostname.toLowerCase().slice(0, 15) + (osStats.hostname.length > 15 ? '...' : ''),
        ip: ip,
        location: 'Local Network',
        status: osStats.cpuUsage > 85 ? 'latency' : 'healthy',
        uptime: `${upDays}d ${upHours}h ${upMins}m`,
        load: Math.round(osStats.cpuUsage)
      }]
  }

  const criticalLogs = logs.filter(l => l.level === 'ERROR' || l.level === 'WARN').slice(0, 3)

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Big health card */}
        <div className="lg:col-span-1 bg-surface-container-low p-7 rounded-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Global Health</p>
            <h2 className="text-4xl font-extrabold text-primary">{summary.health.toFixed(1)}%</h2>
            <p className="text-xs text-slate-400 mt-2">Aggregated health across {summary.total} local projects.</p>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="material-symbols-outlined text-9xl" style={{ fontVariationSettings: "'FILL' 1" }}>public</span>
          </div>
        </div>
        <StatCard title="Online Servers" value={summary.running.toString()} trend="Currently running" trendIcon="trending_up" icon="dns"           iconBg="bg-emerald-500/10" iconColor="text-emerald-400" />
        <StatCard title="Warnings"       value={summary.warnings.toString()}  trend="Needs attention" trendIcon="warning"     icon="emergency_home"  iconBg="bg-tertiary/10"    iconColor="text-tertiary" />
        <StatCard title="Offline"        value={summary.stopped.toString()}   trend="Stopped or failed" trendIcon="cloud_off" icon="dangerous"    iconBg="bg-error/10"       iconColor="text-error" />
      </div>

      {/* Bento Grid: Chart + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CPU Chart */}
        <div className="lg:col-span-2 bg-surface-container p-8 rounded-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-on-surface">Global CPU Utilization</h3>
              <p className="text-xs text-slate-500">Real-time aggregate across all nodes</p>
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-1 rounded bg-surface-container-highest text-[10px] font-bold text-primary tracking-tighter uppercase">Live View</span>
              <span className="px-2 py-1 rounded bg-white/5 text-[10px] font-bold text-slate-400 tracking-tighter uppercase">24h History</span>
            </div>
          </div>
          <CpuChart currentUsage={osStats ? osStats.cpuUsage : null} />
          <div className="flex justify-between mt-6 pt-6 border-t border-white/5">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500">Average</p>
                <p className="text-xl font-bold text-on-surface">42.8%</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500">Peak</p>
                <p className="text-xl font-bold text-on-surface">88.1%</p>
              </div>
            </div>
            <div className="flex -space-x-2">
              {['US', 'EU', 'AS'].map(r => (
                <div key={r} className="w-8 h-8 rounded-full border-2 border-surface-container bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-on-surface">{r}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Critical Events */}
        <div className="bg-surface-container p-8 rounded-xl flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-on-surface">Critical Events</h3>
            <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-white">more_vert</span>
          </div>
          <div className="flex-1 space-y-3">
            {criticalLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-4">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                <p className="text-xs font-bold">No Critical Events</p>
              </div>
            ) : criticalLogs.map((a, i) => {
              const c = colorMap[a.level.toLowerCase()] || colorMap.error
              return (
                <div key={i} className="p-4 rounded-xl bg-surface-container-low hover:bg-surface-container-highest transition-colors">
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-lg ${c.bg} ${c.text} h-fit`}>
                      <span className="material-symbols-outlined text-sm">{a.level === 'ERROR' ? 'error' : 'warning'}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-bold text-on-surface">{a.service}</p>
                        <span className="text-[10px] text-slate-500">{a.time}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{a.msg}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <button className="mt-4 w-full py-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors border border-primary/10">
            View All Logs
          </button>
        </div>
      </div>

      {/* Telemetry Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { 
            icon: 'storage', title: 'Storage Pool', 
            val: osStats ? `${(osStats.diskUsed / 1e9).toFixed(1)} GB / ${(osStats.diskTotal / 1e9).toFixed(1)} GB` : '...', 
            pct: osStats ? Math.round((osStats.diskUsed / osStats.diskTotal) * 100) : 0,  
            color: 'bg-primary', 
            label: osStats ? `${osStats.platform.toUpperCase()}_DRIVE` : '...', 
            sub: osStats ? `${Math.round((osStats.diskUsed / osStats.diskTotal) * 100)}% USED` : '...' 
          },
          { 
            icon: 'memory', title: 'Total Memory', 
            val: osStats ? `${(osStats.memUsed / 1e9).toFixed(1)} GB / ${(osStats.memTotal / 1e9).toFixed(1)} GB` : '...', 
            pct: osStats ? Math.round((osStats.memUsed / osStats.memTotal) * 100) : 0, 
            color: 'bg-primary-container', 
            label: osStats ? osStats.hostname.toUpperCase() : '...', 
            sub: osStats ? `${Math.round((osStats.memUsed / osStats.memTotal) * 100)}% USED` : '...' 
          },
          { 
            icon: 'speed', title: 'CPU Utilization', 
            val: osStats ? `${osStats.cpuUsage}% Load` : '...', 
            pct: osStats ? osStats.cpuUsage : 0,  
            color: 'bg-tertiary', 
            label: osStats ? osStats.cpuModel.slice(0, 22) + (osStats.cpuModel.length > 22 ? '...' : '') : '...', 
            sub: osStats ? `${osStats.cores} CORES` : '...' 
          },
        ].map(t => (
          <div key={t.title} className="bg-surface-container-low p-6 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">{t.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.title}</span>
              </div>
              <span className="text-xs font-telemetry text-on-surface">{t.val}</span>
            </div>
            <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
              <div className={`h-full ${t.color} rounded-full`} style={{ width: `${t.pct}%` }} />
            </div>
            <div className="mt-4 flex justify-between text-[10px] text-slate-500 font-bold">
              <span>{t.label}</span>
              <span>{t.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Infrastructure Table */}
      <div className="bg-surface-container rounded-xl overflow-hidden">
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <h3 className="text-lg font-bold text-on-surface">Infrastructure Status</h3>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-surface-container-highest text-xs font-bold hover:text-primary transition-colors">Export Report</button>
            <button className="px-3 py-1.5 rounded-lg bg-surface-container-highest text-xs font-bold hover:text-primary transition-colors">Settings</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr>
                {['Node Name', 'Location', 'Status', 'Uptime', 'Load', 'Actions'].map(h => (
                  <th key={h} className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-500 font-black">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayInfra.map(s => (
                <tr key={s.name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${loadColor[s.status]}`} style={{ boxShadow: `0 0 8px currentColor` }} />
                      <div>
                        <p className="text-sm font-bold text-on-surface">{s.name}</p>
                        <p className="text-[10px] text-slate-500 font-telemetry">{s.ip}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm text-slate-400">{s.location}</td>
                  <td className="px-8 py-5"><StatusBadge status={s.status} /></td>
                  <td className="px-8 py-5 text-sm font-telemetry text-slate-400">{s.uptime}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-surface-container rounded-full overflow-hidden">
                        <div className={`h-full ${loadColor[s.status]}`} style={{ width: `${s.load}%` }} />
                      </div>
                      <span className="text-xs font-telemetry text-slate-400">{s.load}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <button className="material-symbols-outlined text-slate-500 hover:text-white transition-colors">open_in_new</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-5 bg-surface-container-low flex justify-center">
          <button className="text-xs font-bold text-slate-500 hover:text-primary transition-colors flex items-center gap-2">
            View Full Infrastructure List
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>

    </div>
  )
}
