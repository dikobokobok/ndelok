import { useState, useEffect, useRef, useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AuthContext } from '../App'

export default function AiChatPopup() {
  const { authenticatedFetch } = useContext(AuthContext)
  const [isOpen, setIsOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputMsg, setInputMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
   
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortControllerRef = useRef(null)

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setSending(false)
  }

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, sending])

  const loadSessions = async () => {
    try {
      const res = await authenticatedFetch('/api/ai/chats')
      if (!res?.ok) return
      const data = await res.json()
      setSessions(data)
      if (data.length > 0 && !activeSessionId) {
        selectSession(data[0])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const selectSession = (session) => {
    setActiveSessionId(session.id)
    setMessages(session.messages || [])
    setErrorMsg('')
  }

  const handleCreateSession = async () => {
    try {
      const title = `Chat - ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
      const res = await authenticatedFetch('/api/ai/chats', {
        method: 'POST',
        body: JSON.stringify({ title })
      })
      if (!res?.ok) return
      const data = await res.json()
      setSessions(prev => [data, ...prev])
      selectSession(data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteSession = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this chat history?')) return
    try {
      const res = await authenticatedFetch(`/api/ai/chats?id=${id}`, {
        method: 'DELETE'
      })
      if (!res?.ok) return
      setSessions(prev => prev.filter(s => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!inputMsg.trim() || sending) return

    let currentSessionId = activeSessionId
    if (!currentSessionId) {
      // Auto-create session if none active
      try {
        const title = `Chat - ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
        const res = await authenticatedFetch('/api/ai/chats', {
          method: 'POST',
          body: JSON.stringify({ title })
        })
        if (!res?.ok) return
        const data = await res.json()
        setSessions(prev => [data, ...prev])
        currentSessionId = data.id
        setActiveSessionId(data.id)
      } catch (e) {
        console.error(e)
        return
      }
    }

    const msgText = inputMsg.trim()
    setInputMsg('')
    setSending(true)
    setErrorMsg('')

    // Optimistically update UI
    setMessages(prev => [...prev, { role: 'user', content: msgText }])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await authenticatedFetch('/api/ai/chat', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: currentSessionId,
          message: msgText
        })
      })
      if (!res?.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to communicate with AI')
      }
      const data = await res.json()
      setMessages(data.messages || [])
      
      // Update session title in list if it was a new chat
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: data.messages }
        }
        return s
      }))
    } catch (err) {
      if (err.name === 'AbortError') {
        setErrorMsg('Pencarian / eksekusi AI dihentikan oleh pengguna.')
      } else {
        setErrorMsg(err.message)
      }
    } finally {
      setSending(false)
      abortControllerRef.current = null
    }
  }

  // Helper to render collapsible toolcalls
  const ToolLogs = ({ message, nextToolResponse }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    if (!message.toolCalls) return null
    return (
      <div className="my-2 border border-white/5 rounded-xl overflow-hidden bg-black/40">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 flex items-center justify-between text-[10px] text-primary hover:bg-white/5 font-black uppercase tracking-wider transition-all"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">terminal</span>
            AI Executed {message.toolCalls.length} tool(s)
          </span>
          <span className="material-symbols-outlined text-[14px]">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {isExpanded && (
          <div className="p-3 border-t border-white/5 space-y-3 font-telemetry">
            {message.toolCalls.map((tc, idx) => {
              const resp = nextToolResponse && nextToolResponse[idx] ? nextToolResponse[idx].content : 'No output'
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="text-[10px] text-emerald-400 font-bold uppercase">
                    &gt; call_{tc.name}({JSON.stringify(tc.args)})
                  </div>
                  <pre className="p-2 bg-black/80 rounded-lg text-[9px] text-slate-400 whitespace-pre-wrap break-all leading-normal max-h-40 overflow-y-auto">
                    {resp}
                  </pre>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Render conversation history
  const renderMessageList = () => {
    const renderList = []
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.role === 'user') {
        renderList.push(
          <div key={`msg-${i}`} className="flex justify-end mb-4 animate-in slide-in-from-right-2 duration-300">
            <div className="max-w-[85%] bg-primary text-white text-xs px-4 py-3 rounded-2xl rounded-tr-none shadow-md">
              {msg.content}
            </div>
          </div>
        )
      } else if (msg.role === 'model') {
        // Find tool responses associated with this model call
        const toolResponses = []
        let j = i + 1
        while (j < messages.length && messages[j].role === 'tool') {
          toolResponses.push(messages[j])
          j++
        }
        
        renderList.push(
          <div key={`msg-${i}`} className="flex justify-start mb-4 animate-in slide-in-from-left-2 duration-300">
            <div className="max-w-[85%] space-y-2">
              {/* Collapsible Tool calls */}
              {msg.toolCalls && <ToolLogs message={msg} nextToolResponse={toolResponses} />}
              
              {/* Text part */}
              {msg.content && (
                <div className="bg-[#1b223c]/50 border border-white/5 text-slate-200 text-xs px-4 py-3 rounded-2xl rounded-tl-none shadow-md prose prose-invert prose-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )
        // Skip over the tool responses in the loop since they are rendered inside the model block
        i = j - 1
      }
    }

    return renderList
  }

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-primary-border text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all z-[100] border border-white/10 group animate-pulse-slow"
      >
        <span className="material-symbols-outlined text-[26px] group-hover:rotate-12 transition-transform">
          {isOpen ? 'close' : 'forum'}
        </span>
      </button>

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[380px] sm:w-[420px] h-[550px] bg-[#0f1425]/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl z-[100] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-300">
          
          {/* Header */}
          <div className="px-5 py-3.5 bg-[#141b31] border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[16px]">smart_toy</span>
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest leading-none">AI Copilot</h3>
                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">OPENCODE ZEN AGENT</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          {/* Body Split: Left list / Right Chat */}
          <div className="flex-1 flex overflow-hidden">
            
            {/* Session Switcher Sidebar (gorgeous mini-list) */}
            <div className="w-20 bg-[#0a0e1a]/80 border-r border-white/5 flex flex-col items-center py-4 gap-3 overflow-y-auto shrink-0 custom-scrollbar">
              <button
                onClick={handleCreateSession}
                title="New Chat"
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 hover:border-primary/40 text-slate-400 hover:text-white flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
              <div className="w-8 h-[1px] bg-white/5" />
              {sessions.map(s => {
                const isActive = s.id === activeSessionId
                return (
                  <div key={s.id} className="relative group/sess">
                    <button
                      onClick={() => selectSession(s)}
                      title={s.title}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] tracking-tighter uppercase transition-all ${isActive ? 'bg-primary/20 border-l-2 border-primary text-primary' : 'bg-white/[0.02] border border-white/5 text-slate-500 hover:text-slate-300'}`}
                    >
                      AI
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover/sess:opacity-100 transition-opacity text-[8px] hover:bg-rose-600 shadow-md"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Chat Messages Panel */}
            <div className="flex-1 flex flex-col bg-[#0b0e1a]/30 overflow-hidden">
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
                
                  {/* Empty State */}
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center gap-2.5 text-center text-slate-600">
                    <span className="material-symbols-outlined text-3xl opacity-50">smart_toy</span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">OpenCode AI Agent</p>
                      <p className="text-[10px] text-slate-500 max-w-[180px] leading-relaxed mx-auto mt-1">
                        Ask me to run shell commands, list files, view system status or manage your deploy node.
                      </p>
                    </div>
                  </div>
                )}

                {/* Messages list */}
                {renderMessageList()}

                {/* Thinking / Sending indicator */}
                {sending && (
                  <div className="flex justify-start mb-4 animate-in fade-in duration-300">
                    <div className="bg-[#1b223c]/50 border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none shadow-md flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                      AI is thinking & executing tools...
                    </div>
                  </div>
                )}

                {/* Error Box */}
                {errorMsg && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-[10px] text-rose-400 font-bold uppercase tracking-wide flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                    <div>{errorMsg}</div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSend} className="p-3 bg-[#111629] border-t border-white/10 shrink-0 flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  placeholder="Ask AI copilot anything..."
                  disabled={sending}
                  className="flex-1 bg-black/40 border border-white/5 rounded-xl text-xs text-white px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-primary placeholder:text-slate-600 disabled:opacity-50"
                />
                {sending ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="w-10 h-10 rounded-xl bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 shrink-0"
                    title="Stop AI"
                  >
                    <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputMsg.trim()}
                    className="w-10 h-10 rounded-xl bg-primary hover:bg-primary-container text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                )}
              </form>

            </div>
          </div>

        </div>
      )}
    </>
  )
}
