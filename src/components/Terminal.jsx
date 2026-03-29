import React, { useState, useEffect, useRef } from 'react'
import socket from '../lib/socket'

export default function Terminal() {
  const [lines, setLines] = useState([
    { type: 'system', content: 'NDELOK.ME INFRASTRUCTURE SHELL v1.0.0' },
    { type: 'system', content: 'CONNECTED TO LOCAL NODE: ' + window.location.hostname },
    { type: 'system', content: 'TYPE "help" FOR COMMANDS' },
    { type: 'empty', content: '' }
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    const handleOutput = (data) => {
      setLines(prev => [...prev, { type: 'output', content: data }])
    }
    socket.on('terminal_output', handleOutput)
    return () => socket.off('terminal_output', handleOutput)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const handleCommand = (e) => {
    if (e.key === 'Enter') {
      const cmd = input.trim()
      if (!cmd) return

      setLines(prev => [...prev, { type: 'command', content: '> ' + cmd }])
      
      if (cmd === 'clear') {
        setLines([])
      } else if (cmd === 'help') {
        setLines(prev => [...prev, { type: 'system', content: 'Available: ls, dir, echo, ping, uptime, clear, node -v, git status' }])
      } else {
        socket.emit('terminal_command', cmd)
      }
      
      setInput('')
    }
  }

  return (
    <div className="bg-[#050914] rounded-xl border border-white/5 shadow-2xl overflow-hidden font-telemetry text-sm">
      <div className="bg-surface-container-high px-4 py-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-error/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-tertiary/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold ml-4">Terminal — Session_01</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold">
          <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> SSH READY</span>
          <span>127.0.0.1</span>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="h-[300px] overflow-y-auto p-4 space-y-1 custom-scrollbar selection:bg-primary/30"
      >
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap ${
            l.type === 'system' ? 'text-primary/70 italic' : 
            l.type === 'command' ? 'text-emerald-400 font-bold' : 
            'text-slate-300'
          }`}>
            {l.content}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-emerald-400 font-bold shrink-0">$</span>
          <input 
            type="text"
            className="bg-transparent border-none outline-none p-0 w-full text-slate-300 font-telemetry"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleCommand}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  )
}
