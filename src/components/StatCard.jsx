export default function StatCard({ title, value, sub, icon, iconBg = 'bg-primary/10', iconColor = 'text-primary', trend, trendIcon }) {
  return (
    <div className="bg-surface-container-low p-6 rounded-xl flex items-center justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{title}</p>
        <p className="text-3xl font-black text-on-surface">{value}</p>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 ${iconColor}`}>
            {trendIcon && (
              <span className="material-symbols-outlined text-xs">{trendIcon}</span>
            )}
            <span className="text-[10px] font-bold">{trend}</span>
          </div>
        )}
        {sub && !trend && (
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        )}
      </div>
      {icon && (
        <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center ${iconColor}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            {icon}
          </span>
        </div>
      )}
    </div>
  )
}
