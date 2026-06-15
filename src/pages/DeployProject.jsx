import { useState, useEffect, useRef, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import Toast from '../components/Toast'
import { AuthContext } from '../App'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

function DeployTerminal({ logs }) {
  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const lastWrittenIndexRef = useRef(0)

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return

    const term = new XTerm({
      cursorBlink: false,
      cursorStyle: 'underline',
      disableStdin: true,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, monospace",
      theme: {
        background: '#050811',
        foreground: '#cbd5e1',
        cursor: '#050811',
        cursorAccent: '#050811',
        selectionBackground: '#3b82f650',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#cbd5e1',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(termRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Write all current logs
    logs.forEach((log) => {
      const normalized = log.replace(/\r?\n/g, '\r\n')
      term.write(normalized + '\r\n')
    })
    lastWrittenIndexRef.current = logs.length

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(termRef.current)

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
    }
  }, [])

  // Handle incoming logs updates
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return

    // If logs were cleared/reset
    if (logs.length < lastWrittenIndexRef.current) {
      term.clear()
      lastWrittenIndexRef.current = 0
    }

    const newLogs = logs.slice(lastWrittenIndexRef.current)
    newLogs.forEach((log) => {
      const normalized = log.replace(/\r?\n/g, '\r\n')
      term.write(normalized + '\r\n')
    })
    lastWrittenIndexRef.current = logs.length
  }, [logs])

  return (
    <div ref={termRef} className="h-[380px] w-full px-1 py-1" />
  )
}

export default function DeployProject() {
  const { authenticatedFetch } = useContext(AuthContext)
  const [formData, setFormData] = useState({ name: '', repo: '', installCmd: '', runCmd: '', port: '', domain: '', accessType: 'port' })
  const [uploadMode, setUploadMode] = useState('github') // 'github' | 'file'
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [logs, setLogs] = useState([])
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadComplete(false)

    // Simulate upload progress
    const totalSize = files.reduce((acc, f) => acc + f.size, 0)
    let loaded = 0
    const chunkSize = totalSize / 20 // 20 steps
    
    const progressInterval = setInterval(() => {
      loaded += chunkSize
      const percent = Math.min(Math.round((loaded / totalSize) * 100), 100)
      setUploadProgress(percent)

      if (percent >= 100) {
        clearInterval(progressInterval)
        setTimeout(() => {
          setUploadedFiles(prev => [...prev, ...files])
          setIsUploading(false)
          setUploadComplete(true)
          setToast({ type: 'success', msg: `${files.length} file berhasil diupload!` })
          // Hide success state after 3s
          setTimeout(() => setUploadComplete(false), 3000)
        }, 300)
      }
    }, 80)
  }

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  const handleDeploy = async (e) => {
    e.preventDefault()

    // Validasi: jika mode file, pastikan ada file yang diupload
    if (uploadMode === 'file' && uploadedFiles.length === 0) {
      setToast({ type: 'error', msg: 'Silakan upload file/folder terlebih dahulu.' })
      return
    }

    // Validasi: jika mode github, pastikan repo diisi
    if (uploadMode === 'github' && !formData.repo.trim()) {
      setToast({ type: 'error', msg: 'Silakan masukkan GitHub source link.' })
      return
    }

    setIsDeploying(true)
    setLogs(['[SYSTEM] Initializing deployment subsystem...', '[SYSTEM] Allocating workspace container...'])
    
    try {
      let res
      if (uploadMode === 'github') {
        res = await authenticatedFetch('/api/project-deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      } else {
        const fd = new FormData()
        fd.append('name', formData.name)
        fd.append('port', formData.port)
        fd.append('domain', formData.domain)
        fd.append('accessType', formData.accessType)
        fd.append('installCmd', formData.installCmd)
        fd.append('runCmd', formData.runCmd)
        // Send paths as JSON so server can reconstruct directory structure
        const paths = uploadedFiles.map(f => f.webkitRelativePath || f.name)
        fd.append('paths', JSON.stringify(paths))
        uploadedFiles.forEach(file => fd.append('files', file))
        res = await authenticatedFetch('/api/project-deploy-upload', {
          method: 'POST',
          body: fd
        })
      }
      
      if (!res.ok) throw new Error('Deployment request rejected')
      
      const poll = setInterval(async () => {
        try {
          const logRes = await authenticatedFetch(`/api/deploy-logs?name=${encodeURIComponent(formData.name)}`)
          if (logRes && logRes.ok) {
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
    <div className="p-4 sm:p-6 max-w-[1100px] mx-auto animate-in fade-in duration-500 min-h-[85vh] flex flex-col">
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
                  <p className="text-slate-400 text-xs leading-relaxed">Ndelok Engine mendukung dua metode upload: <span className="text-primary font-semibold">GitHub</span> (hanya branch main) atau <span className="text-emerald-400 font-semibold">Upload File</span> langsung dari file manager Anda.</p>
               </div>
               <div className="space-y-3 pt-3 border-t border-primary/10">
                  <div className="flex items-start gap-2">
                     <span className="material-symbols-outlined text-emerald-400 text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                     <div>
                        <h4 className="font-bold text-white text-xs">GitHub (Main Branch)</h4>
                        <p className="text-[10px] text-slate-500">Clone otomatis dari branch main.</p>
                     </div>
                  </div>
                  <div className="flex items-start gap-2">
                     <span className="material-symbols-outlined text-emerald-400 text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                     <div>
                        <h4 className="font-bold text-white text-xs">Upload File / Folder</h4>
                        <p className="text-[10px] text-slate-500">Upload langsung dari file manager.</p>
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
              <div className="flex-1 overflow-hidden p-2 bg-[#050811]">
                <DeployTerminal logs={logs} />
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
                   pattern="^[a-zA-Z0-9\-_ ]+$"
                   title="Only alphanumeric, dashes, underscores, and spaces are allowed."
                   disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                   className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-tertiary focus:border-tertiary outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
               </div>

               {/* Port */}
               <div className="space-y-2 text-[13px]">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                     <span className="material-symbols-outlined text-[14px] text-cyan-400">api</span>
                     Access Type
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFormData({ ...formData, accessType: 'port' })}
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className={`flex-1 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${formData.accessType === 'port' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-[#0a0f1d] border-white/10 text-slate-500 hover:border-white/20'} disabled:opacity-50`}>
                      Port
                    </button>
                    <button type="button" onClick={() => setFormData({ ...formData, accessType: 'domain' })}
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className={`flex-1 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${formData.accessType === 'domain' ? 'bg-violet-500/20 border-violet-500 text-violet-400' : 'bg-[#0a0f1d] border-white/10 text-slate-500 hover:border-white/20'} disabled:opacity-50`}>
                      Domain
                    </button>
                  </div>
                  {formData.accessType === 'port' ? (
                    <input type="number" value={formData.port} onChange={e => setFormData({ ...formData, port: e.target.value })}
                      placeholder="e.g. 3000"
                      min="1" max="65535"
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
                  ) : (
                    <input type="text" value={formData.domain} onChange={e => setFormData({ ...formData, domain: e.target.value })}
                      placeholder="e.g. api.example.com"
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
                  )}
               </div>

               {/* Upload Mode Toggle */}
               <div className="space-y-3 md:col-span-2 text-[13px]">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                     <span className="material-symbols-outlined text-[14px] text-primary">cloud_upload</span>
                     Source Method
                  </label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setUploadMode('github')}
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${uploadMode === 'github' ? 'bg-primary/20 border-primary text-primary shadow-[0_0_12px_rgba(99,102,241,0.2)]' : 'bg-[#0a0f1d] border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'} disabled:opacity-50`}>
                      <span className="material-symbols-outlined text-[16px]">source</span>
                      Upload from GitHub
                    </button>
                    <button type="button" onClick={() => setUploadMode('file')}
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${uploadMode === 'file' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]' : 'bg-[#0a0f1d] border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'} disabled:opacity-50`}>
                      <span className="material-symbols-outlined text-[16px]">folder_open</span>
                      Upload File
                    </button>
                  </div>
               </div>

               {/* GitHub Source (only branch main) */}
               {uploadMode === 'github' && (
                 <div className="space-y-2 md:col-span-2 text-[13px] animate-in fade-in duration-300">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                       <span className="material-symbols-outlined text-[14px] text-primary">source</span>
                       GitHub Source Link
                       <span className="ml-auto text-[9px] font-medium text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full">branch: main only</span>
                    </label>
                    <input type="text" value={formData.repo} onChange={e => setFormData({ ...formData, repo: e.target.value })}
                      placeholder="https://github.com/user/repo"
                      disabled={isDeploying || (logs.length > 0 && !logs.some(l => l.includes('[ERROR]')))}
                      className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-on-surface p-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-600 disabled:opacity-50" />
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">info</span>
                      Hanya branch <span className="text-primary font-bold">main</span> yang didukung. Pastikan repository memiliki branch main.
                    </p>
                 </div>
               )}

               {/* File Upload */}
               {uploadMode === 'file' && (
                 <div className="space-y-3 md:col-span-2 text-[13px] animate-in fade-in duration-300">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                       <span className="material-symbols-outlined text-[14px] text-emerald-400">upload_file</span>
                       Upload File / Folder
                    </label>
                    
                    {/* Drop zone */}
                    <div 
                      onClick={() => !isDeploying && !isUploading && fileInputRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${uploadedFiles.length > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-[#0a0f1d] hover:border-emerald-500/40 hover:bg-emerald-500/5'} ${isDeploying || isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <span className="material-symbols-outlined text-3xl text-emerald-400 mb-2 block">cloud_upload</span>
                      <p className="text-xs text-slate-300 font-medium">Klik untuk memilih file atau folder</p>
                      <p className="text-[10px] text-slate-500 mt-1">Mendukung file dan folder project</p>
                    </div>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      multiple 
                      webkitdirectory=""
                      onChange={handleFileUpload}
                      className="hidden" 
                    />

                    {/* Upload Progress Bar */}
                    {isUploading && (
                      <div className="bg-[#0a0f1d] border border-white/10 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-emerald-400 animate-spin">progress_activity</span>
                            <span className="text-[11px] font-bold text-slate-300">Mengupload file...</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-400">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-150 ease-out shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500">Mohon tunggu, sedang memproses file...</p>
                      </div>
                    )}

                    {/* Upload Success Notification */}
                    {uploadComplete && !isUploading && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <span className="material-symbols-outlined text-emerald-400 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <div>
                          <p className="text-[11px] font-bold text-emerald-300">Upload berhasil!</p>
                          <p className="text-[10px] text-emerald-400/70">{uploadedFiles.length} file siap untuk deploy</p>
                        </div>
                      </div>
                    )}

                    {/* Uploaded files list */}
                    {uploadedFiles.length > 0 && !isUploading && (
                      <div className="bg-[#0a0f1d] border border-white/10 rounded-xl p-3 max-h-[200px] overflow-y-auto custom-scrollbar space-y-1.5 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[14px] text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>folder</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{uploadedFiles.length} file(s) uploaded</span>
                          </div>
                          <button type="button" onClick={() => { setUploadedFiles([]); setUploadComplete(false) }} className="text-[10px] text-rose-400 hover:text-rose-300 font-bold transition-colors">Clear All</button>
                        </div>
                        {/* Show folders first, then files */}
                        {(() => {
                          const folders = new Set()
                          const rootFiles = []
                          const rootFolder = uploadedFiles[0]?.webkitRelativePath?.split('/')[0] || ''
                          
                          uploadedFiles.forEach(file => {
                            const rel = file.webkitRelativePath || file.name
                            const parts = rel.split('/')
                            // Strip root folder
                            const stripped = rootFolder && parts[0] === rootFolder ? parts.slice(1) : parts
                            if (stripped.length > 1) {
                              folders.add(stripped[0])
                            } else {
                              rootFiles.push({ name: stripped[0], size: file.size })
                            }
                          })
                          
                          return (
                            <>
                              {[...folders].sort().map((folder, i) => (
                                <div key={`folder-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5">
                                  <span className="material-symbols-outlined text-[14px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>folder</span>
                                  <span className="text-[11px] text-slate-300 flex-1">{folder}</span>
                                  <span className="text-[10px] text-slate-500">File folder</span>
                                </div>
                              ))}
                              {rootFiles.map((file, i) => (
                                <div key={`file-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5">
                                  <span className="material-symbols-outlined text-[14px] text-slate-400">description</span>
                                  <span className="text-[11px] text-slate-300 flex-1 truncate">{file.name}</span>
                                  <span className="text-[10px] text-slate-500">{formatFileSize(file.size)}</span>
                                </div>
                              ))}
                            </>
                          )
                        })()}
                      </div>
                    )}
                 </div>
               )}

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
