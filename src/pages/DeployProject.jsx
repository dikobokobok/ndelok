import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Toast from '../components/Toast'

export default function DeployProject() {
  const [formData, setFormData] = useState({ name: '', repo: '', installCmd: '', runCmd: '', port: '' })
  const [isDeploying, setIsDeploying] = useState(false)
  const [logs, setLogs] = useState([])
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()
  const logsEndRef = useRef(null)

  // Auto-scroll terminal
  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleDeploy = async (e) => {
    e.preventDefault()
    setIsDeploying(true)
    setLogs(['[SYSTEM] Initializing deployment subsystem...', '[SYSTEM] Allocating workspace container...'])
    
    try {
      const res = await fetch('/api/project-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (!res.ok) throw new Error('Deployment request rejected')
      
      const poll = setInterval(async () => {
        try {
          const logRes = await fetch(`/api/deploy-logs?name=${encodeURIComponent(formData.name)}`)
          if (logRes.ok) {
             const logData = await logRes.json()
             setLogs(logData)
             
             const hasSuccess = logData.some(l => l.includes('[SUCCESS]'))
             const hasError = logData.some(l => l.includes('[ERROR]'))
             
             if (hasSuccess || hasError) {
               clearInterval(poll)
               setIsDeploying(false)
               if (hasSuccess) {
                 setToast({ type: 'success', msg: `Installation for ${formData.name} completed successfully!` })
                 setTimeout(() => navigate('/projects'), 2000)
               } else {
                 setToast({ type: 'error', msg: `Installation failed. Please review the trace.` })
               }
             }
          }
        } catch (err) {
          console.error('Polling error', err)
        }
      }, 1500)

    } catch (err) {
      setToast({ type: 'error', msg: err.message })
      setIsDeploying(false)
    }
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-in fade-in duration-500 min-h-[85vh] flex flex-col">
      <section className="mb-5">
        <nav className="flex items-center gap-2 text-[10px] text-slate-500 mb-1 uppercase tracking-widest font-bold">
          <span>Infrastructure</span>
          <span className="material-symbols-outlined text-[12px]">chevron_right</span>
          <span className="text-primary/70">Engine</span>
        </nav>
        <h2 className="text-2xl font-black text-on-surface">Provision Workspace</h2>
      </section>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Context / Terminal */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-[300px]">
          {logs.length === 0 ? (
            <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl p-6 flex-1 flex flex-col justify-center space-y-5 animate-fade-in shadow-lg">
               <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30 shadow-inner">
                  <span className="material-symbols-outlined text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
               </div>
               <div>
                  <h3 className="text-xl font-black text-white leading-tight mb-2">Autopilot <br/> Deployment</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">Ndelok Engine automatically parses your GitHub URLs to locate specific branches. Provide standard CLI commands, and the supervisor will handle process daemonization.</p>
               </div>
               <div className="space-y-3 pt-3 border-t border-primary/10">
                  <div className="flex items-start gap-2">
                     <span className="material-symbols-outlined text-emerald-400 text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                     <div>
                        <h4 className="font-bold text-white text-xs">Smart Tree Parsing</h4>
                        <p className="text-[10px] text-slate-500">Detects /tree/[branch] in URL.</p>
                     </div>
                  </div>
                  <div className="flex items-start gap-2">
                     <span className="material-symbols-outlined text-emerald-400 text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                     <div>
                        <h4 className="font-bold text-white text-xs">Live Terminal</h4>
                        <p className="text-[10px] text-slate-500">Real-time output stream.</p>
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <div className="bg-[#050811] rounded-2xl border border-white/10 shadow-xl flex flex-col flex-1 max-h-[500px] overflow-hidden animate-in slide-in-from-left-4">
              <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">terminal</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Live Thread</span>
                </div>
                {isDeploying && (
                  <div className="flex items-center gap-2">
                     <span className="flex h-2 w-2 rounded-full bg-primary animate-ping"></span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-1.5 font-telemetry text-[11px] leading-relaxed custom-scrollbar bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0wIDEwaDQwdjFINHoiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wMikiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPgo8L3N2Zz4=')]">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-slate-700 select-none opacity-50">[{String(i+1).padStart(3, '0')}]</span>
                    <span className={`flex-1 break-words ${log.includes('[ERROR]') ? 'text-rose-400 font-bold drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]' : log.includes('[SUCCESS]') ? 'text-emerald-400 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-slate-300 shadow-slate-900/50'}`}>
                      {log}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Form Configurator */}
        <div className="lg:col-span-7">
           <form onSubmit={handleDeploy} className="bg-surface-container-low rounded-2xl p-6 shadow-xl border border-white/5 space-y-6 relative">
             
             {/* Header */}
             <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-white mb-1">Service Configuration</h3>
                <p className="text-[11px] text-slate-400">Define your repository source and daemon sequences.</p>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
               
               {/* Project Name */}
               <div className="space-y-2 text-[13px]">
                 <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[14px] text-tertiary">badge</span>
                    Project Link Name
                 </label>
                 <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                   placeholder="e.g. core-api-v2"
                   disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                   className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-tertiary focus:border-tertiary outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
               </div>

               {/* Port */}
               <div className="space-y-2 text-[13px]">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                     <span className="material-symbols-outlined text-[14px] text-cyan-400">api</span>
                     Exposed Port
                  </label>
                  <input type="number" value={formData.port} onChange={e => setFormData({ ...formData, port: e.target.value })}
                    placeholder="e.g. 3000"
                    disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                    className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
               </div>

               {/* Repo */}
               <div className="space-y-2 md:col-span-2 text-[13px]">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                     <span className="material-symbols-outlined text-[14px] text-primary">source</span>
                     GitHub Source Link
                  </label>
                  <input required type="text" value={formData.repo} onChange={e => setFormData({ ...formData, repo: e.target.value })}
                    placeholder="https://github.com/user/repo/tree/v1.0"
                    disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                    className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
               </div>

               {/* Install CMD */}
               <div className="space-y-2 md:col-span-2 text-[13px]">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                     <span className="material-symbols-outlined text-[14px] text-amber-500">settings_b_roll</span>
                     Build / Install Execution
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-telemetry select-none">$&gt;</span>
                    <input required type="text" value={formData.installCmd} onChange={e => setFormData({ ...formData, installCmd: e.target.value })}
                      placeholder="npm install --production"
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className="w-full pl-9 pr-3 bg-[#0a0f1d] text-amber-500 font-telemetry border border-white/10 rounded-xl p-3 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50" />
                  </div>
               </div>

               {/* Run CMD */}
               <div className="space-y-2 md:col-span-2 text-[13px]">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                     <span className="material-symbols-outlined text-[14px] text-emerald-500">play_circle</span>
                     Daemon Start Sequence
                  </label>
                  <div className="relative">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-telemetry select-none">$&gt;</span>
                     <input required type="text" value={formData.runCmd} onChange={e => setFormData({ ...formData, runCmd: e.target.value })}
                       placeholder="node server.js"
                       disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                       className="w-full pl-9 pr-3 bg-[#0a0f1d] text-emerald-400 font-telemetry border border-white/10 rounded-xl p-3 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50" />
                  </div>
               </div>
             </div>

             <div className="pt-4 mt-6 border-t border-white/5 text-right flex justify-end">
                <button disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))} type="submit" 
                   className="inline-flex min-w-[200px] items-center justify-center gap-2 bg-white text-black font-black px-6 py-3 rounded-xl text-xs hover:bg-primary hover:text-white active:scale-95 disabled:scale-100 disabled:bg-surface-container-highest disabled:text-slate-500 transition-all uppercase tracking-widest shadow-md">
                   {isDeploying ? (
                     <><span className="material-symbols-outlined text-[18px] animate-spin">cyclone</span> INITIALIZING...</>
                   ) : logs.length > 0 && !logs.some(l => l.includes('[ERROR]')) ? (
                     <><span className="material-symbols-outlined text-[18px]">done_all</span> SUCCESS</>
                   ) : (
                     <><span className="material-symbols-outlined text-[18px]">rocket_launch</span> DEPLOY SERVICE</>
                   )}
                </button>
             </div>
           </form>
        </div>

      </div>
      
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
