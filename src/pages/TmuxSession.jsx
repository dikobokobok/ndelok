import { useEffect, useRef, useContext, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import socket from '../lib/socket'
import { AuthContext } from '../App'

export default function TmuxSession() {
  const { user } = useContext(AuthContext)
  const { sessionName } = useParams()
  const navigate = useNavigate()

  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const [isConnected, setIsConnected] = useState(true)

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
        cursor: '#10b981', // Emerald Cursor
        cursorAccent: '#0a0e1a',
        selectionBackground: '#10b98150',
        black: '#1e293b',
        red: '#f87171',
        green: '#10b981',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#34d399',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
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

    // Send input to backend PTY
    term.onData((data) => {
      socket.emit('terminal_input', data)
    })

    // Receive output from backend PTY
    const handleOutput = (data) => {
      term.write(data)
    }

    const handleExit = (code) => {
      term.write(`\r\n\x1b[90m[Terminal process ended with code ${code}]\x1b[0m\r\n`)
      setIsConnected(false)
    }

    socket.on('terminal_output', handleOutput)
    socket.on('terminal_exit', handleExit)

    // Start PTY session with tmux Session attachment
    if (sessionName) {
      socket.emit('terminal_start', { tmuxSession: sessionName })
    } else {
      socket.emit('terminal_start')
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        socket.emit('terminal_resize', { cols: term.cols, rows: term.rows })
      } catch (e) {}
    })
    resizeObserver.observe(termRef.current)

    return () => {
      socket.off('terminal_output', handleOutput)
      socket.off('terminal_exit', handleExit)
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
    }
  }, [sessionName])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1600px] mx-auto animate-in">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface-container/60 backdrop-blur-md border border-white/5 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5 flex items-center justify-center transition-all duration-200"
            title="Go Back"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-[18px]">terminal</span>
              <h2 className="text-lg font-black text-on-surface">Tmux Session</h2>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-telemetry font-bold">
                {sessionName}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-0.5">Attached directly to tmux terminal manager.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-start">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            isConnected 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            {isConnected ? 'ATTACHED' : 'DISCONNECTED'}
          </div>
          
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/5 border border-white/5 hover:border-emerald-500/30 text-xs font-bold text-slate-300 hover:text-emerald-400 rounded-xl transition-all duration-200"
          >
            <span className="material-symbols-outlined text-[14px]">sync</span>
            Reconnect
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="bg-[#0a0e1a] rounded-2xl border border-white/5 shadow-2xl overflow-hidden focus-within:border-emerald-500/40 transition-all duration-300">
        {/* Terminal Header */}
        <div className="bg-[#0f1525] px-4 py-2.5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
            </div>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest font-bold ml-3">
              {user?.username || 'user'}@{window.location.hostname} &mdash; tmux attach -t {sessionName}
            </span>
          </div>
        </div>

        {/* XTerm terminal wrapper */}
        <div ref={termRef} className="h-[60vh] sm:h-[65vh] px-1 py-1" />
      </div>

      {/* Shortcuts / Footer */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-surface-container/30 border border-white/5 px-5 py-3 rounded-xl text-[10.5px] text-slate-500 font-bold uppercase tracking-wide">
        <span className="text-slate-400 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-slate-500">keyboard</span>
          Tmux Key Shortcuts:
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono">Ctrl+B</kbd>
          <kbd className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono">D</kbd>
          <span className="text-slate-600 font-normal normal-case">&mdash; Detach from Session</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono">Ctrl+B</kbd>
          <kbd className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono">[</kbd>
          <span className="text-slate-600 font-normal normal-case">&mdash; Scroll / Copy Mode</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono">Ctrl+B</kbd>
          <kbd className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono">C</kbd>
          <span className="text-slate-600 font-normal normal-case">&mdash; Create Window</span>
        </span>
      </div>
    </div>
  )
}
