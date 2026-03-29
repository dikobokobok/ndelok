import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function TopBar({ onMenuClick }) {
  const location = useLocation()

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
      <div className="flex items-center gap-1.5 line-height-none">
        <button className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all relative group">
          <span className="material-symbols-outlined text-[22px] font-light">notifications</span>
          <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-tertiary border border-[#0a0f1d]" />
        </button>
        <button className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
          <span className="material-symbols-outlined text-[22px] font-light">help</span>
        </button>
        
        <div className="w-[1px] h-6 bg-white/5 mx-3" />
        
        <div className="flex items-center gap-3 pl-1 group cursor-pointer">
           <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:border-primary/30 transition-all overflow-hidden relative">
             <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
             NE
           </div>
           <div className="hidden lg:block">
             <p className="text-[11px] font-black text-slate-300 leading-none mb-1">Ndelok Engine</p>
             <p className="text-[9px] text-primary/80 font-bold uppercase tracking-widest leading-none">LOCAL SYSTEM</p>
           </div>
        </div>
      </div>
    </header>
  )
}
