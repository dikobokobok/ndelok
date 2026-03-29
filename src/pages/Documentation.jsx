import React from 'react'
import { Link } from 'react-router-dom'

const quickStats = [
  { label: 'Platform Version', value: 'v1.0.4', icon: 'verified' },
  { label: 'Native Bridge', value: 'Vite 6', icon: 'settings_ethernet' },
  { label: 'Real-time', value: 'Enabled', icon: 'speed' },
  { label: 'Workspace', value: 'Isolated', icon: 'shield' },
]

const sections = [
  {
    title: 'Background Architecture',
    content: 'Ndelok.me works as a local PaaS. Every project is cloned into a unique workspace directory. Native processes are spawned through the development server bridge.',
    icon: 'api',
    color: 'border-primary/20 text-primary bg-primary/5'
  },
  {
    title: 'Telemetry & Monitoring',
    content: 'Standard OS modules are used to poll system metrics every 2 seconds. These metrics are broadcast via Socket.io to the dashboard.',
    icon: 'insights',
    color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5'
  },
  {
    title: 'Process Lifecycle',
    content: 'Full control over child processes: Spawn, Terminate (Safe Kill on Win/Unix), and Re-trigger with automatic logs aggregation.',
    icon: 'memory',
    color: 'border-tertiary/20 text-tertiary bg-tertiary/5'
  },
  {
    title: 'Global Logging',
    content: 'Consolidates all system debug info and project-specific stdout/stderr into a single, searchable real-time logging stream.',
    icon: 'contract_edit',
    color: 'border-indigo-400/20 text-indigo-300 bg-indigo-400/5'
  }
]

export default function Documentation() {
  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      
      {/* Header Section */}
      <div className="relative group p-10 rounded-[2.5rem] bg-gradient-to-br from-surface-container-low to-surface-container-lowest border border-white/5 shadow-2xl overflow-hidden min-h-[400px] flex flex-col justify-center">
        {/* Animated Background Orbs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 blur-[120px] rounded-full animate-pulse-slow pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-tertiary/15 blur-[120px] rounded-full animate-pulse-slow pointer-events-none delay-700" />

        <div className="relative space-y-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest shadow-lg">
             <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
             </span>
             Documentation Portal
          </div>
          
          <h1 className="text-5xl lg:text-6xl font-black text-white leading-tight tracking-tighter">
            Architecting Your <br />
            <span className="bg-gradient-to-r from-primary via-primary-container to-tertiary text-transparent bg-clip-text">Infrastructure.</span>
          </h1>

          <p className="text-slate-400 text-lg leading-relaxed font-medium">
            Discover how Ndelok.me bridge the gap between local development and native OS management with high-performance instrumentation.
          </p>

          <div className="flex flex-wrap gap-4 pt-4">
             {quickStats.map(stat => (
                <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">
                   <span className="material-symbols-outlined text-[16px] text-slate-500">{stat.icon}</span>
                   <span className="text-[10px] uppercase font-bold text-slate-400">{stat.label}:</span>
                   <span className="text-[10px] uppercase font-bold text-white">{stat.value}</span>
                </div>
             ))}
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {sections.map((s, i) => (
          <div 
            key={s.title} 
            className={`group p-8 rounded-[2rem] border transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10 ${s.color}`}
          >
            <div className="mb-6 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-6">
              <span className="material-symbols-outlined text-3xl">{s.icon}</span>
            </div>
            <h3 className="font-bold text-white text-base tracking-tight mb-3 uppercase leading-tight">{s.title}</h3>
            <p className="text-slate-400/80 text-xs leading-relaxed font-medium line-clamp-4">{s.content}</p>
          </div>
        ))}
      </div>

      {/* Advanced Technical Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Flow Guide */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-10 rounded-[2.5rem] bg-surface-container-low border border-white/5 shadow-xl space-y-10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">Full Lifecycle Workflow</h2>
              <div className="px-3 py-1 rounded-full bg-slate-900/50 text-slate-500 text-[10px] uppercase font-bold tracking-tighter">Interactive Guide</div>
            </div>

            <div className="space-y-10">
              <div className="flex gap-6 relative">
                 <div className="absolute top-10 left-4 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 to-transparent" />
                 <div className="z-10 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-primary/20">1</div>
                 <div className="space-y-2">
                    <h4 className="text-white font-bold text-sm uppercase tracking-wide">Cloning & Setup</h4>
                    <p className="text-slate-400 text-xs leading-relaxed">System performs an <code className="text-primary font-bold">ls-remote</code> to verify branch then clones strictly into <code className="bg-black/40 px-1 rounded text-primary">/workspaces/[name]</code>.</p>
                 </div>
              </div>

              <div className="flex gap-6 relative">
                 <div className="z-10 w-8 h-8 rounded-full bg-tertiary flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-tertiary/20">2</div>
                 <div className="space-y-2">
                    <h4 className="text-white font-bold text-sm uppercase tracking-wide">Native Installation</h4>
                    <p className="text-slate-400 text-xs leading-relaxed">Dependencies are resolved via the specified package manager.</p>
                 </div>
              </div>

              <div className="flex gap-6">
                 <div className="z-10 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-emerald-500/20">3</div>
                 <div className="space-y-2">
                    <h4 className="text-white font-bold text-sm uppercase tracking-wide">Live Instrumentation</h4>
                    <p className="text-slate-400 text-xs leading-relaxed">Child process is spawned. Memory and CPU usage are mapped to the dashboard every <code className="text-emerald-400 font-bold">2000ms</code>.</p>
                 </div>
              </div>
            </div>


          </div>
        </div>

        {/* Right Column: Mini Cards/Support */}
        <div className="space-y-6">
           <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 shadow-xl space-y-4">
              <span className="material-symbols-outlined text-3xl text-primary">hub</span>
              <h3 className="text-white font-black text-lg uppercase tracking-tight">API Bridge</h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                 Ndelok.me exposes a middleware-based API to interact with the host. This allows you to integrate third-party webhooks for automated restarts and monitoring.
              </p>
           </div>

           <div className="p-8 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 shadow-xl space-y-4">
              <span className="material-symbols-outlined text-3xl text-indigo-400">shelves</span>
              <h3 className="text-white font-black text-lg uppercase tracking-tight">Persistence</h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                 All project configurations and execution history are stored locally in <code className="text-indigo-300 font-bold underline">projects.json</code>. No database setup required.
              </p>
           </div>
        </div>
      </div>

    </div>
  )
}
