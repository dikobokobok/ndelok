import { useState, useEffect, useContext } from 'react'
import { AuthContext } from '../App'

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
  const { authenticatedFetch, user } = useContext(AuthContext)
  const [activeSection, setActiveSection] = useState('team')
  const [teamMembers, setTeamMembers] = useState([])
  const [integrationEnabled, setIntegrationEnabled] = useState({ Telegram: true, Discord: false, Email: true })
  const [toast, setToast] = useState(false)
  const [emailChecks, setEmailChecks] = useState({ summary: true, downtime: true })

  // Registration Modal State
  const [showRegModal, setShowRegModal] = useState(false)
  const [regData, setRegData] = useState({ name: '', username: '', password: '', email: '', role: 'viewer' })
  const [regError, setRegError] = useState('')

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [editData, setEditData] = useState({ name: '', username: '', password: '', email: '', role: '' })
  const [editError, setEditError] = useState('')

  const fetchUsers = () => {
    authenticatedFetch('/api/users')
      .then(res => res?.json())
      .then(data => data && setTeamMembers(data))
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleSave = () => {
    setToast({ type: 'success', title: 'Synchronization Complete', msg: 'Configuration node updated successfully' })
    setTimeout(() => setToast(false), 3000)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setRegError('')
    try {
      const res = await authenticatedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Identity fault')
      
      setToast({ type: 'success', title: 'Agent Provisioned', msg: `Identity for ${regData.username} has been verified and registered.` })
      setShowRegModal(false)
      setRegData({ name: '', username: '', password: '', email: '', role: 'viewer' })
      fetchUsers()
    } catch (err) {
      setRegError(err.message)
    }
  }

  const onOpenEdit = (m) => {
    setEditData({ ...m, password: '' })
    setShowEditModal(true)
    setEditError('')
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setEditError('')
    try {
      const res = await authenticatedFetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Modification failure')
      
      setToast({ type: 'success', title: 'Identity Updated', msg: `Metadata for ${editData.username} has been synchronized.` })
      setShowEditModal(false)
      fetchUsers()
    } catch (err) {
      setEditError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Are you absolutely sure you want to de-provision ${editData.username}? This action is irreversible.`)) return
    
    setEditError('')
    try {
      const res = await authenticatedFetch(`/api/users?username=${encodeURIComponent(editData.username)}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'De-provisioning failed')
      
      setToast({ type: 'success', title: 'Agent Terminated', msg: `Identity [${editData.username}] has been purged from the system.` })
      setShowEditModal(false)
      fetchUsers()
    } catch (err) {
      setEditError(err.message)
    }
  }

  return (
    <div className="p-10 min-h-screen bg-[#0f1115] text-slate-300">
      <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Header omitted... */}
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
                  {user?.role === 'owner' && (
                    <button 
                      onClick={() => setShowRegModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary/20 hover:bg-primary hover:text-white transition-all shadow-lg shadow-primary/10 active:scale-95">
                      <span className="material-symbols-outlined text-[16px]">person_add</span>
                      Register Agent
                    </button>
                  )}
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
                        <tr key={m.username} className="group hover:bg-white/[0.02] transition-colors">
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
                            <button 
                              onClick={() => onOpenEdit(m)}
                              className="w-8 h-8 rounded-lg text-slate-600 hover:text-white hover:bg-white/5 transition-all">
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

            {/* Other sections omitted for brevity in target content matching, but I will replace the whole file content to be safe and clean since I added significant logic */}
            {/* SSH, Notifications, etc. */}
            {/* [ ... Rest of sections from line 140 ... ] */}
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
                          {[{ key: 'summary', label: 'Chronological Daily Summary' }, { key: 'downtime', label: 'Zero-Latency Critical Alerts' }].map(c => (
                            <label key={c.key} className="flex items-center gap-3 cursor-pointer group">
                              <div className="relative">
                                <input type="checkbox" checked={emailChecks[c.key]} disabled={!integrationEnabled.Email} onChange={() => setEmailChecks(prev => ({ ...prev, [c.key]: !prev[c.key] }))} className="peer sr-only" />
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
                          <input type={intg.type === 'token' ? 'password' : 'text'} defaultValue={intg.value} disabled={!integrationEnabled[intg.name]} placeholder={intg.placeholder} className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white focus:ring-1 focus:ring-primary focus:border-primary focus:bg-black/50 outline-none py-3 px-4 transition-all placeholder:text-slate-800 font-telemetry" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-16 pt-10 border-t border-white/5 flex justify-end items-center gap-8">
                  <button className="text-xs font-black text-slate-600 hover:text-white uppercase tracking-[0.2em] transition-all">Reset Config</button>
                  <button onClick={handleSave} className="px-10 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95">Sync to Node</button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Registration Modal */}
      {showRegModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowRegModal(false)} />
          <div className="w-full max-w-md bg-[#161b2c] border border-white/10 rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-tertiary to-primary" />
             <div className="p-10">
                <div className="flex justify-between items-center mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <span className="material-symbols-outlined text-primary text-2xl">person_add</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white tracking-tighter">Register Agent</h3>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Provision identity</p>
                    </div>
                  </div>
                  <button onClick={() => setShowRegModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 transition-colors flex items-center justify-center text-slate-500 hover:text-white">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <form onSubmit={handleRegister} className="space-y-6">
                  {regError && (
                    <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center gap-3 text-error text-[10px] font-black uppercase tracking-widest">
                       <span className="material-symbols-outlined text-[18px]">error</span>
                       {regError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
                        <input required type="text" value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} pattern="^[a-zA-Z0-9\-_ ]+$" title="Only alphanumeric, dashes, underscores, and spaces are allowed." className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-primary outline-none" placeholder="Ibnu R." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Username</label>
                        <input required type="text" value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} pattern="^[a-zA-Z0-9\-_]+$" title="Only alphanumeric, dashes, and underscores are allowed (no spaces)." className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-primary outline-none font-telemetry" placeholder="ibnu_agent" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
                      <input required type="email" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-primary outline-none" placeholder="agent@ndelok.me" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Access Role</label>
                        <select value={regData.role} onChange={e => setRegData({...regData, role: e.target.value})} className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-primary outline-none appearance-none">
                           <option value="viewer">Viewer</option>
                           <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Secure Key</label>
                        <input required type="password" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full bg-[#0a0c10] border border-white/5 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-primary outline-none" placeholder="••••••••" />
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 transition-all active:translate-y-0">
                    Finalize Identity
                  </button>
                </form>
             </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowEditModal(false)} />
          <div className="w-full max-w-md bg-[#161b2c] border border-white/10 rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-tertiary via-primary to-tertiary" />
             <div className="p-10">
                <div className="flex justify-between items-center mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-tertiary/10 flex items-center justify-center border border-tertiary/20">
                      <span className="material-symbols-outlined text-tertiary text-2xl">manage_accounts</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white tracking-tighter">Edit Identity</h3>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Modify workspace access</p>
                    </div>
                  </div>
                  <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 transition-colors flex items-center justify-center text-slate-500 hover:text-white">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <form onSubmit={handleUpdate} className="space-y-6">
                  {editError && <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center gap-3 text-error text-[10px] font-black uppercase tracking-widest"><span className="material-symbols-outlined text-[18px]">error</span>{editError}</div>}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Agent Name</label>
                        <input required type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} pattern="^[a-zA-Z0-9\-_ ]+$" title="Only alphanumeric, dashes, underscores, and spaces are allowed." className="w-full bg-[#0a0c10] border border-white/10 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-tertiary outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Username (Locked)</label>
                        <input disabled type="text" value={editData.username} className="w-full bg-black/40 border border-white/5 rounded-xl text-xs text-slate-600 py-3 px-4 outline-none font-telemetry cursor-not-allowed" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Relay</label>
                      <input required type="email" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} className="w-full bg-[#0a0c10] border border-white/10 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-tertiary outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Access Level</label>
                        <select value={editData.role} onChange={e => setEditData({...editData, role: e.target.value})} className="w-full bg-[#0a0c10] border border-white/10 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-tertiary outline-none appearance-none">
                           <option value="viewer">Viewer</option>
                           <option value="admin">Admin</option>
                           {editData.role === 'owner' && <option value="owner">Owner</option>}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">New Secure Key</label>
                        <input type="password" value={editData.password} onChange={e => setEditData({...editData, password: e.target.value})} className="w-full bg-[#0a0c10] border border-white/10 rounded-xl text-xs text-white py-3 px-4 focus:ring-1 focus:ring-tertiary outline-none" placeholder="Leave blank to keep" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 pt-4">
                    {user?.role === 'owner' && user.username !== editData.username && (
                      <button type="button" onClick={handleDelete} className="px-6 bg-error/10 hover:bg-error text-error hover:text-white border border-error/20 rounded-2xl transition-all active:scale-95 flex items-center justify-center">
                        <span className="material-symbols-outlined text-md">delete_forever</span>
                      </button>
                    )}
                    <button type="submit" className="flex-1 py-4 bg-tertiary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-tertiary/20 hover:shadow-tertiary/40 transition-all active:scale-95">Update Identity</button>
                  </div>
                </form>
             </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-12 right-12 bg-[#161b2c] backdrop-blur-xl border border-white/10 p-5 rounded-[24px] shadow-2xl flex items-center gap-5 z-[200] animate-in fade-in zoom-in slide-in-from-right-10 duration-500">
          <div className="w-12 h-12 rounded-[18px] bg-primary/10 flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined text-primary text-2xl animate-pulse">
              {toast.type === 'success' ? 'verified_user' : 'error'}
            </span>
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase tracking-widest">{toast.title}</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{toast.msg}</p>
          </div>
          <button onClick={() => setToast(false)} className="ml-4 w-8 h-8 rounded-full hover:bg-white/5 transition-colors flex items-center justify-center text-slate-600 hover:text-white">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </div>
  )
}
