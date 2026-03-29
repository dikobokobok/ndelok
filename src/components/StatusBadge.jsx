const statusConfig = {
  online:  { label: 'Online',       dot: 'bg-primary animate-pulse',  badge: 'bg-primary/10 text-primary' },
  warning: { label: 'Warning',      dot: 'bg-tertiary',               badge: 'bg-tertiary/10 text-tertiary' },
  offline: { label: 'Offline',      dot: 'bg-error',                  badge: 'bg-error/10 text-error' },
  healthy: { label: 'Healthy',      dot: 'bg-emerald-500 animate-pulse', badge: 'bg-emerald-500/10 text-emerald-400' },
  latency: { label: 'Latency Spike',dot: 'bg-tertiary',               badge: 'bg-tertiary/10 text-tertiary' },
  lost:    { label: 'Connection Lost', dot: 'bg-error',               badge: 'bg-error/10 text-error' },
}

export default function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.offline
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}
