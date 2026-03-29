import { useState } from 'react'

function Toggle({ checked, onChange }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-surface-container'}`}>
        <div className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-all duration-200 ${checked ? 'translate-x-5 bg-on-primary' : 'bg-slate-400'}`} />
      </div>
    </label>
  )
}

const teamMembers = [
  { initials: 'JD', name: 'John Doe',   email: 'john@ndelok.me',   role: 'Owner',  status: 'Active',  fixed: true  },
  { initials: 'AM', name: 'Alex Miller', email: 'alex.m@infra.co', role: 'Viewer', status: 'Active',  fixed: false },
  { initials: 'SP', name: 'Sara Park',   email: 'sara@ndelok.me',  role: 'Admin',  status: 'Pending', fixed: false },
]

const sshKeys = [
  { name: 'MacBook-Pro-M3',    hash: 'SHA256:7uK...89xX', added: '2 months ago' },
  { name: 'Production-Relay-1',hash: 'SHA256:9qA...22pZ', added: '5 days ago'  },
]

const integrations = [
  { icon: 'send',   iconColor: 'text-sky-500',    iconBg: 'bg-sky-500/10',    name: 'Telegram', desc: 'Real-time bot alerts',      enabled: true,  type: 'token',   placeholder: '', value: '••••••••••••••••' },
  { icon: 'groups', iconColor: 'text-indigo-500', iconBg: 'bg-indigo-500/10', name: 'Discord',  desc: 'Webhook channel posting',   enabled: false, type: 'webhook', placeholder: 'https://discord.com/api/webhooks/...', value: '' },
  { icon: 'mail',   iconColor: 'text-primary',    iconBg: 'bg-primary/10',    name: 'Email',    desc: 'Digest and critical alerts', enabled: true,  type: 'email',   placeholder: '', value: '' },
]

const anchors = [
  { id: 'team',          icon: 'group',                label: 'Team Management' },
  { id: 'security',      icon: 'key',                  label: 'SSH & API Keys' },
  { id: 'notifications', icon: 'notifications_active', label: 'Notifications' },
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState('team')
  const [integrationEnabled, setIntegrationEnabled] = useState({ Telegram: true, Discord: false, Email: true })
  const [toast, setToast] = useState(true)
  const [emailChecks, setEmailChecks] = useState({ summary: true, downtime: true })

  return (
    <div className="p-10 min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header */}
        <section>
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2 uppercase tracking-widest font-bold">
            <span>Observatory</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary/70">Settings</span>
          </nav>
          <h2 className="text-3xl font-black tracking-tight text-on-surface mb-1">Settings</h2>
          <p className="text-on-surface-variant text-sm">Manage your observatory's security, team access, and notification channels.</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Anchor Nav */}
          <div className="lg:col-span-3 space-y-1 hidden lg:block">
            {anchors.map(a => (
              <button key={a.id} onClick={() => setActiveSection(a.id)}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium text-left transition-colors ${activeSection === a.id ? 'bg-surface-container text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}>
                <span className="material-symbols-outlined text-[18px]">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          {/* Right: Panels */}
          <div className="lg:col-span-9 space-y-8">
            {/* Team Management */}
            <section id="team" className="bg-surface-container-low rounded-xl overflow-hidden shadow-xl">
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-on-surface">Team Management</h3>
                    <p className="text-sm text-on-surface-variant mt-1">Control access levels for your infrastructure</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest text-primary rounded-lg text-sm font-bold hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-[16px]">person_add</span>
                    Invite Member
                  </button>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] font-label uppercase tracking-[0.1em] text-slate-500 bg-surface-container/50">
                      <th className="py-3 px-4 font-bold">User</th>
                      <th className="py-3 px-4 font-bold">Role</th>
                      <th className="py-3 px-4 font-bold">Status</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {teamMembers.map(m => (
                      <tr key={m.email} className="hover:bg-surface-container-high transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-black text-primary">{m.initials}</div>
                            <div>
                              <p className="text-sm font-bold text-on-surface">{m.name}</p>
                              <p className="text-xs text-on-surface-variant">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {m.fixed
                            ? <span className="px-2 py-1 text-[10px] font-bold rounded bg-primary/10 text-primary uppercase">{m.role}</span>
                            : <select className="bg-surface-container border-none text-xs rounded-lg py-1 px-2 text-on-surface-variant focus:ring-1 focus:ring-primary focus:outline-none">
                                <option>Admin</option>
                                <option selected={m.role === 'Viewer'}>Viewer</option>
                              </select>
                          }
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'Active' ? 'bg-emerald-500' : 'bg-tertiary'}`} />
                            <span className="text-xs text-on-surface-variant">{m.status}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button className="text-slate-500 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-sm">more_vert</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SSH & API Keys */}
            <section id="security" className="bg-surface-container-low rounded-xl overflow-hidden shadow-xl">
              <div className="p-8 space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-on-surface">SSH & API Keys</h3>
                  <p className="text-sm text-on-surface-variant mt-1">Authenticate via terminal or external applications</p>
                </div>

                {/* SSH Keys */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">SSH Keys</h4>
                    <button className="text-primary text-xs font-bold hover:underline">Add New Key</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sshKeys.map(k => (
                      <div key={k.name} className="p-4 rounded-xl bg-surface-container flex items-start justify-between group hover:bg-surface-container-high transition-all">
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-primary mt-1">terminal</span>
                          <div>
                            <p className="text-sm font-bold text-on-surface">{k.name}</p>
                            <p className="text-xs font-telemetry text-slate-500 mt-1">{k.hash}</p>
                            <p className="text-[10px] text-slate-600 mt-2">Added {k.added}</p>
                          </div>
                        </div>
                        <button className="text-error opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API Token */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">API Tokens</h4>
                    <button className="text-primary text-xs font-bold hover:underline">Generate Token</button>
                  </div>
                  <div className="p-5 rounded-xl bg-surface-container border-l-4 border-primary/40">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[9px] font-black bg-primary-container text-on-primary-container rounded">ACTIVE</span>
                        <span className="text-sm font-bold text-on-surface">Agent-Token-Prod</span>
                      </div>
                      <span className="text-xs text-slate-500">Last used 4 hours ago</span>
                    </div>
                    <div className="flex items-center bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10">
                      <code className="text-xs text-primary-fixed overflow-hidden whitespace-nowrap flex-1 font-telemetry">nd_live_51Mv9K4S4vD9W...</code>
                      <button className="ml-2 p-1.5 hover:bg-surface-container-high rounded transition-colors text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section id="notifications" className="bg-surface-container-low rounded-xl overflow-hidden shadow-xl">
              <div className="p-8">
                <h3 className="text-xl font-bold text-on-surface mb-8">Notification Integrations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {integrations.map(intg => (
                    <div key={intg.name} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full ${intg.iconBg} flex items-center justify-center`}>
                            <span className={`material-symbols-outlined ${intg.iconColor}`}>{intg.icon}</span>
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-on-surface">{intg.name}</h4>
                            <p className="text-[10px] text-on-surface-variant">{intg.desc}</p>
                          </div>
                        </div>
                        <Toggle
                          checked={integrationEnabled[intg.name]}
                          onChange={() => setIntegrationEnabled(prev => ({ ...prev, [intg.name]: !prev[intg.name] }))}
                        />
                      </div>

                      {intg.name === 'Email' ? (
                        <div className={`space-y-2 transition-opacity ${integrationEnabled.Email ? 'opacity-100' : 'opacity-40'}`}>
                          {[
                            { key: 'summary',  label: 'Daily infrastructure summary' },
                            { key: 'downtime', label: 'Immediate downtime critical alerts' },
                          ].map(c => (
                            <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox"
                                checked={emailChecks[c.key]}
                                disabled={!integrationEnabled.Email}
                                onChange={() => setEmailChecks(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
                                className="rounded bg-surface-container border-none text-primary focus:ring-0 w-4 h-4"
                              />
                              <span className="text-xs text-on-surface-variant">{c.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className={`transition-opacity ${integrationEnabled[intg.name] ? 'opacity-100' : 'opacity-40'}`}>
                          <label className="text-[11px] font-label text-slate-500 uppercase block mb-1">{intg.type === 'token' ? 'Bot Token' : 'Webhook URL'}</label>
                          <input
                            type={intg.type === 'token' ? 'password' : 'text'}
                            defaultValue={intg.value}
                            disabled={!integrationEnabled[intg.name]}
                            placeholder={intg.placeholder}
                            className="w-full bg-surface-container border-none rounded-lg text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none py-2 px-3 placeholder:text-slate-600 disabled:cursor-not-allowed"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Save */}
                <div className="mt-10 pt-8 border-t border-outline-variant/10 flex justify-end gap-4">
                  <button className="px-6 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">Discard Changes</button>
                  <button className="px-8 py-2 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-lg shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                    Save Configurations
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Floating Toast */}
      {toast && (
        <div className="fixed bottom-8 right-8 glass-panel border border-primary/20 p-4 rounded-xl shadow-2xl flex items-center gap-4 z-50 animate-fade-in">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
          </div>
          <div>
            <p className="text-sm font-bold text-on-surface">Auto-Save Enabled</p>
            <p className="text-xs text-on-surface-variant">All key changes are synced to vault</p>
          </div>
          <button onClick={() => setToast(false)} className="text-slate-500 hover:text-white ml-4 transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </div>
  )
}
