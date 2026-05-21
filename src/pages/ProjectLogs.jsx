import { useEffect, useRef, useContext } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import socket from '../lib/socket'
import { AuthContext } from '../App'

export default function ProjectLogs() {
  const { project } = useParams()
  const { user } = useContext(AuthContext)
  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return

    const term = new XTerm({
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, monospace",
      theme: {
        background: '#0a0e1a',
        foreground: '#e2e8f0',
        cursor: '#0a0e1a',
        cursorAccent: '#0a0e1a',
        selectionBackground: '#3b82f650',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
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

    // Subscribe to project logs
    socket.emit('subscribe_project_logs', project)

    // Receive buffered history
    const handleHistory = ({ project: p, data }) => {
      if (p === project) term.write(data)
    }

    // Receive real-time logs
    const handleLog = ({ project: p, data }) => {
      if (p === project) term.write(data)
    }

    socket.on('project_log_history', handleHistory)
    socket.on('project_log', handleLog)

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(termRef.current)

    return () => {
      socket.emit('unsubscribe_project_logs', project)
      socket.off('project_log_history', handleHistory)
      socket.off('project_log', handleLog)
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
    }
  }, [project])

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2 uppercase tracking-widest font-bold">
            <Link to="/projects" className="hover:text-primary transition-colors">Projects</Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">{project}</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">Live Logs</span>
          </nav>
          <h2 className="text-4xl font-black tracking-tight text-on-surface">Process Output</h2>
          <p className="text-slate-500 mt-2 text-sm">Real-time stdout/stderr dari proses <span className="text-primary font-bold">{project}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/projects" className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest text-xs font-bold rounded-xl hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Projects
          </Link>
          <Link to={`/logs?project=${encodeURIComponent(project)}`} className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest text-xs font-bold rounded-xl hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[16px]">list_alt</span>
            System Logs
          </Link>
        </div>
      </div>

      {/* Terminal */}
      <div className="bg-[#0a0e1a] rounded-xl border border-white/5 shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="bg-[#0f1525] px-4 py-2 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold ml-3">
              {project} — process output (read-only)
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold">
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              STREAMING
            </span>
          </div>
        </div>

        {/* Terminal container */}
        <div ref={termRef} className="h-[550px] px-1 py-1" />
      </div>
    </div>
  )
}
