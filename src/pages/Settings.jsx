import { useState, useEffect } from 'react'

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} />
      <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}>
        <div className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-all duration-200 ${checked ? 'translate-x-5 bg-white' : 'bg-slate-500'}`} />
      </div>
    </label>
  )
}

const sshKeys = [
  { name: 'MacBook-Pro-Ibnu',    hash: 'SHA256:7uK...89xX', added: '2 months ago' },
  { name: 'Production-Server',   hash: 'SHA256:9qA...22pZ', added: '5 days ago'  },
]

const integrations = [
  { icon: 'send',   iconColor: 'text-sky-500',    iconBg: 'bg-sky-500/10',    name: 'Telegram', desc: 'Real-time bot alerts',      enabled: true,  type: 'token',   placeholder: '', value: '••••••••••••••••' },
  { icon: 'groups', iconColor: 'text-indigo-400', iconBg: 'bg-indigo-500/10', name: 'Discord',  desc: 'Webhook channel posting',   enabled: false, type: 'webhook', placeholder: 'https://discord.com/api/webhooks/...', value: '' },
  { icon: 'mail',   iconColor: 'text-primary',    iconBg: 'bg-primary/10',    name: 'Email',    desc: 'Digest and critical alerts', enabled: true,  type: 'email',   placeholder: '', value: '' },
]

const anchors = [
  { id: 'team',          icon: 'group',                label: 'Team Management' },
  { id: 'security',      icon: 'key',                  label: 'SSH & API Keys' },
  { id: 'notifications', icon: 'notifications_active', label: 'Notifications' },
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState('team')
  const [teamMembers, setTeamMembers] = useState([])
  const [integrationEnabled, setIntegrationEnabled] = useState({ Telegram: true, Discord: false, Email: true })
  const [toast, setToast] = useState(false)
  const [emailChecks, setEmailChecks] = useState({ summary: true, downtime: true })

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setTeamMembers(data))
  }, [])

  const handleSave = () => {
    setToast(true)
    setTimeout(() => setToast(false), 3000)
  }

  return (
    <div className="p-10 min-h-screen bg-[#0f1115] text-slate-300">
      <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Header */}
        <section>
          <nav className="flex items-center gap-2 text-[10px] text-slate-500 mb-2 uppercase tracking-[0.2em] font-black">
            <span>Control Center</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary">System Settings</span>
          </nav>
          <h2 className="text-4xl font-black tracking-tight text-white mb-2">Workspace Identity</h2>
          <p className="text-slate-500 text-sm max-w-2xl">Configuration node for identity management, notification relays, and secure cryptographic access keys.</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left: Anchor Nav */}
          <div className="lg:col-span-3 space-y-2 hidden lg:block sticky top-10 h-fit">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-4 ml-4">Registry Sections</p>
            {anchors.map(a => (
              <button key={a.id} onClick={() => setActiveSection(a.id)}
                className={`w-full flex items-center gap-4 px-5 py-3 rounded-2xl text-xs font-bold text-left transition-all duration-300 transform group ${activeSection === a.id ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}>
                <span className={`material-symbols-outlined text-[18px] transition-transform ${activeSection === a.id ? 'scale-110' : 'group-hover:translate-x-1'}`}>{a.icon}</span>
                <span className="uppercase tracking-widest">{a.label}</span>
              </button>
            ))}
          </div>

          {/* Right: Panels */}
          <div className="lg:col-span-9 space-y-12">
            {/* Team Management */}
            <section id="team" className="bg-surface-container/30 backdrop-blur-md border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-black text-white tracking-tight">Access Control</h3>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Managing authorized workspace agents</p>
                  </div>
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary/20 hover:bg-primary hover:text-white transition-all shadow-lg shadow-primary/10 active:scale-95">
                    <span className="material-symbols-outlined text-[16px]">person_add</span>
                    Register Agent
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                        <th className="pb-6 px-4">Workspace Identity</th>
                        <th className="pb-6 px-4">Assigned Role</th>
                        <th className="pb-6 px-4">Activity Status</th>
                        <th className="pb-6 px-4 text-right">Settings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {teamMembers.map(m => (
                        <tr key={m.email} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="py-5 px-4">
                            <div className="flex items-center gap-4">
                              <img src={m.avatar} alt="avatar" className="w-10 h-10 rounded-full bg-surface-container ring-2 ring-white/5 group-hover:ring-primary/40 transition-all" />
                              <div>
                                <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{m.name}</p>
                                <p className="text-[10px] text-slate-500 font-telemetry">{m.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-5 px-4">
                            <span className={`px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-widest border ${m.role === 'owner' ? 'bg-primary/10 text-primary border-primary/20' : m.role === 'admin' ? 'bg-tertiary/10 text-tertiary border-tertiary/20' : 'bg-slate-500/10 text-slate-400 border-white/5'}`}>
                              {m.role}
                            </span>
                          </td>
                          <td className="py-5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synchronized</span>
                            </div>
                          </td>
                          <td className="py-5 px-4 text-right">
                            <button className="w-8 h-8 rounded-lg text-slate-600 hover:text-white hover:bg-white/5 transition-all">
                              <span className="material-symbols-outlined text-[18px]">tune</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SSH & API Keys */}
            <section id="security" className="bg-surface-container/30 backdrop-blur-md border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
              <div className="p-8 space-y-10">
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Security Tokens</h3>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Root-level cryptographic authentication</p>
                </div>

                {/* SSH Keys */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Authorized SSH Keys</h4>
                    <button className="text-primary text-[10px] font-black uppercase tracking-widest hover:brightness-125 transition-all">Add RSA/ED25519</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {sshKeys.map(k => (
                      <div key={k.name} className="p-5 rounded-2xl bg-surface-container-highest/20 border border-white/5 flex items-start justify-between group hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <span className="material-symbols-outlined text-primary text-[20px]">terminal</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-white truncate">{k.name}</p>
                            <p className="text-[10px] font-telemetry text-slate-600 mt-1 truncate">{k.hash}</p>
                            <p className="text-[9px] text-slate-700 mt-3 uppercase tracking-widest font-bold">Added {k.added}</p>
                          </div>
                        </div>
                        <button className="text-error/40 hover:text-error transition-colors p-1">
                          <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API Token */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Global API Integration</h4>
                    <button className="text-tertiary text-[10px] font-black uppercase tracking-widest hover:brightness-125 transition-all">Refresh Node</button>
                  </div>
                  <div className="p-6 rounded-[24px] bg-gradient-to-br from-surface-container-highest/30 to-transparent border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
                    <div className="flex justify-between items-center mb-5 relative z-10">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 text-[8px] font-black bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20 tracking-widest">NODE_ACTIVE</span>
                        <span className="text-xs font-black text-white tracking-widest uppercase">System-Access-Key</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-600">L_OBS_SYNC: 4h ago</span>
                    </div>
                    <div className="flex items-center bg-black/40 backdrop-blur-sm p-3 rounded-xl border border-white/5 group relative z-10">
                      <code className="text-xs text-primary-fixed overflow-hidden whitespace-nowrap flex-1 font-telemetry tracking-tighter opacity-70">nd_node_relay_51Mv9K4S4vD9W...</code>
                      <button className="ml-3 px-3 py-1.5 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-lg transition-all text-slate-400 flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest">Copy</span>
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section id="notifications" className="bg-surface-container/30 backdrop-blur-md border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
              <div className="p-8">
                <h3 className="text-xl font-black text-white tracking-tight mb-10">External Relays</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {integrations.map(intg => (
                    <div key={intg.name} className="space-y-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl ${intg.iconBg} flex items-center justify-center border border-white/5`}>
                            <span className={`material-symbols-outlined text-[24px] ${intg.iconColor}`}>{intg.icon}</span>
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-widest">{intg.name}</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{intg.desc}</p>
                          </div>
                        </div>
                        <Toggle
                          checked={integrationEnabled[intg.name]}
                          onChange={() => setIntegrationEnabled(prev => ({ ...prev, [intg.name]: !prev[intg.name] }))}
                        />
                      </div>

                      {intg.name === 'Email' ? (
                        <div className={`space-y-3 transition-all duration-500 ${integrationEnabled.Email ? 'opacity-100' : 'opacity-20 grayscale pointer-events-none'}`}>
                          {[
                            { key: 'summary',  label: 'Chronological Daily Summary' },
                            { key: 'downtime', label: 'Zero-Latency Critical Alerts' },
                          ].map(c => (
                            <label key={c.key} className="flex items-center gap-3 cursor-pointer group">
                              <div className="relative">
                                <input type="checkbox"
                                  checked={emailChecks[c.key]}
                                  disabled={!integrationEnabled.Email}
                                  onChange={() => setEmailChecks(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
                                  className="peer sr-only"
                                />
                                <div className="w-5 h-5 bg-surface-container-highest rounded border border-white/10 peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                                   <span className="material-symbols-outlined text-[14px] text-white scale-0 peer-checked:scale-100 transition-transform">check</span>
                                </div>
                              </div>
                              <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors uppercase tracking-widest font-bold">{c.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className={`transition-all duration-500 ${integrationEnabled[intg.name] ? 'opacity-100' : 'opacity-20 grayscale pointer-events-none'}`}>
                          <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">{intg.type === 'token' ? 'Encryption Token' : 'Secure Webhook Target'}</label>
                          <div className="relative group">
                            <input
                              type={intg.type === 'token' ? 'password' : 'text'}
                              defaultValue={intg.value}
                              disabled={!integrationEnabled[intg.name]}
                              placeholder={intg.placeholder}
                              className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white focus:ring-1 focus:ring-primary focus:border-primary focus:bg-black/50 outline-none py-3 px-4 transition-all placeholder:text-slate-800 font-telemetry"
                            />
                            <div className="absolute inset-0 bg-primary/5 opacity-0 group-focus-within:opacity-100 rounded-xl transition-opacity pointer-events-none" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Save */}
                <div className="mt-16 pt-10 border-t border-white/5 flex justify-end items-center gap-8">
                  <button className="text-xs font-black text-slate-600 hover:text-white uppercase tracking-[0.2em] transition-all">Reset Config</button>
                  <button 
                    onClick={handleSave}
                    className="px-10 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-2xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 transition-all">
                    Sync to Node
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-12 right-12 bg-primary/90 backdrop-blur-xl border border-white/20 p-5 rounded-[24px] shadow-[0_20px_50px_rgba(var(--primary-rgb),0.3)] flex items-center gap-5 z-50 animate-in fade-in zoom-in slide-in-from-right-10 duration-500">
          <div className="w-12 h-12 rounded-[18px] bg-white/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-2xl animate-pulse">cloud_done</span>
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase tracking-widest">Synchronization Complete</p>
            <p className="text-[10px] text-white/70 font-bold uppercase tracking-tight">Configuration node updated successfully</p>
          </div>
          <button onClick={() => setToast(false)} className="ml-4 w-8 h-8 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center text-white/50 hover:text-white">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </div>
  )
}
