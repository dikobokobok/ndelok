import { useState, useEffect } from 'react'
import StatusBadge from '../components/StatusBadge'
import socket from '../lib/socket'

const latency = [
  { region: 'Europe (Frankfurt)',   ms: 12,  color: 'bg-primary',   pct: 15, textColor: 'text-primary'  },
  { region: 'US East (N. Virginia)',ms: 84,  color: 'bg-primary',   pct: 45, textColor: 'text-primary'  },
  { region: 'Asia (Hong Kong)',     ms: 210, color: 'bg-tertiary',  pct: 85, textColor: 'text-tertiary' },
]

const bars = [40, 55, 30, 70, 45, 90, 60, 40, 85, 35]
const fills = [60, 40, 80, 50, 90, 30, 75, 20, 45, 65]

export default function Servers() {
  const [page, setPage] = useState(1)
  const [osStats, setOsStats] = useState(null)
  const [summary, setSummary] = useState({ total: 1, running: 1, health: 99.98 })

  useEffect(() => {
    socket.on('stats_update', (data) => {
      setOsStats(data.os)
      setSummary({
         total: data.projects.total,
         running: data.projects.running,
         health: data.health
      })
    })

    return () => {
      socket.off('stats_update')
    }
  }, [])

  let displayServers = []
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

      displayServers = [{
        id: 'local_node',
        name: osStats.hostname.toLowerCase().slice(0, 15) + (osStats.hostname.length > 15 ? '...' : ''),
        ip: ip,
        icon: 'dns',
        os: `${osStats.type === 'Windows_NT' ? 'Windows' : osStats.type} ${osStats.release}`,
        status: 'online',
        uptime: `${upDays}d ${upHours}h ${upMins}m`
      }]
  }

  return (
    <div className="p-8 space-y-10 max-w-[1600px] mx-auto animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2 uppercase tracking-widest font-bold">
            <span>Infrastructure</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">Edge Servers</span>
          </nav>
          <h2 className="text-4xl font-black tracking-tight text-on-surface">Instance Fleet</h2>
          <p className="text-slate-500 mt-2 max-w-xl text-sm">
            Monitor and manage high-performance compute nodes across 12 global regions.
          </p>
        </div>
        <div className="flex gap-4">
          {[
            { dot: 'bg-primary', label: 'Local Instances', val: summary.running.toString() },
            { dot: 'bg-tertiary', label: 'Avg Health',     val: summary.health.toFixed(2) + '%' },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-low p-4 rounded-xl flex items-center gap-4 min-w-[160px]">
              <div className={`w-2 h-2 rounded-full ${s.dot} glow-line`} />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-tighter font-bold">{s.label}</p>
                <p className="text-2xl font-black text-on-surface">{s.val}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Server Table */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden shadow-2xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                {['Server Instance', 'IPv4 Address', 'Operating System', 'Status', 'Uptime', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-4 text-[11px] uppercase tracking-widest text-slate-400 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {displayServers.map(s => (
                <tr key={s.id} className="hover:bg-surface-container transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center ${s.status === 'offline' ? 'text-slate-600' : 'text-primary'}`}>
                        <span className="material-symbols-outlined">{s.icon}</span>
                      </div>
                      <div>
                        <p className={`font-bold group-hover:text-primary transition-colors ${s.status === 'offline' ? 'text-slate-500' : 'text-on-surface'}`}>{s.name}</p>
                        <p className="text-[11px] text-slate-500 font-telemetry">ID: {s.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-telemetry text-sm text-slate-300">{s.ip}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-500 text-[18px]">terminal</span>
                      <span className="text-sm text-on-surface-variant">{s.os}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5"><StatusBadge status={s.status} /></td>
                  <td className="px-6 py-5 font-telemetry text-sm text-slate-400">{s.uptime}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                      <button title="SSH Terminal" className="p-2 hover:text-primary transition-colors"><span className="material-symbols-outlined text-[20px]">terminal</span></button>
                      <button title="Reboot" className="p-2 hover:text-tertiary transition-colors"><span className="material-symbols-outlined text-[20px]">restart_alt</span></button>
                      <button title="Settings" className="p-2 hover:text-on-surface transition-colors"><span className="material-symbols-outlined text-[20px]">settings</span></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="bg-surface-container-highest/30 px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Showing <span className="text-slate-300 font-bold">1</span> of <span className="text-slate-300 font-bold">1</span> active nodes
          </p>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {[1, 2, 3].map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${page === p ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-slate-300'}`}>
                {p}
              </button>
            ))}
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bento: Utilization + Latency */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-surface-container p-6 rounded-xl tonal-layering">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-on-surface">Fleet Resource Utilization</h3>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Real-time Global Aggregate</p>
            </div>
            <span className="material-symbols-outlined text-primary">analytics</span>
          </div>
          <div className="flex items-end gap-1 h-32">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 bg-primary/10 rounded-t-lg relative" style={{ height: `${h}%` }}>
                <div className="absolute bottom-0 w-full bg-primary/40 rounded-t-lg glow-line" style={{ height: `${fills[i]}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container p-6 rounded-xl tonal-layering flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-on-surface">Regional Latency</h3>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Connectivity Mesh</p>
          </div>
          <div className="space-y-4 my-6">
            {latency.map(l => (
              <div key={l.region}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300">{l.region}</span>
                  <span className={`text-xs font-telemetry ${l.textColor}`}>{l.ms}ms</span>
                </div>
                <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                  <div className={`h-full ${l.color} glow-line`} style={{ width: `${l.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <button className="text-[11px] text-primary font-bold uppercase tracking-widest flex items-center gap-2 hover:gap-3 transition-all">
            View Network Map
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  )
}
