import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import readmeContent from '../../README.md?raw'

const customRenderers = {
  h1: ({node, ...props}) => <h1 className="text-4xl sm:text-5xl font-black text-white mb-8 tracking-tighter leading-tight" {...props} />,
  h2: ({node, ...props}) => <h2 className="text-2xl sm:text-3xl font-black text-white mt-16 mb-6 tracking-tight border-b border-white/10 pb-4" {...props} />,
  h3: ({node, ...props}) => <h3 className="text-xl sm:text-2xl font-bold text-white mt-10 mb-4 tracking-tight" {...props} />,
  h4: ({node, ...props}) => <h4 className="text-lg font-bold text-slate-200 mt-8 mb-3" {...props} />,
  p: ({node, ...props}) => <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-6" {...props} />,
  ul: ({node, ...props}) => <ul className="list-disc list-outside ml-6 space-y-2 mb-6 text-slate-400 text-sm sm:text-base" {...props} />,
  ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-6 space-y-2 mb-6 text-slate-400 text-sm sm:text-base" {...props} />,
  li: ({node, ...props}) => <li className="pl-2" {...props} />,
  a: ({node, ...props}) => <a className="text-primary hover:text-primary-container underline underline-offset-4 decoration-primary/30 transition-colors font-bold" target="_blank" rel="noopener noreferrer" {...props} />,
  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-tertiary/50 pl-5 py-2 bg-tertiary/5 rounded-r-xl mb-6 text-slate-300 italic text-sm sm:text-base" {...props} />,
  code: ({node, inline, className, children, ...props}) => {
    const match = /language-(\w+)/.exec(className || '')
    return inline ? (
      <code className="bg-black/40 text-primary font-telemetry px-1.5 py-0.5 rounded text-[13px] border border-white/5" {...props}>
        {children}
      </code>
    ) : (
      <div className="bg-[#0a0c10] border border-white/10 rounded-2xl p-4 sm:p-6 mb-8 overflow-x-auto shadow-2xl relative group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50" />
        <code className="text-slate-300 font-telemetry text-xs sm:text-sm whitespace-pre" {...props}>
          {children}
        </code>
      </div>
    )
  },
  table: ({node, ...props}) => <div className="overflow-x-auto mb-8 bg-surface-container-highest/20 rounded-2xl border border-white/5"><table className="w-full text-left border-collapse min-w-[600px]" {...props} /></div>,
  thead: ({node, ...props}) => <thead className="bg-black/20 border-b border-white/10" {...props} />,
  th: ({node, ...props}) => <th className="px-6 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 whitespace-nowrap" {...props} />,
  td: ({node, ...props}) => <td className="px-6 py-5 text-sm text-slate-300 border-b border-white/5 font-medium" {...props} />,
  hr: ({node, ...props}) => <hr className="border-white/10 my-16" {...props} />,
  img: ({node, ...props}) => {
    // Try to fix image paths from the repo
    const src = props.src?.startsWith('docs/') ? `/${props.src}` : props.src
    return <img src={src} className="rounded-2xl border border-white/10 shadow-2xl my-10 max-w-full h-auto bg-surface-container-highest/50" {...props} />
  },
  strong: ({node, ...props}) => <strong className="font-black text-white" {...props} />
}

export default function Documentation() {
  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-10 px-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      
      {/* Header */}
      <div className="mb-10 sm:mb-16">
        <nav className="flex items-center gap-2 text-[10px] text-slate-500 mb-4 uppercase tracking-[0.2em] font-black">
          <span>Resource Center</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary">Documentation</span>
        </nav>
      </div>

      <div className="p-6 sm:p-10 lg:p-14 rounded-[2rem] sm:rounded-[3rem] bg-surface-container-low border border-white/5 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-tertiary/10 blur-[150px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 markdown-body">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={customRenderers}
          >
            {readmeContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
