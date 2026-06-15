import { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import socket from '../lib/socket'
import { AuthContext } from '../App'

// ── Helpers ────────────────────────────────────────────────────────
const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,32}$/

// ── Tmux Terminal Modal ────────────────────────────────────────────
function TmuxTerminalModal({ sessionName, onClose }) {
  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const attachedRef = useRef(false)
  // true only when user clicked the Detach button — prevents auto-close on normal PTY exit
  const userDetachedRef = useRef(false)

  const [sessionEnded, setSessionEnded] = useState(false)
  const [endedMsg, setEndedMsg] = useState('')

  const doAttach = useCallback((term) => {
    userDetachedRef.current = false
    setSessionEnded(false)
    socket.emit('tmux_attach', { sessionName })
    attachedRef.current = true
    term.clear()
    term.write(`\x1b[90mConnecting to session "${sessionName}"...\x1b[0m\r\n`)
  }, [sessionName])

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, monospace",
      theme: {
        background: '#0a0e1a',
        foreground: '#e2e8f0',
        cursor: '#34d399',
        cursorAccent: '#0a0e1a',
        selectionBackground: '#34d39950',
        black: '#1e293b', red: '#f87171', green: '#4ade80', yellow: '#fbbf24',
        blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e2e8f0',
        brightBlack: '#475569', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#f8fafc',
      },
      allowProposedApi: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(termRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    term.onData((data) => socket.emit('tmux_input', data))

    const handleOutput = (data) => term.write(data)

    const handleExit = (code) => {
      attachedRef.current = false
      // User clicked Detach — close modal
      if (userDetachedRef.current) {
        onClose()
        return
      }
      // PTY exited on its own — show reconnect overlay instead of closing
      term.write('\r\n\x1b[90m[Process exited with code ' + code + ']\x1b[0m\r\n')
      if (code === 0) {
        setEndedMsg('Session detached or ended normally.')
      } else {
        setEndedMsg('Process exited (code ' + code + '). The session may still exist.')
      }
      setSessionEnded(true)
    }

    const handleDetached = () => {
      attachedRef.current = false
      if (userDetachedRef.current) {
        // User clicked Detach button — close
        onClose()
      } else {
        // External detach (e.g. another client detached the session)
        term.write('\r\n\x1b[33m[Detached from tmux session]\x1b[0m\r\n')
        setEndedMsg('Detached from session.')
        setSessionEnded(true)
      }
    }

    socket.on('tmux_output', handleOutput)
    socket.on('tmux_exit', handleExit)
    socket.on('tmux_detached', handleDetached)

    doAttach(term)

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        socket.emit('tmux_resize', { cols: term.cols, rows: term.rows })
      } catch (e) {}
    })
    resizeObserver.observe(termRef.current)

    return () => {
      socket.off('tmux_output', handleOutput)
      socket.off('tmux_exit', handleExit)
      socket.off('tmux_detached', handleDetached)
      resizeObserver.disconnect()
      if (attachedRef.current) {
        socket.emit('tmux_detach')
        attachedRef.current = false
      }
      term.dispose()
      xtermRef.current = null
    }
  }, [sessionName, onClose, doAttach])

  const handleDetachBtn = () => {
    userDetachedRef.current = true
    socket.emit('tmux_detach')
    attachedRef.current = false
    // Fallback close after 700ms if PTY doesn't respond
    setTimeout(() => onClose(), 700)
  }

  const handleReconnect = () => {
    if (xtermRef.current) {
      setSessionEnded(false)
      doAttach(xtermRef.current)
    }
  }

  const statusDot = sessionEnded ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
  const statusText = sessionEnded ? 'ended' : 'attached'

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex flex-col" onClick={(e) => e.stopPropagation()}>
      {/* Top bar */}
      <div className="bg-[#0f1525] border-b border-white/10 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span className="material-symbols-outlined text-emerald-400 text-[16px]">terminal</span>
            <span className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
              tmux &mdash; <span className="text-emerald-400">{sessionName}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
            <span className="text-[10px] text-slate-500 uppercase font-bold">{statusText}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!sessionEnded && (
            <button
              onClick={handleDetachBtn}
              title="Detach (Ctrl+B D)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">logout</span>
              Detach
            </button>
          )}
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* Terminal + overlay */}
      <div className="flex-1 bg-[#0a0e1a] overflow-hidden relative">
        <div ref={termRef} className="h-full w-full px-1 py-1" />

        {/* Session Ended Overlay — shown when PTY exits without user detach */}
        {sessionEnded && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="bg-[#0f1525] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-amber-400 text-[22px]">terminal</span>
              </div>
              <p className="text-sm font-black text-white mb-1">Session Ended</p>
              <p className="text-[11px] text-slate-400 mb-5 leading-relaxed">{endedMsg}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleReconnect}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Reconnect
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom hint bar */}
      <div className="bg-[#0f1525] border-t border-white/5 px-4 py-1.5 flex items-center gap-4 flex-shrink-0">
        <span className="text-[10px] text-slate-600">
          <kbd className="bg-white/5 px-1.5 py-0.5 rounded text-slate-400 font-mono">Ctrl+B</kbd>
          {' '}<kbd className="bg-white/5 px-1.5 py-0.5 rounded text-slate-400 font-mono">D</kbd>
          {' '}&#8212; Detach
        </span>
        <span className="text-[10px] text-slate-600">
          <kbd className="bg-white/5 px-1.5 py-0.5 rounded text-slate-400 font-mono">Ctrl+B</kbd>
          {' '}<kbd className="bg-white/5 px-1.5 py-0.5 rounded text-slate-400 font-mono">[</kbd>
          {' '}&#8212; Scroll mode
        </span>
      </div>
    </div>
  )
}

// ── Main TmuxPlugin Component ──────────────────────────────────────
export default function TmuxPlugin() {
  const { authenticatedFetch } = useContext(AuthContext)
  const navigate = useNavigate()

  const [status, setStatus] = useState(null)
  const [sessions, setSessions] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [attachSession, setAttachSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [error, setError] = useState('')

  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installLog, setInstallLog] = useState('')
  const [installDone, setInstallDone] = useState(false)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const [deleteLoading, setDeleteLoading] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/tmux/status')
      if (!res?.ok) return
      const data = await res.json()
      setStatus(data)
    } catch (e) {
      setError('Gagal memeriksa status tmux')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch])

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await authenticatedFetch('/api/tmux/sessions')
      if (!res?.ok) return
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (e) {
      setError('Gagal mengambil session tmux')
    } finally {
      setSessionsLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  useEffect(() => {
    if (status?.installed && panelOpen) fetchSessions()
  }, [status, panelOpen, fetchSessions])

  useEffect(() => {
    const handleOutput = ({ text, progress }) => {
      setInstallLog(prev => prev + text)
      if (progress !== undefined) setInstallProgress(progress)
    }
    const handleDone = ({ success, version }) => {
      setInstallProgress(100)
      setInstalling(false)
      setInstallDone(true)
      if (success) {
        setTimeout(() => {
          setStatus({ installed: true, version })
          setInstallDone(false)
          setInstallLog('')
          setInstallProgress(0)
        }, 1200)
      } else {
        setError('Instalasi gagal. Cek log di bawah.')
      }
    }
    socket.on('tmux_install_output', handleOutput)
    socket.on('tmux_install_done', handleDone)
    return () => {
      socket.off('tmux_install_output', handleOutput)
      socket.off('tmux_install_done', handleDone)
    }
  }, [])

  const handleInstall = () => {
    setInstalling(true)
    setInstallProgress(2)
    setInstallLog('')
    setError('')
    socket.emit('tmux_install_start')
  }

  const handleCreateSession = async (e) => {
    e.preventDefault()
    const name = newSessionName.trim()
    if (!SESSION_NAME_RE.test(name)) {
      setCreateError('Nama session hanya boleh huruf, angka, - dan _. Maks 32 karakter.')
      return
    }
    setCreateLoading(true)
    setCreateError('')
    try {
      const res = await authenticatedFetch('/api/tmux/session', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error || 'Gagal membuat session'); return }
      setNewSessionName('')
      setShowCreateForm(false)
      await fetchSessions()
    } catch (e) {
      setCreateError(e.message)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDeleteSession = async (name) => {
    setDeleteLoading(name)
    setError('')
    try {
      const res = await authenticatedFetch(`/api/tmux/session?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Gagal menghapus session'); return }
      await fetchSessions()
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleteLoading('')
    }
  }

  const handleOpenPanel = () => {
    setPanelOpen(true)
    setShowCreateForm(false)
    setCreateError('')
    setNewSessionName('')
  }

  const hasSessions = sessions.length > 0
  const forceCreate = panelOpen && !hasSessions && !sessionsLoading

  return (
    <>
      {attachSession && (
        <TmuxTerminalModal
          sessionName={attachSession}
          onClose={() => setAttachSession(null)}
        />
      )}

      <div className="bg-surface-container-low rounded-xl border border-white/5 p-4 shadow-xl hover:border-emerald-500/30 transition-all duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">terminal</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-on-surface">Tmux</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Session Manager</p>
          </div>
          {status?.installed && !installing && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-[10px] font-telemetry text-emerald-400 font-bold">{status.version}</span>
            </div>
          )}
          {!status?.installed && !loading && !installing && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
              <span className="text-[10px] text-slate-500 font-bold">Not Installed</span>
            </div>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <span className="material-symbols-outlined animate-spin text-slate-500 text-[20px]">progress_activity</span>
          </div>

        ) : installing || installDone ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-emerald-400 text-[16px] animate-spin">progress_activity</span>
              <p className="text-[11px] font-bold text-slate-300">
                {installDone ? 'Instalasi selesai!' : 'Menginstall tmux...'}
              </p>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${installProgress}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-500 font-telemetry text-right">{installProgress}%</p>
            {installLog && (
              <div className="bg-black/40 rounded-lg p-2 max-h-[80px] overflow-y-auto border border-white/5">
                <pre className="text-[9px] font-telemetry text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
                  {installLog.slice(-800)}
                </pre>
              </div>
            )}
          </div>

        ) : !status?.installed ? (
          <div className="space-y-3 flex-1">
            <p className="text-[11px] text-slate-400">
              Tmux belum terinstall di server ini. Install untuk mengaktifkan fitur session management.
            </p>
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2.5">
              <p className="text-[10px] text-emerald-300/80 leading-relaxed font-telemetry">
                <span className="text-emerald-400">$</span> apt update &amp;&amp; apt-get install -y tmux
              </p>
            </div>
            {error && (
              <p className="text-[10px] text-rose-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">error</span>{error}
              </p>
            )}
            <button
              onClick={handleInstall}
              className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5 mt-auto"
            >
              <span className="material-symbols-outlined text-[14px]">download</span>
              Install Tmux
            </button>
          </div>

        ) : !panelOpen ? (
          <div className="flex-1 flex flex-col justify-between">
            <p className="text-[11px] text-slate-400 mb-3">
              Tmux terinstall. Kelola session terminal multiplexer di server ini.
            </p>
            {error && (
              <p className="text-[10px] text-rose-400 flex items-center gap-1 mb-2">
                <span className="material-symbols-outlined text-[12px]">error</span>{error}
              </p>
            )}
            <button
              onClick={handleOpenPanel}
              className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">view_list</span>
              Sessions
            </button>
          </div>

        ) : (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sessions</p>
              <div className="flex items-center gap-1.5">
                {hasSessions && (
                  <button
                    onClick={() => { setShowCreateForm(true); setCreateError(''); setNewSessionName('') }}
                    title="New session"
                    className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                  </button>
                )}
                <button
                  onClick={() => fetchSessions()}
                  title="Refresh"
                  className="w-6 h-6 rounded-md bg-white/5 text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center"
                >
                  <span className={`material-symbols-outlined text-[13px] ${sessionsLoading ? 'animate-spin' : ''}`}>refresh</span>
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  title="Close panel"
                  className="w-6 h-6 rounded-md bg-white/5 text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[13px]">expand_less</span>
                </button>
              </div>
            </div>

            {sessionsLoading && (
              <div className="flex items-center justify-center py-4">
                <span className="material-symbols-outlined animate-spin text-slate-600 text-[18px]">progress_activity</span>
              </div>
            )}

            {!sessionsLoading && forceCreate && (
              <div className="space-y-2">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5 mb-1">
                  <p className="text-[10px] text-amber-300 leading-relaxed flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-[12px] flex-shrink-0 mt-0.5">info</span>
                    Belum ada session. Buat satu session untuk memulai.
                  </p>
                </div>
                <form onSubmit={handleCreateSession} className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Nama Session
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={newSessionName}
                    onChange={(e) => { setNewSessionName(e.target.value); setCreateError('') }}
                    placeholder="contoh: main"
                    maxLength={32}
                    disabled={createLoading}
                    className="w-full bg-black/30 border border-white/10 rounded-xl text-white p-2 text-sm font-telemetry focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                  />
                  {createError && (
                    <p className="text-[10px] text-rose-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">error</span>{createError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={createLoading || !newSessionName.trim()}
                    className="w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    {createLoading
                      ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                      : <span className="material-symbols-outlined text-[14px]">add_circle</span>
                    }
                    Create Session
                  </button>
                </form>
              </div>
            )}

            {!sessionsLoading && hasSessions && (
              <div className="space-y-1.5">
                {sessions.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 group">
                    <button
                      onClick={() => navigate(`/tmux/${encodeURIComponent(s.name)}`)}
                      className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all text-left"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="text-[11px] font-telemetry text-slate-300 group-hover:text-emerald-300 transition-colors flex-1 truncate font-bold">
                        {s.name}
                      </span>
                      {s.windows !== undefined && (
                        <span className="text-[9px] text-slate-600 font-telemetry flex-shrink-0">
                          {s.windows}w
                        </span>
                      )}
                      <span className="material-symbols-outlined text-[13px] text-slate-600 group-hover:text-emerald-400 transition-colors flex-shrink-0">
                        arrow_forward
                      </span>
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s.name)}
                      disabled={deleteLoading === s.name}
                      title={`Kill session ${s.name}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0 disabled:opacity-40"
                    >
                      {deleteLoading === s.name
                        ? <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                        : <span className="material-symbols-outlined text-[13px]">delete</span>
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!sessionsLoading && hasSessions && showCreateForm && (
              <form onSubmit={handleCreateSession} className="space-y-2 pt-1 border-t border-white/5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Session Baru
                </label>
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={newSessionName}
                    onChange={(e) => { setNewSessionName(e.target.value); setCreateError('') }}
                    placeholder="nama-session"
                    maxLength={32}
                    disabled={createLoading}
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl text-white px-2.5 py-1.5 text-sm font-telemetry focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={createLoading || !newSessionName.trim()}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black text-white bg-emerald-500 hover:bg-emerald-600 transition-colors disabled:opacity-40 flex items-center gap-1"
                  >
                    {createLoading
                      ? <span className="material-symbols-outlined animate-spin text-[13px]">progress_activity</span>
                      : <span className="material-symbols-outlined text-[13px]">add</span>
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setNewSessionName(''); setCreateError('') }}
                    className="px-2 py-1.5 rounded-xl text-[11px] text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
                {createError && (
                  <p className="text-[10px] text-rose-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">error</span>{createError}
                  </p>
                )}
              </form>
            )}

            {error && !createError && (
              <p className="text-[10px] text-rose-400 flex items-center gap-1 mt-1">
                <span className="material-symbols-outlined text-[12px]">error</span>{error}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
