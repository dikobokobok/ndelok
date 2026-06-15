import { useState, useEffect, useContext, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../App'
import StatusBadge from '../components/StatusBadge'
import PasswordInput from '../components/PasswordInput'
import TmuxPlugin from '../components/TmuxPlugin'
import socket from '../lib/socket'

export default function Servers() {
  const { authenticatedFetch, user } = useContext(AuthContext)
  const [powerModal, setPowerModal] = useState(null)
  const [powerPassword, setPowerPassword] = useState('')
  const [powerLoading, setPowerLoading] = useState(false)
  const [powerError, setPowerError] = useState('')

  const handlePower = async (e) => {
    e.preventDefault()
    if (!powerPassword.trim()) { setPowerError('Password wajib diisi.'); return }
    setPowerLoading(true)
    setPowerError('')
    try {
      const res = await authenticatedFetch('/api/system/power', {
        method: 'POST',
        body: JSON.stringify({ action: powerModal, password: powerPassword })
      })
      if (!res?.ok) {
        const data = await res.json()
        setPowerError(data.error || 'Gagal')
        setPowerLoading(false)
        return
      }
      setPowerError('')
      setPowerModal(null)
    } catch (e) {
      setPowerError(e.message)
      setPowerLoading(false)
    }
  }

  // ── Resource Optimizer States & Actions ───────────────────────────
  const [cpuOptimizing, setCpuOptimizing] = useState(false)
  const [cpuSuccess, setCpuSuccess] = useState(false)
  const [ramOptimizing, setRamOptimizing] = useState(false)
  const [ramFreedInfo, setRamFreedInfo] = useState('')
  const [storageCleaning, setStorageCleaning] = useState(false)
  const [storageFreedInfo, setStorageFreedInfo] = useState('')

  const optimizeCpu = async () => {
    setCpuOptimizing(true)
    setCpuSuccess(false)
    try {
      const res = await authenticatedFetch('/api/system/optimize-cpu', { method: 'POST' })
      if (res?.ok) {
        setCpuSuccess(true)
        setTimeout(() => setCpuSuccess(false), 5000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCpuOptimizing(false)
    }
  }

  const cleanRam = async () => {
    setRamOptimizing(true)
    setRamFreedInfo('')
    try {
      const res = await authenticatedFetch('/api/system/clean-ram', { method: 'POST' })
      if (res?.ok) {
        const data = await res.json()
        const freedMB = (data.freed / (1024 * 1024)).toFixed(0)
        setRamFreedInfo(`Freed ${freedMB} MB RAM`)
        setTimeout(() => setRamFreedInfo(''), 6000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRamOptimizing(false)
    }
  }

  const cleanStorage = async () => {
    setStorageCleaning(true)
    setStorageFreedInfo('')
    try {
      const res = await authenticatedFetch('/api/system/clean-storage', { method: 'POST' })
      if (res?.ok) {
        const data = await res.json()
        const freedMB = (data.freed / (1024 * 1024)).toFixed(1)
        setStorageFreedInfo(`Freed ${freedMB} MB Disk`)
        setTimeout(() => setStorageFreedInfo(''), 6000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setStorageCleaning(false)
    }
  }

  const [page, setPage] = useState(1)
  const [osStats, setOsStats] = useState(null)
  const [summary, setSummary] = useState({ total: 1, running: 1, health: 99.98 })

  // ── ZeroTier State ────────────────────────────────────────────────
  const [zt, setZt] = useState({ networks: [], serviceRunning: true })
  const [ztLoading, setZtLoading] = useState(true)
  const [ztActionLoading, setZtActionLoading] = useState(false)
  const [ztError, setZtError] = useState('')

  // Modals
  const [joinModal, setJoinModal] = useState(false)
  const [joinNetworkId, setJoinNetworkId] = useState('')
  const [leaveModal, setLeaveModal] = useState(null) // network object
  const [leavePassword, setLeavePassword] = useState('')

  const fetchZtStatus = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/zerotier/status')
      if (!res?.ok) return
      const data = await res.json()
      setZt(data)
    } catch (e) {
      // silent
    } finally {
      setZtLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    const fetchStats = () => {
      authenticatedFetch('/api/stats').then(r => r?.json()).then(data => {
        if (data?.os) setOsStats(data.os)
        if (data?.projects) setSummary({
          total: data.projects.total, running: data.projects.running,
          health: data.health
        })
      }).catch(() => {})
    }
    fetchStats()
    const pollId = setInterval(fetchStats, 10000)

    socket.on('stats_update', (data) => {
      if (data?.os) setOsStats(data.os)
      if (data?.projects) setSummary({
         total: data.projects.total,
         running: data.projects.running,
         health: data.health
      })
    })

    return () => {
      clearInterval(pollId)
      socket.off('stats_update')
    }
  }, [authenticatedFetch])

  useEffect(() => {
    fetchZtStatus()
    const id = setInterval(fetchZtStatus, 30000)
    return () => clearInterval(id)
  }, [fetchZtStatus])

  const toggleZtService = async () => {
    setZtActionLoading(true)
    setZtError('')
    try {
      const res = await authenticatedFetch('/api/zerotier/service', {
        method: 'POST',
        body: JSON.stringify({ action: zt.serviceRunning ? 'stop' : 'start' })
      })
      const data = await res.json()
      if (!res.ok) { setZtError(data.error || 'Gagal mengubah status service'); return }
      await fetchZtStatus()
    } catch (e) {
      setZtError(e.message)
    } finally {
      setZtActionLoading(false)
    }
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    setZtError('')
    const cleanId = joinNetworkId.trim().toLowerCase()
    if (!/^[a-f0-9]{16}$/.test(cleanId)) {
      setZtError('Network ID harus 16 karakter hex (0-9, a-f)')
      return
    }
    setZtActionLoading(true)
    try {
      const res = await authenticatedFetch('/api/zerotier/join', {
        method: 'POST',
        body: JSON.stringify({ networkId: cleanId })
      })
      const data = await res.json()
      if (!res.ok) { setZtError(data.error || 'Gagal join network'); return }
      setJoinModal(false)
      setJoinNetworkId('')
      await fetchZtStatus()
    } catch (e) {
      setZtError(e.message)
    } finally {
      setZtActionLoading(false)
    }
  }

  const handleLeave = async (e) => {
    e.preventDefault()
    setZtError('')
    if (!leavePassword.trim()) { setZtError('Password wajib diisi'); return }
    setZtActionLoading(true)
    try {
      const res = await authenticatedFetch('/api/zerotier/leave', {
        method: 'POST',
        body: JSON.stringify({ networkId: leaveModal.id, password: leavePassword })
      })
      const data = await res.json()
      if (!res.ok) { setZtError(data.error || 'Gagal leave network'); return }
      setLeaveModal(null)
      setLeavePassword('')
      await fetchZtStatus()
    } catch (e) {
      setZtError(e.message)
    } finally {
      setZtActionLoading(false)
    }
  }

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

  const isOwner = user?.role === 'owner'
  const hasNetworks = zt.networks && zt.networks.length > 0

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 lg:space-y-10 max-w-[1600px] mx-auto animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 sm:gap-6">
        <div>
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2 uppercase tracking-widest font-bold">
            <span>Infrastructure</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">Servers</span>
          </nav>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-on-surface">Servers & Plugins</h2>
          <p className="text-slate-500 mt-2 max-w-xl text-xs sm:text-sm">
            Monitor and manage high-performance compute nodes across 12 global regions.
          </p>
        </div>
        <div className="flex gap-3 sm:gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          {[
            { dot: 'bg-primary', label: 'Local Instances', val: summary.running.toString() },
            { dot: 'bg-tertiary', label: 'Avg Health',     val: summary.health.toFixed(2) + '%' },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-low p-3 sm:p-4 rounded-xl flex items-center gap-3 sm:gap-4 min-w-[140px] sm:min-w-[160px] flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${s.dot} glow-line`} />
              <div>
                <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-tighter font-bold">{s.label}</p>
                <p className="text-xl sm:text-2xl font-black text-on-surface">{s.val}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Server Table */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden shadow-2xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        {/* Mobile card view */}
        <div className="md:hidden p-4 space-y-3">
          {displayServers.map(s => (
            <div key={s.id} className="p-4 bg-white/[0.02] rounded-xl border border-white/5 group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center ${s.status === 'offline' ? 'text-slate-600' : 'text-primary'}`}>
                    <span className="material-symbols-outlined">{s.icon}</span>
                  </div>
                  <div>
                    <p className={`font-bold ${s.status === 'offline' ? 'text-slate-500' : 'text-on-surface'}`}>{s.name}</p>
                    <p className="text-[11px] text-slate-500 font-telemetry">{s.ip}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                   <Link to="/logs" className="p-1.5 text-slate-500 hover:text-primary transition-colors bg-white/5 rounded-lg inline-flex"><span className="material-symbols-outlined text-[16px]">terminal</span></Link>
                   <button onClick={() => { setPowerModal('reboot'); setPowerPassword(''); setPowerError('') }} className="p-1.5 text-slate-500 hover:text-tertiary transition-colors bg-white/5 rounded-lg"><span className="material-symbols-outlined text-[16px]">restart_alt</span></button>
                   <Link to="/settings" className="p-1.5 text-slate-500 hover:text-on-surface transition-colors bg-white/5 rounded-lg inline-flex"><span className="material-symbols-outlined text-[16px]">settings</span></Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Status</p>
                  <StatusBadge status={s.status} />
                </div>
                <div>
                  <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">OS</p>
                  <span className="text-xs text-on-surface-variant font-telemetry truncate">{s.os}</span>
                </div>
                <div>
                  <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Uptime</p>
                  <p className="text-xs font-telemetry text-slate-400">{s.uptime}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">ID</p>
                  <p className="text-xs font-telemetry text-slate-400">{s.id}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
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
                      <Link to="/logs" title="SSH Terminal" className="p-2 hover:text-primary transition-colors inline-flex"><span className="material-symbols-outlined text-[20px]">terminal</span></Link>
                      <button onClick={() => { setPowerModal('reboot'); setPowerPassword(''); setPowerError('') }} title="Reboot" className="p-2 hover:text-tertiary transition-colors"><span className="material-symbols-outlined text-[20px]">restart_alt</span></button>
                      <Link to="/settings" title="Settings" className="p-2 hover:text-on-surface transition-colors inline-flex"><span className="material-symbols-outlined text-[20px]">settings</span></Link>
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {[1, 2, 3].map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${page === p ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-slate-300'}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(3, p + 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Plugins Section ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg sm:text-xl font-black tracking-tight text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">extension</span>
              Plugins
            </h3>
            <p className="text-slate-500 text-[11px] sm:text-xs mt-1">
              Network overlay & infrastructure extensions for this node.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* ZeroTier Plugin Card - existing */}
          <div className="bg-surface-container-low rounded-xl border border-white/5 p-4 shadow-xl hover:border-amber-500/30 transition-colors">
            {/* Header row */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-amber-400 text-[18px]">hub</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-on-surface">ZeroTier</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Mesh VPN</p>
              </div>
              {hasNetworks && (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${zt.serviceRunning ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-500'}`} />
              )}
            </div>

            {/* Body */}
            {ztLoading ? (
              <div className="flex items-center justify-center py-6">
                <span className="material-symbols-outlined animate-spin text-slate-500 text-[20px]">progress_activity</span>
              </div>
            ) : !hasNetworks ? (
              <div className="py-2">
                <p className="text-[11px] text-slate-400 mb-3">
                  Belum bergabung jaringan. Masukkan Network ID untuk memulai.
                </p>
                {isOwner && (
                  <button
                    onClick={() => { setJoinModal(true); setZtError(''); setJoinNetworkId('') }}
                    className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">add_link</span>
                    Join Network
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {zt.networks.map(n => (
                  <div key={n.id} className="space-y-1.5">
                    <p className="text-[11px] font-telemetry text-amber-300 truncate font-bold">{n.id}</p>
                    {n.joinedAt && (
                      <p className="text-[10px] text-slate-500 font-telemetry">
                        Joined {new Date(n.joinedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}

                {/* Service toggle row */}
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Service</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {ztActionLoading ? 'Memproses…' : (zt.serviceRunning ? 'Berjalan' : 'Tidak aktif')}
                    </p>
                  </div>
                  <label className="zt-toggle-wrapper" title={zt.serviceRunning ? 'Stop service' : 'Start service'}>
                    <input
                      type="checkbox"
                      className="zt-toggle-checkbox"
                      checked={zt.serviceRunning}
                      onChange={toggleZtService}
                      disabled={ztActionLoading || !isOwner}
                      aria-label="Toggle ZeroTier service"
                    />
                    <div className="zt-toggle-container">
                      <div className="zt-toggle-button">
                        <div className="zt-toggle-button-circles-container">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="zt-toggle-button-circle" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Leave button */}
                {isOwner && zt.networks.map(n => (
                  <button
                    key={`leave-${n.id}`}
                    onClick={() => { setLeaveModal(n); setLeavePassword(''); setZtError('') }}
                    disabled={zt.serviceRunning}
                    title={zt.serviceRunning ? 'Matikan service ZeroTier dahulu' : 'Leave network'}
                    className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-rose-500 text-white hover:bg-rose-600 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[14px]">link_off</span>
                    Leave
                  </button>
                ))}
              </div>
            )}

            {ztError && !joinModal && !leaveModal && (
              <p className="text-[10px] text-rose-400 flex items-start gap-1 mt-3">
                <span className="material-symbols-outlined text-[12px] flex-shrink-0 mt-0.5">error</span>
                <span>{ztError}</span>
              </p>
            )}
          </div>

          {/* Tmux Plugin Card */}
          <TmuxPlugin />

          {/* ─── Resource Optimizer Card ───────────────────────── */}
          <div className="bg-surface-container-low rounded-xl border border-white/5 p-4 shadow-xl hover:border-primary/30 transition-colors">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-on-surface">Resource Optimizer</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">System Control</p>
              </div>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${osStats ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse' : 'bg-slate-600'}`} />
            </div>

            {/* Metrics Bars */}
            <div className="space-y-2.5 mb-4">
              {/* CPU */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-tertiary">speed</span>CPU
                  </span>
                  <span className="text-[10px] font-telemetry text-slate-300">{osStats ? `${osStats.cpuUsage}%` : '…'}</span>
                </div>
                <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${osStats && osStats.cpuUsage > 80 ? 'bg-rose-500' : osStats && osStats.cpuUsage > 60 ? 'bg-amber-400' : 'bg-tertiary'}`}
                    style={{ width: `${osStats ? Math.min(100, osStats.cpuUsage) : 0}%` }}
                  />
                </div>
              </div>
              {/* RAM */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-primary">memory</span>RAM
                  </span>
                  <span className="text-[10px] font-telemetry text-slate-300">
                    {osStats ? `${(osStats.memUsed / 1e9).toFixed(1)}/${(osStats.memTotal / 1e9).toFixed(1)} GB` : '…'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${osStats && Math.round((osStats.memUsed / osStats.memTotal) * 100) > 85 ? 'bg-rose-500' : 'bg-primary'}`}
                    style={{ width: `${osStats ? Math.round((osStats.memUsed / osStats.memTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
              {/* Disk */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-cyan-400">storage</span>Disk
                  </span>
                  <span className="text-[10px] font-telemetry text-slate-300">
                    {osStats ? `${(osStats.diskUsed / 1e9).toFixed(1)}/${(osStats.diskTotal / 1e9).toFixed(1)} GB` : '…'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${osStats && Math.round((osStats.diskUsed / osStats.diskTotal) * 100) > 85 ? 'bg-rose-500' : 'bg-cyan-500'}`}
                    style={{ width: `${osStats ? Math.round((osStats.diskUsed / osStats.diskTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-3 border-t border-white/5">
              {/* Optimize CPU */}
              <button
                onClick={optimizeCpu}
                disabled={cpuOptimizing}
                className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed bg-tertiary/10 text-tertiary hover:bg-tertiary/20 border border-tertiary/20"
              >
                {cpuOptimizing ? (
                  <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                ) : cpuSuccess ? (
                  <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-[14px]">speed</span>
                )}
                {cpuSuccess ? 'CPU Optimized!' : 'Optimize CPU'}
              </button>
              {/* Free RAM */}
              <button
                onClick={cleanRam}
                disabled={ramOptimizing}
                className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
              >
                {ramOptimizing ? (
                  <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                ) : ramFreedInfo ? (
                  <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-[14px]">memory</span>
                )}
                {ramFreedInfo || 'Free Memory'}
              </button>
              {/* Clean Storage */}
              <button
                onClick={cleanStorage}
                disabled={storageCleaning}
                className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20"
              >
                {storageCleaning ? (
                  <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                ) : storageFreedInfo ? (
                  <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-[14px]">storage</span>
                )}
                {storageFreedInfo || 'Clean Storage'}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Join Network Modal */}
      {joinModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-6 sm:p-0" onClick={() => !ztActionLoading && setJoinModal(false)}>
          <div className="bg-[#0f1425] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20">
                <span className="material-symbols-outlined text-amber-400">add_link</span>
              </div>
              <div>
                <h3 className="text-base font-black text-white">Join ZeroTier Network</h3>
                <p className="text-[10px] text-slate-400">Masukkan Network ID untuk bergabung.</p>
              </div>
            </div>

            <form onSubmit={handleJoin}>
              <div className="space-y-1.5 mb-4">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px] text-amber-400">vpn_key</span>
                  Network ID (16 karakter hex)
                </label>
                <input
                  autoFocus type="text" value={joinNetworkId}
                  onChange={e => { setJoinNetworkId(e.target.value); setZtError('') }}
                  placeholder="contoh: 8056c2e21c000001"
                  maxLength={16}
                  disabled={ztActionLoading}
                  className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-white p-2.5 text-sm font-telemetry tracking-wider focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50 lowercase"
                />
                {ztError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">error</span>{ztError}
                  </p>
                )}
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-4">
                <p className="text-[10px] text-amber-300 leading-relaxed">
                  Sistem akan menjalankan: <code className="text-amber-200 bg-black/30 px-1 rounded font-telemetry">sudo zerotier-cli join &lt;ID&gt;</code>. Jaringan harus diauthorize di my.zerotier.com setelah join.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setJoinModal(false)} disabled={ztActionLoading}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-40">Batal</button>
                <button type="submit" disabled={ztActionLoading || !joinNetworkId.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600">
                  {ztActionLoading ? (
                    <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">add_link</span>
                  )}
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Network Modal */}
      {leaveModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-6 sm:p-0" onClick={() => !ztActionLoading && setLeaveModal(null)}>
          <div className="bg-[#0f1425] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20">
                <span className="material-symbols-outlined text-rose-400">link_off</span>
              </div>
              <div>
                <h3 className="text-base font-black text-white">Leave Network</h3>
                <p className="text-[10px] text-slate-400">Verifikasi password untuk melanjutkan.</p>
              </div>
            </div>

            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 mb-4">
              <p className="text-[11px] text-rose-300 leading-relaxed">
                Anda akan keluar dari jaringan <span className="font-telemetry font-bold">{leaveModal.id}</span>. Aksi ini tidak dapat dibatalkan dan koneksi mesh akan terputus.
              </p>
            </div>

            <form onSubmit={handleLeave}>
              <div className="space-y-1.5 mb-4">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px] text-rose-400">lock</span>
                  Password Verifikasi
                </label>
                <PasswordInput
                  autoFocus value={leavePassword}
                  onChange={e => { setLeavePassword(e.target.value); setZtError('') }}
                  placeholder="Masukkan password akun"
                  disabled={ztActionLoading}
                  className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-white p-2.5 text-sm focus:ring-1 focus:ring-rose-400 focus:border-rose-400 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                />
                {ztError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">error</span>{ztError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setLeaveModal(null)} disabled={ztActionLoading}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-40">Batal</button>
                <button type="submit" disabled={ztActionLoading || !leavePassword.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600">
                  {ztActionLoading ? (
                    <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">link_off</span>
                  )}
                  Leave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Power Confirmation Modal */}
      {powerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0" onClick={() => !powerLoading && setPowerModal(null)}>
          <div className="bg-[#0f1425] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${powerModal === 'shutdown' ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                <span className={`material-symbols-outlined ${powerModal === 'shutdown' ? 'text-rose-400' : 'text-amber-400'}`}>
                  {powerModal === 'shutdown' ? 'power_settings_new' : 'restart_alt'}
                </span>
              </div>
              <div>
                <h3 className="text-base font-black text-white">{powerModal === 'shutdown' ? 'Shutdown System' : 'Reboot System'}</h3>
                <p className="text-[10px] text-slate-400">Verifikasi password untuk melanjutkan.</p>
              </div>
            </div>

            <div className={`rounded-xl p-3 mb-4 ${powerModal === 'shutdown' ? 'bg-rose-500/5 border border-rose-500/20' : 'bg-amber-500/5 border border-amber-500/20'}`}>
              <p className={`text-[11px] leading-relaxed ${powerModal === 'shutdown' ? 'text-rose-300' : 'text-amber-300'}`}>
                {powerModal === 'shutdown'
                  ? 'Sistem akan dimatikan. Semua layanan akan berhenti dan server tidak dapat diakses sampai dinyalakan kembali secara manual.'
                  : 'Sistem akan restart. Semua layanan akan berhenti sementara dan akan kembali online setelah reboot selesai.'}
              </p>
            </div>

            <form onSubmit={handlePower}>
              <div className="space-y-1.5 mb-4">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px] text-amber-400">lock</span>
                  Password Verifikasi
                </label>
                <PasswordInput
                  autoFocus value={powerPassword}
                  onChange={e => { setPowerPassword(e.target.value); setPowerError('') }}
                  placeholder="Masukkan password akun"
                  disabled={powerLoading}
                  className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-white p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                />
                {powerError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">error</span>{powerError}
                  </p>
                )}
              </div>

              {powerLoading && (
                <div className="mb-4 flex items-center gap-2 text-[11px] text-slate-300">
                  <span className={`material-symbols-outlined text-[16px] animate-spin ${powerModal === 'shutdown' ? 'text-rose-400' : 'text-amber-400'}`}>progress_activity</span>
                  {powerModal === 'shutdown' ? 'Mematikan sistem...' : 'Merestart sistem...'}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPowerModal(null)} disabled={powerLoading}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-40">Batal</button>
                <button type="submit" disabled={powerLoading || !powerPassword.trim()}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40 flex items-center gap-1.5 ${powerModal === 'shutdown' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
                  <span className="material-symbols-outlined text-[14px]">{powerModal === 'shutdown' ? 'power_settings_new' : 'restart_alt'}</span>
                  {powerModal === 'shutdown' ? 'Shutdown' : 'Reboot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
