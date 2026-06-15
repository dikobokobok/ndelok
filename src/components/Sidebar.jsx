import { useContext, useState, useMemo } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { AuthContext } from '../App'
import PasswordInput from './PasswordInput'

const navItems = [
  { to: '/dashboard',               icon: 'dashboard',      label: 'Dashboard' },
  { to: '/servers',                 icon: 'dns',            label: 'Servers' },
  { to: '/projects',                icon: 'rocket_launch',  label: 'Projects' },
  { to: '/projects/__root__/files', icon: 'shield_lock',    label: 'System Files', roles: ['owner'] },
  { to: '/cloudflare',              icon: 'cloud',          label: 'Cloudflare',   roles: ['owner'] },
  { to: '/logs',                    icon: 'terminal',       label: 'Logs & Terminal' },
  { to: '/settings',                icon: 'settings',       label: 'Settings',     roles: ['owner'] },
]

const footerNavItems = [
  { to: '/documentation', icon: 'menu_book',      label: 'Documentation' },
]

export default function Sidebar({ onClose }) {
  const { user, logout, authenticatedFetch } = useContext(AuthContext)
  const [powerModal, setPowerModal] = useState(null) // 'shutdown' | 'reboot'
  const [powerPassword, setPowerPassword] = useState('')
  const [powerLoading, setPowerLoading] = useState(false)
  const [powerError, setPowerError] = useState('')

  const filteredNav = useMemo(() => navItems.filter(item => !item.roles || item.roles.includes(user?.role)), [user?.role])

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
      // Success — system will shutdown/reboot
      setPowerError('')
    } catch (e) {
      setPowerError(e.message)
      setPowerLoading(false)
    }
  }

  return (
    <aside className="h-screen w-64 flex flex-col bg-[#0f1425] shadow-2xl sidebar-gradient border-r border-white/5 relative z-50">
      {/* Mobile Close Button */}
      <button 
        onClick={onClose}
        className="lg:hidden absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shadow-lg flex-shrink-0 animate-pulse-slow">
          <span
            className="material-symbols-outlined text-on-primary text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            rocket_launch
          </span>
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tighter text-white leading-tight">ndelok.me</h1>
          <p className="text-[10px] font-label uppercase tracking-[0.1em] text-primary/60 leading-tight">
            The Observatory
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 pb-4 mt-2">
        {filteredNav.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 group ` +
              (isActive
                ? 'bg-primary/10 text-primary border-l-2 border-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-l-2 border-transparent')
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`material-symbols-outlined text-[20px] transition-transform duration-300 ${!isActive && 'group-hover:scale-110'}`}
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {icon}
                </span>
                <span className="uppercase tracking-widest text-[10px]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile & Actions */}
      <div className="px-3 pb-6 space-y-3">
        {user?.role !== 'viewer' && (
          <Link to="/deploy" className="w-full py-3 px-4 bg-gradient-to-r from-primary to-primary-border text-white font-bold rounded-xl text-xs tracking-widest uppercase transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Deploy New
          </Link>
        )}

        {/* User Card */}
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mb-2">
          <div className="flex items-center gap-3 mb-3">
            <img src={user?.avatar} alt="avatar" className="w-10 h-10 rounded-full bg-surface-container" />
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-tighter">{user?.role}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full py-2 flex items-center justify-center gap-2 text-slate-400 hover:text-error transition-colors text-xs font-semibold uppercase tracking-widest bg-white/5 rounded-lg border border-transparent hover:border-error/20"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Sign Out
          </button>

          {/* Power Buttons - Owner only */}
          {user?.role === 'owner' && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setPowerModal('reboot'); setPowerPassword(''); setPowerError('') }}
                className="flex-1 py-2 flex items-center justify-center gap-1.5 text-amber-400 hover:bg-amber-500/10 transition-colors text-[9px] font-bold uppercase tracking-widest bg-white/5 rounded-lg border border-transparent hover:border-amber-500/20">
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                Reboot
              </button>
              <button onClick={() => { setPowerModal('shutdown'); setPowerPassword(''); setPowerError('') }}
                className="flex-1 py-2 flex items-center justify-center gap-1.5 text-rose-400 hover:bg-rose-500/10 transition-colors text-[9px] font-bold uppercase tracking-widest bg-white/5 rounded-lg border border-transparent hover:border-rose-500/20">
                <span className="material-symbols-outlined text-[14px]">power_settings_new</span>
                Shutdown
              </button>
            </div>
          )}
        </div>

        {footerNavItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-300 ` +
              (isActive
                ? 'bg-white/5 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5')
            }
          >
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
            <span className="uppercase tracking-widest text-[10px]">{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Power Confirmation Modal */}
      {powerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => !powerLoading && setPowerModal(null)}>
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
    </aside>
  )
}
