export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-8 right-8 px-5 py-3.5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border flex items-center gap-3 z-[100] transition-all transform scale-100 opacity-100 ${
      toast.type === 'error' ? 'bg-[#ff4d4d] border-red-400 text-white' : 
      toast.type === 'warn' ? 'bg-[#ffb340] border-orange-300 text-slate-900' : 
      'bg-[#06b6d4] border-cyan-400 text-white'
    }`}>
      <span className="material-symbols-outlined text-[20px]">
        {toast.type === 'error' ? 'error' : toast.type === 'warn' ? 'warning' : 'check_circle'}
      </span>
      <p className="font-bold text-sm tracking-wide">{toast.msg}</p>
      <button onClick={onClose} className="ml-4 hover:opacity-70 flex items-center">
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  )
}
