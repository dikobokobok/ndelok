import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Toast from '../components/Toast'
import socket from '../lib/socket'

export default function Projects() {
  const [view, setView] = useState('grid')
  const [projectList, setProjectList] = useState([])
  const [host, setHost] = useState('127.0.0.1')
  const navigate = useNavigate()
  const [toast, setToast] = useState(null)
  
  const [editProject, setEditProject] = useState(null)
  const [editData, setEditData] = useState({ installCmd: '', runCmd: '', port: '' })

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 5000)
  }
  
  // Fetch real-time projects
  useEffect(() => {
    socket.on('stats_update', (data) => {
      setProjectList(data.projects.list || [])
      
      // Get bridge/main IP from the OS stats
      if (data.os.netInterfaces) {
        let hostIp = '127.0.0.1'
        for (const name of Object.keys(data.os.netInterfaces)) {
          for (const net of data.os.netInterfaces[name]) {
            if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
              hostIp = net.address; break;
            }
          }
          if (hostIp !== '127.0.0.1') break
        }
        setHost(hostIp)
      }
    })

    return () => {
      socket.off('stats_update')
    }
  }, [])

  const handleStop = async (name) => {
    setProjectList(prev => prev.map(p => p.name === name ? { ...p, status: 'Stopped', progress: 0, cpu: 0, mem: 0, statusColor: 'bg-surface-container-highest text-slate-400', dot: 'bg-slate-500' } : p))
    try {
      await fetch('/api/project-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action: 'stop' })
      })
      showToast('warn', `Service ${name} has been stopped.`)
    } catch (e) {
      showToast('error', `Failed to stop service ${name}.`)
    }
  }

  const handleRestart = async (name) => {
    setProjectList(prev => prev.map(p => p.name === name ? { ...p, status: 'Starting...', progress: 45, cpu: 85, statusColor: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary animate-pulse' } : p))
    try {
      await fetch('/api/project-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action: 'restart' })
      })
      showToast('success', `Service ${name} started successfully.`)
    } catch (e) {
      showToast('error', `Failed to start service ${name}.`)
    }
  }

  const handleDelete = async (name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return
    
    // Optimistic update
    setProjectList(prev => prev.filter(p => p.name !== name))
    
    try {
      await fetch('/api/project-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action: 'delete' })
      })
      showToast('success', `Service ${name} deleted successfully.`)
    } catch (e) {
      showToast('error', `Failed to delete service ${name}.`)
    }
  }

  const openEdit = (p) => {
    setEditProject(p)
    setEditData({ installCmd: p.installCmd || '', runCmd: p.runCmd || '', port: p.port || '' })
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    
    setProjectList(prev => prev.map(p => p.name === editProject.name ? { ...p, ...editData } : p))
    try {
      await fetch('/api/project-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editProject.name, action: 'edit', payload: editData })
      })
      showToast('success', `Service ${editProject.name} updated. Restart to apply changes.`)
      setEditProject(null)
    } catch (e) {
      showToast('error', `Failed to update service.`)
    }
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2 uppercase tracking-widest font-bold">
            <span>Infrastructure</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">Projects</span>
          </nav>
          <h2 className="text-4xl font-black tracking-tight text-on-surface">Project Registry</h2>
          <p className="text-slate-500 mt-2 text-sm">Monitor health and track background services.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-surface-container rounded-lg p-1">
            <button onClick={() => setView('grid')} className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-surface-container-highest text-primary' : 'text-slate-500'}`}>
              <span className="material-symbols-outlined text-[18px]">grid_view</span>
            </button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-surface-container-highest text-primary' : 'text-slate-500'}`}>
              <span className="material-symbols-outlined text-[18px]">list</span>
            </button>
          </div>
          <button onClick={() => navigate('/deploy')} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl text-sm hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Project
          </button>

        </div>
      </div>

      {/* Summary Strip (Compact) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', val: projectList.length, color: 'text-on-surface' },
          { label: 'In Production', val: projectList.filter(p => p.status === 'Production' || p.status === 'Running').length,  color: 'text-primary' },
          { label: 'In Staging',    val: projectList.filter(p => p.status === 'Staging' || p.status === 'Starting...').length,  color: 'text-tertiary' },
          { label: 'Maintenance',   val: projectList.filter(p => p.status === 'Maintenance' || p.status === 'Stopped').length,  color: 'text-error' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-low p-3 rounded-lg border border-white/5">
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">{s.label}</p>
            <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Project Grid (Compact) */}
      <div className={`grid gap-4 ${view === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {projectList.map(p => (
          <div key={p.name} className="bg-surface-container rounded-xl p-4 hover:bg-surface-container-high transition-colors group cursor-pointer tonal-layering relative overflow-hidden border border-white/5">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg bg-surface-container-highest shrink-0 flex items-center justify-center ${p.iconColor}`}>
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{p.icon}</span>
                </div>
                <div className="min-w-0">
                   <p className="font-black text-sm text-on-surface group-hover:text-primary transition-colors truncate leading-tight">{p.name}</p>
                   <div className="flex items-center gap-2 mt-0.5">
                     <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] rounded font-black uppercase ${p.statusColor}`}>
                       <span className={`w-1 h-1 rounded-full shrink-0 ${p.dot}`} />
                       {p.status}
                     </span>
                     {p.port && (
                       <a href={`http://${host}:${p.port}`} target="_blank" rel="noreferrer" 
                         onClick={e => e.stopPropagation()}
                         className="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors px-1.5 py-0.5 rounded uppercase tracking-widest leading-none">
                         <span className="material-symbols-outlined text-[11px]">link</span> {p.port}
                       </a>
                     )}
                   </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <div className="flex bg-surface-container-highest rounded-lg overflow-hidden border border-white/5 shrink-0">
                  {p.status === 'Stopped' ? (
                    <button onClick={(e) => { e.stopPropagation(); handleRestart(p.name) }} 
                      className="w-12 h-7 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-400 transition-colors flex items-center justify-center">
                      <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                    </button>
                  ) : (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleStop(p.name) }} 
                        className="w-7 h-7 hover:bg-error/20 hover:text-error text-slate-400 transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px]">stop</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleRestart(p.name) }}
                        className="w-7 h-7 hover:bg-tertiary/20 hover:text-tertiary text-slate-400 transition-colors flex items-center justify-center border-l border-white/5">
                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mb-3 truncate opacity-70 italic">{p.desc}</p>

            <div className="space-y-2">
              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div className={`h-full ${p.progressColor} rounded-full transition-all duration-1000`} style={{ width: `${p.progress}%` }} />
              </div>
              <div className="flex items-center justify-between bg-surface-container-highest/10 rounded-lg p-2 px-2.5">
                 <div className="flex items-center gap-3">
                   <div>
                     <p className="text-[8px] uppercase tracking-tighter text-slate-600 font-bold">CPU</p>
                     <p className="text-[10px] font-telemetry text-slate-300 font-bold leading-none">{p.cpu.toFixed(1)}%</p>
                   </div>
                   <div className="w-[1px] h-4 bg-white/5" />
                   <div>
                     <p className="text-[8px] uppercase tracking-tighter text-slate-600 font-bold">MEM</p>
                     <p className="text-[10px] font-telemetry text-slate-300 font-bold leading-none">{p.mem.toFixed(2)}G</p>
                   </div>
                   <div className="w-[1px] h-4 bg-white/5" />
                   <div>
                     <p className="text-[8px] uppercase tracking-tighter text-slate-600 font-bold">DISK</p>
                     <p className="text-[10px] font-telemetry text-slate-300 font-bold leading-none">{p.diskStr || '0MB'}</p>
                   </div>
                   <div className="w-[1px] h-4 bg-white/5" />
                   <div>
                     <p className="text-[8px] uppercase tracking-tighter text-slate-600 font-bold">UPTIME</p>
                     <p className="text-[10px] text-slate-300 font-bold leading-none">{p.uptime}</p>
                   </div>
                 </div>
              </div>
            </div>

            <div className="mt-3 flex justify-between items-center text-[9px] text-slate-600 pt-3 border-t border-white/5">
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.stopPropagation(); handleDelete(p.name) }} 
                  className="hover:text-error transition-all font-bold uppercase tracking-widest flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">delete</span> Delete
                </button>
                <div className="w-[1px] h-3 bg-white/10" />
                <button onClick={(e) => { e.stopPropagation(); openEdit(p) }} 
                  className="hover:text-amber-500 transition-all font-bold uppercase tracking-widest flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">edit_square</span> Edit
                </button>
                <div className="w-[1px] h-3 bg-white/10" />
                <Link to={`/logs?project=${encodeURIComponent(p.name)}`} className="text-primary hover:text-primary-container transition-colors font-bold uppercase tracking-widest flex items-center gap-1">
                  Logs <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                </Link>
              </div>
              <span className="italic opacity-60">Created: {p.lastDeploy}</span>
            </div>
          </div>
        ))}
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
      
      {/* Edit Modal */}
      {editProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditProject(null)}>
           <div className="bg-surface-container-low border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black text-white leading-tight">Edit Service</h3>
                  <p className="text-[11px] text-slate-400">Updating {editProject.name}</p>
                </div>
                <button onClick={() => setEditProject(null)} className="text-slate-400 hover:text-white transition-colors">
                   <span className="material-symbols-outlined">close</span>
                </button>
             </div>
             
             <form onSubmit={handleEditSave} className="space-y-4">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Exposed Port</label>
                   <input type="number" required value={editData.port} onChange={e => setEditData({...editData, port: e.target.value})} className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-2.5 text-xs focus:ring-1 focus:ring-primary focus:border-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Build / Install Execution</label>
                   <input type="text" required value={editData.installCmd} onChange={e => setEditData({...editData, installCmd: e.target.value})} className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-amber-500 font-telemetry p-2.5 text-[11px] focus:ring-1 focus:ring-primary focus:border-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Daemon Start Sequence</label>
                   <input type="text" required value={editData.runCmd} onChange={e => setEditData({...editData, runCmd: e.target.value})} className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-emerald-400 font-telemetry p-2.5 text-[11px] focus:ring-1 focus:ring-primary focus:border-primary outline-none" />
                </div>
                
                <div className="pt-4 flex justify-end gap-3 mt-2">
                   <button type="button" onClick={() => setEditProject(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                   <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-primary hover:text-white transition-all">Save Changes</button>
                </div>
             </form>
             
           </div>
        </div>
      )}
      
    </div>
  )
}
