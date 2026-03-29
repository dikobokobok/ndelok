import { useState, useContext, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthContext } from '../App'
import { io } from 'socket.io-client'

export default function TopBar({ onMenuClick }) {
  const location = useLocation()
  const { user, authenticatedFetch } = useContext(AuthContext)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef(null)

  const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'NE'

  // Fetch initial logs & Setup WebSocket
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await authenticatedFetch('/api/logs')
        if (res.ok) {
          const allLogs = await res.json()
          // Filter for Auth and Audit categories to keep notifications relevant
          const filtered = allLogs.filter(log => log.level === 'Auth' || log.level === 'Audit').slice(0, 15)
          setNotifications(filtered)
        }
      } catch (err) {
        console.error('Failed to fetch logs for notifications', err)
      }
    }

    fetchLogs()

    // Real-time listener
    const socket = io()
    socket.emit('join-room', 'system-logs')

    socket.on('new_log', (log) => {
      if (log.level === 'Auth' || log.level === 'Audit') {
        setNotifications(prev => [log, ...prev].slice(0, 15))
        if (!showNotifications) setUnreadCount(prev => prev + 1)
      }
    })

    // Click outside handler
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      socket.disconnect()
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [authenticatedFetch, showNotifications])

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications)
    if (!showNotifications) setUnreadCount(0)
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 h-14 bg-[#0a0f1d]/60 backdrop-blur-3xl border-b border-white/5">
      {/* Menu / Search */}
      <div className="flex items-center gap-4 md:gap-10 flex-1">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        <div className="relative w-full max-w-[420px] group hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px] group-focus-within:text-primary transition-colors font-light">
            search
          </span>
          <input
            type="text"
            placeholder="Search infrastructure..."
            className="w-full bg-[#161b2c]/50 border border-white/[0.03] rounded-lg h-9 pl-10 pr-4 text-sm text-on-surface placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all font-medium"
          />
        </div>

      </div>

      {/* Right: actions + user */}
      <div className="flex items-center gap-1.5 line-height-none relative" ref={dropdownRef}>
        <button
          onClick={toggleNotifications}
          className={`p-2 rounded-lg transition-all relative group ${showNotifications ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
        >
          <span className="material-symbols-outlined text-[22px] font-light">notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-tertiary text-[8px] font-black text-white px-0.5 border border-[#0a0f1d] animate-in zoom-in">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notifications Dropdown */}
        {showNotifications && (
          <div className="absolute top-12 right-0 w-[320px] bg-[#0c1225]/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">Observation Stream</h3>
              <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-widest">PROACTIVE</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <span className="material-symbols-outlined text-slate-700 text-4xl">notifications_off</span>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">No active threats detected</p>
                </div>
              ) : (
                notifications.map((log, idx) => (
                  <div key={idx} className="px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-default group">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${log.level === 'Auth' ? 'bg-tertiary/10 border-tertiary/20 text-tertiary' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {log.level === 'Auth' ? 'key_visualizer' : 'security'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-1 capitalize">
                          {log.message.replace(/\[.*?\]\s*/g, '')}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase text-slate-600 tracking-wider font-telemetry">{log.service}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-800" />
                          <span className="text-[9px] text-slate-500 font-telemetry">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Link
              to="/logs"
              onClick={() => setShowNotifications(false)}
              className="block w-full text-center py-3 bg-white/[0.03] text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all"
            >
              Access Complete Audit Trail
            </Link>
          </div>
        )}

        <button className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
          <span className="material-symbols-outlined text-[22px] font-light">help</span>
        </button>

        <div className="w-[1px] h-6 bg-white/5 mx-3" />

        <div className="flex items-center gap-3 pl-1 group cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:border-primary/30 transition-all overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {user?.avatar ? (
              <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="hidden lg:block">
            <p className="text-[11px] font-black text-slate-300 leading-none mb-1">{user?.name || 'Local System'}</p>
            <p className="text-[9px] text-primary/80 font-bold uppercase tracking-widest leading-none">{user?.role || 'Guest'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
