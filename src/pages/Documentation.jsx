import React from 'react'
import { Link } from 'react-router-dom'

const quickStats = [
  { label: 'Versi Platform', value: 'v2.1.0', icon: 'verified' },
  { label: 'Native Bridge', value: 'Vite 6 + Node.js', icon: 'settings_ethernet' },
  { label: 'Real-time', value: 'Aktif', icon: 'speed' },
  { label: 'Workspace', value: 'Terisolasi', icon: 'shield' },
]

const sections = [
  {
    title: 'Arsitektur Backend',
    content: 'Ndelok.me bekerja sebagai PaaS lokal. Setiap proyek dikloning ke direktori workspace yang unik. Proses native dijalankan melalui bridge server development.',
    icon: 'api',
    color: 'border-primary/20 text-primary bg-primary/5'
  },
  {
    title: 'Telemetri & Monitoring',
    content: 'Modul OS standar digunakan untuk mengambil metrik sistem setiap 2 detik. Metrik ini disiarkan via Socket.io ke dasbor secara instan.',
    icon: 'insights',
    color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5'
  },
  {
    title: 'Siklus Hidup Proses',
    content: 'Kontrol penuh atas child process: Jalankan, Hentikan (Safe Kill), dan Restart. Termasuk logika "Port Nuking" untuk membersihkan port yang tersandera.',
    icon: 'memory',
    color: 'border-tertiary/20 text-tertiary bg-tertiary/5'
  },
  {
    title: 'Log Persisten',
    content: 'Mengonsolidasikan semua info debug sistem dan stdout/stderr ke penyimpanan JSON persisten (kapasitas 5000 baris) dengan fitur ekspor ke TXT.',
    icon: 'contract_edit',
    color: 'border-indigo-400/20 text-indigo-300 bg-indigo-400/5'
  }
]

export default function Documentation() {
  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      
      {/* Header Section */}
      <div className="relative group p-10 rounded-[2.5rem] bg-gradient-to-br from-surface-container-low to-surface-container-lowest border border-white/5 shadow-2xl overflow-hidden min-h-[400px] flex flex-col justify-center">
        {/* Animated Background Orbs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 blur-[120px] rounded-full animate-pulse-slow pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-tertiary/15 blur-[120px] rounded-full animate-pulse-slow pointer-events-none delay-700" />

        <div className="relative space-y-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest shadow-lg">
             <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
             </span>
             Portal Dokumentasi
          </div>
          
          <h1 className="text-5xl lg:text-6xl font-black text-white leading-tight tracking-tighter">
            Arsitektur Manajemen <br />
            <span className="bg-gradient-to-r from-primary via-primary-container to-tertiary text-transparent bg-clip-text">Infrastruktur.</span>
          </h1>

          <p className="text-slate-400 text-lg leading-relaxed font-medium">
            Pelajari bagaimana Ndelok.me menjembatani pengembangan lokal dengan manajemen OS native melalui instrumentasi performa tinggi.
          </p>

          <div className="flex flex-wrap gap-4 pt-4">
             {quickStats.map(stat => (
                <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">
                   <span className="material-symbols-outlined text-[16px] text-slate-500">{stat.icon}</span>
                   <span className="text-[10px] uppercase font-bold text-slate-400">{stat.label}:</span>
                   <span className="text-[10px] uppercase font-bold text-white">{stat.value}</span>
                </div>
             ))}
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {sections.map((s, i) => (
          <div 
            key={s.title} 
            className={`group p-8 rounded-[2rem] border transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10 ${s.color}`}
          >
            <div className="mb-6 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-6">
              <span className="material-symbols-outlined text-3xl">{s.icon}</span>
            </div>
            <h3 className="font-bold text-white text-base tracking-tight mb-3 uppercase leading-tight">{s.title}</h3>
            <p className="text-slate-400/80 text-xs leading-relaxed font-medium line-clamp-4">{s.content}</p>
          </div>
        ))}
      </div>

      {/* Advanced Technical Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Flow Guide */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-10 rounded-[2.5rem] bg-surface-container-low border border-white/5 shadow-xl space-y-10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">Alur Siklus Hidup Layanan</h2>
              <div className="px-3 py-1 rounded-full bg-slate-900/50 text-slate-500 text-[10px] uppercase font-bold tracking-tighter">Panduan Interaktif</div>
            </div>

            <div className="relative pt-12">
              {/* Central Vertical Line */}
              <div className="absolute left-[50%] -translate-x-1/2 top-4 bottom-4 w-0.5 bg-white/5" />

              <div className="space-y-24">
                
                {/* Step 1: Left */}
                <div className="relative grid grid-cols-2 gap-0 group">
                   <div className="pr-12 text-right pt-1">
                      <h4 className="text-white font-bold text-[14px] uppercase tracking-wider mb-2">Kloning & Setup</h4>
                      <p className="text-slate-400 text-[11px] leading-relaxed ml-auto max-w-[280px]">Sistem memverifikasi cabang Git lalu melakukan kloning secara eksklusif ke direktori <code className="bg-black/40 px-1.5 py-0.5 rounded text-primary font-telemetry">/workspaces/[nama]</code>.</p>
                   </div>
                   <div className="absolute left-[50%] -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-primary/20 shrink-0">1</div>
                </div>

                {/* Step 2: Right */}
                <div className="relative grid grid-cols-2 gap-0 group">
                   <div />
                   <div className="pl-12 text-left pt-1">
                      <h4 className="text-white font-bold text-[14px] uppercase tracking-wider mb-2">Instalasi Native</h4>
                      <p className="text-slate-400 text-[11px] leading-relaxed mr-auto max-w-[280px]">Dependensi proyek diselesaikan menggunakan perintah instalasi yang telah ditentukan (seperti <code className="text-tertiary font-telemetry underline">npm install</code> atau <code className="text-tertiary font-telemetry underline">pip</code>).</p>
                   </div>
                   <div className="absolute left-[50%] -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-tertiary flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-tertiary/20 shrink-0">2</div>
                </div>

                {/* Step 3: Left */}
                <div className="relative grid grid-cols-2 gap-0 group">
                   <div className="pr-12 text-right pt-1">
                      <h4 className="text-white font-bold text-[14px] uppercase tracking-wider mb-2">Instrumentasi Live</h4>
                      <p className="text-slate-400 text-[11px] leading-relaxed ml-auto max-w-[280px]">Child process dijalankan. Penggunaan <code className="text-emerald-400 font-bold">CPU</code>, <code className="text-emerald-400 font-bold">MEM</code>, dan <code className="text-emerald-400 font-bold">DISK</code> dipetakan ke dasbor setiap <code className="text-emerald-400">2000ms</code>.</p>
                   </div>
                   <div className="absolute left-[50%] -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-emerald-500/20 shrink-0">3</div>
                </div>

                {/* Step 4: Right */}
                <div className="relative grid grid-cols-2 gap-0 group">
                   <div />
                   <div className="pl-12 text-left pt-1">
                      <h4 className="text-white font-bold text-[14px] uppercase tracking-wider mb-2">Jaringan & Persistensi</h4>
                      <p className="text-slate-400 text-[11px] leading-relaxed mr-auto max-w-[280px]">Port aplikasi dikelola via bridge. Semua log dan status proyek disimpan ke dalam file <code className="text-cyan-400 font-bold font-telemetry">system-logs.json</code> dan <code className="text-cyan-400 font-bold font-telemetry">projects.json</code>.</p>
                   </div>
                   <div className="absolute left-[50%] -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-on-primary font-black text-xs ring-4 ring-cyan-500/20 shrink-0">4</div>
                </div>
              </div>
            </div>


          </div>
        </div>

        {/* Right Column: Mini Cards/Support */}
        <div className="space-y-6">
           <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 shadow-xl space-y-4">
              <span className="material-symbols-outlined text-3xl text-primary">hub</span>
              <h3 className="text-white font-black text-lg uppercase tracking-tight">API Bridge</h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                 Ndelok.me menyediakan API berbasis middleware untuk berinteraksi dengan host. Ini memungkinkan integrasi webhook pihak ketiga untuk restart otomatis dan pemantauan.
              </p>
           </div>

           <div className="p-8 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 shadow-xl space-y-4">
              <span className="material-symbols-outlined text-3xl text-indigo-400">shelves</span>
              <h3 className="text-white font-black text-lg uppercase tracking-tight">Persistensi Data</h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                 Semua konfigurasi proyek dan riwayat eksekusi disimpan secara lokal dalam file <code className="text-indigo-300 font-bold underline">projects.json</code>. Tidak diperlukan setup database eksternal.
              </p>
           </div>
        </div>
      </div>

    </div>
  )
}
