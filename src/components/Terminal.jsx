import { useEffect, useRef, useContext } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import socket from '../lib/socket'
import { AuthContext } from '../App'

export default function Terminal() {
  const { user } = useContext(AuthContext)
  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)

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
        cursor: '#60a5fa',
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
      scrollback: 5000,
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
      term.write(`\r\n\x1b[90m[Terminal session ended with code ${code}]\x1b[0m\r\n`)
      // Auto-restart after 1s
      setTimeout(() => socket.emit('terminal_start'), 1000)
    }

    socket.on('terminal_output', handleOutput)
    socket.on('terminal_exit', handleExit)

    // Start PTY session
    socket.emit('terminal_start')

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      socket.emit('terminal_resize', { cols: term.cols, rows: term.rows })
    })
    resizeObserver.observe(termRef.current)

    return () => {
      socket.off('terminal_output', handleOutput)
      socket.off('terminal_exit', handleExit)
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
    }
  }, [])

  return (
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
            {user?.username || 'user'}@{window.location.hostname} — {navigator.platform.includes('Win') ? 'PowerShell' : 'bash'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            CONNECTED
          </span>
        </div>
      </div>

      {/* Terminal container */}
      <div ref={termRef} className="h-[380px] px-1 py-1" />
    </div>
  )
}
