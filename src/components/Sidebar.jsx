import { useContext } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { AuthContext } from '../App'

const navItems = [
  { to: '/dashboard',     icon: 'dashboard',      label: 'Dashboard' },
  { to: '/servers',       icon: 'dns',            label: 'Servers' },
  { to: '/projects',      icon: 'rocket_launch',  label: 'Projects' },
  { to: '/logs',          icon: 'terminal',       label: 'Logs' },
  { to: '/settings',      icon: 'settings',       label: 'Settings', roles: ['owner'] },
]

const footerNavItems = [
  { to: '/documentation', icon: 'menu_book',      label: 'Documentation' },
]

export default function Sidebar({ onClose }) {
  const { user, logout } = useContext(AuthContext)

  const filteredNav = navItems.filter(item => !item.roles || item.roles.includes(user?.role))

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
    </aside>
  )
}
