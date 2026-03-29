import React from 'react'

export default function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-700">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-xl animate-pulse">rocket_launch</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <h3 className="text-on-surface font-black tracking-widest uppercase text-xs">Initializing Session</h3>
        <p className="text-slate-500 text-[10px] font-telemetry animate-pulse">LOADING ASSETS & TELEMETRY...</p>
      </div>
    </div>
  )
}
