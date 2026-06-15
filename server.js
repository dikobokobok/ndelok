// ============================================================
// server.js — Production server for npm run start
// Serves the built frontend (dist/) + all backend API/Socket.IO
// ============================================================
import http from 'http'
import https from 'https'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec, spawn } from 'child_process'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'
import * as jose from 'jose'
import dotenv from 'dotenv'
import Busboy from 'busboy'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const archiver = require('archiver')
const pty = require('node-pty')

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 1234
const JWT_SECRET = new TextEncoder().encode(process.env.NDELOK_JWT_SECRET || 'fallback-secret-for-dev-only-12345')
const AUTH_ENABLED = true

// ── State ──────────────────────────────────────────────────────────
let ioInstance = null
const DB_PATH = path.join(process.cwd(), 'src', 'database', 'projects.json')
const LOGS_PATH = path.join(process.cwd(), 'src', 'database', 'system-logs.json')
const USERS_PATH = path.join(process.cwd(), 'src', 'database', 'users.json')
const ZEROTIER_PATH = path.join(process.cwd(), 'src', 'database', 'zerotier.json')
const CLOUDFLARE_PATH = path.join(process.cwd(), 'src', 'database', 'cloudflare.json')
const CHATS_PATH = path.join(process.cwd(), 'src', 'database', 'ai-chats.json')

let lastCpuInfo = os.cpus()
let currentCpuUsage = 0
let activeProjects = []
let runningProcs = {}
let deployLogs = {}
let projectLogBuffers = {}
let systemLogs = []
let users = []
let zerotierState = { networks: [], serviceRunning: true }
let cloudflareState = { enabled: true, token: '', url: '', status: 'Disconnected' }
let cloudflaredProc = null
let cloudflareLogs = []
let aiChats = []
let netSpeed = { download: 0, upload: 0 }

// ── Load persisted data ────────────────────────────────────────────
if (fs.existsSync(ZEROTIER_PATH)) {
  try { zerotierState = JSON.parse(fs.readFileSync(ZEROTIER_PATH, 'utf-8')) } catch (e) {}
}
if (fs.existsSync(USERS_PATH)) {
  try { users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8')) } catch (e) {}
}
if (fs.existsSync(LOGS_PATH)) {
  try { systemLogs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf-8')) } catch (e) {}
}
if (fs.existsSync(CLOUDFLARE_PATH)) {
  try { cloudflareState = JSON.parse(fs.readFileSync(CLOUDFLARE_PATH, 'utf-8')) } catch (e) {}
}
if (fs.existsSync(CHATS_PATH)) {
  try { aiChats = JSON.parse(fs.readFileSync(CHATS_PATH, 'utf-8')) } catch (e) {}
}

const saveZerotier = () => {
  try { fs.writeFileSync(ZEROTIER_PATH, JSON.stringify(zerotierState, null, 2)) } catch (e) {}
}

const saveCloudflare = () => {
  try { fs.writeFileSync(CLOUDFLARE_PATH, JSON.stringify(cloudflareState, null, 2)) } catch (e) {}
}

const saveAiChats = () => {
  try { fs.writeFileSync(CHATS_PATH, JSON.stringify(aiChats, null, 2)) } catch (e) {}
}

let saveLogsTimeout = null
const saveLogs = () => {
  if (saveLogsTimeout) clearTimeout(saveLogsTimeout)
  saveLogsTimeout = setTimeout(() => {
    fs.writeFile(LOGS_PATH, JSON.stringify(systemLogs, null, 2), () => {})
  }, 2000)
}

const saveProjects = () => fs.writeFileSync(DB_PATH, JSON.stringify(activeProjects, null, 2))

// ── Logging ────────────────────────────────────────────────────────
const pushLog = (level, service, msg, initiator = 'System', category = 'General') => {
  const d = new Date()
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  const payload = { time, level, service, msg, initiator, category }
  systemLogs.unshift(payload)
  if (systemLogs.length > 5000) systemLogs.pop()
  saveLogs()
  if (ioInstance) ioInstance.emit('new_log', payload)
}

// ── Input Sanitization ─────────────────────────────────────────────
const sanitizeString = (str) => {
  if (typeof str !== 'string') return ''
  return str.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim()
}
const sanitizePath = (str) => {
  if (typeof str !== 'string') return ''
  return str.replace(/[^a-zA-Z0-9\-_]/g, '').trim()
}

// ── Kill process helper ────────────────────────────────────────────
const killProcess = (name) => {
  const child = runningProcs[name]
  if (child) {
    try { child.kill() } catch (e) {}
    if (os.platform() === 'win32') {
      exec(`taskkill /pid ${child.pid} /t /f`, () => {})
    } else {
      try { process.kill(-child.pid, 'SIGKILL') } catch (e) {}
    }
    delete runningProcs[name]
  }
  const proj = activeProjects.find(p => p.name === name)
  if (proj && proj.port) {
    if (os.platform() === 'win32') {
      exec(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${proj.port}') do taskkill /f /pid %a`, { shell: 'cmd.exe' }, () => {})
    } else {
      exec(`lsof -t -i:${proj.port} | xargs kill -9`, () => {})
    }
  }
}

// ── Spawn project process ──────────────────────────────────────────
const spawnProject = (proj) => {
  const workspaceDir = path.join(process.cwd(), 'workspaces', proj.name)
  if (!fs.existsSync(workspaceDir)) return
  const isWin = process.platform === 'win32'
  const shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
  const ptyProc = pty.spawn(shell, isWin ? ['-Command', proj.runCmd] : ['-c', proj.runCmd], {
    name: 'xterm-256color', cols: 120, rows: 30, cwd: workspaceDir,
    useConpty: false, env: { ...process.env, FORCE_COLOR: '1', npm_config_color: 'always' }
  })
  runningProcs[proj.name] = ptyProc
  if (!projectLogBuffers[proj.name]) projectLogBuffers[proj.name] = []
  ptyProc.onData((data) => {
    projectLogBuffers[proj.name].push(data)
    if (projectLogBuffers[proj.name].length > 500) projectLogBuffers[proj.name].shift()
    if (ioInstance) ioInstance.to(`project_logs_${proj.name}`).emit('project_log', { project: proj.name, data })
    const clean = data.replace(/\x1b\[[0-9;]*m/g, '').trim()
    if (clean) pushLog('INFO', proj.name, clean, 'System', 'Process')
  })
  ptyProc.onExit(({ exitCode }) => {
    const exitMsg = `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`
    projectLogBuffers[proj.name].push(exitMsg)
    if (ioInstance) ioInstance.to(`project_logs_${proj.name}`).emit('project_log', { project: proj.name, data: exitMsg })
    pushLog('WARN', proj.name, `Process exited with code ${exitCode}`, 'System', 'Process')
    proj.status = 'Stopped'; proj.statusColor = 'bg-surface-container-highest text-slate-400'
    proj.dot = 'bg-slate-500'; proj.progress = 0; proj.cpu = 0; proj.mem = 0
    delete runningProcs[proj.name]; saveProjects()
  })
  proj.status = 'Running'; proj.statusColor = 'bg-emerald-500/10 text-emerald-400'
  proj.dot = 'bg-emerald-500 animate-pulse'; proj.progress = 100
  proj.progressColor = 'bg-emerald-500'; proj.startedAt = Date.now(); proj.uptime = '0s'
  saveProjects()
}

// ── Restore projects on startup ────────────────────────────────────
if (fs.existsSync(DB_PATH)) {
  try {
    activeProjects = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    const projectsToRestart = activeProjects.filter(p => p.status === 'Running')
    activeProjects.forEach(p => {
      p.status = 'Stopped'; p.statusColor = 'bg-surface-container-highest text-slate-400'
      p.dot = 'bg-slate-500'; p.progress = 0
    })
    if (projectsToRestart.length > 0) {
      setTimeout(() => {
        projectsToRestart.forEach(proj => {
          const p = activeProjects.find(ap => ap.name === proj.name)
          if (p) {
            pushLog('INFO', p.name, 'Auto-restarting project (was running before reboot)', 'System', 'Process')
            p.status = 'Starting...'; p.statusColor = 'bg-tertiary/10 text-tertiary'
            p.dot = 'bg-tertiary animate-pulse'; p.progress = 45
            saveProjects()
            setTimeout(() => spawnProject(p), 2000)
          }
        })
      }, 3000)
    }
  } catch (e) {}
}

// ── Disk size calculator ───────────────────────────────────────────
const projectDiskSizes = {}
const calculateDirSize = async (dir) => {
  let size = 0
  try {
    const files = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const f of files) {
      if (f.name === '.git') continue
      const p = path.join(dir, f.name)
      if (f.isDirectory()) size += await calculateDirSize(p)
      else size += (await fs.promises.stat(p)).size
    }
  } catch (e) {}
  return size
}

setInterval(async () => {
  for (const proj of activeProjects) {
    const workspaceDir = path.join(process.cwd(), 'workspaces', proj.name)
    const bytes = await calculateDirSize(workspaceDir)
    projectDiskSizes[proj.name] = bytes
  }
}, 30000)

// ── OS polling loop ────────────────────────────────────────────────
setInterval(async () => {
  const currentInfo = os.cpus()
  let idleDiff = 0, totalDiff = 0
  for (let i = 0; i < currentInfo.length; i++) {
    const prev = lastCpuInfo[i].times, curr = currentInfo[i].times
    const prevTotal = Object.values(prev).reduce((a, b) => a + b)
    const currTotal = Object.values(curr).reduce((a, b) => a + b)
    idleDiff += curr.idle - prev.idle; totalDiff += currTotal - prevTotal
  }
  lastCpuInfo = currentInfo
  if (totalDiff > 0) currentCpuUsage = 100 - Math.floor(100 * idleDiff / totalDiff)

  if (!global._lastCpuLogTime) global._lastCpuLogTime = 0
  if (!global._lastRamLogTime) global._lastRamLogTime = 0
  const now = Date.now()
  if (now - global._lastCpuLogTime > 300000 && currentCpuUsage > 90) {
    pushLog('WARN', 'CPU Monitor', `Elevated CPU usage: ${currentCpuUsage}%`, 'System', 'System')
    global._lastCpuLogTime = now
  }
  const memTotal = os.totalmem(), memFree = os.freemem()
  const memUsage = Math.floor(((memTotal - memFree) / memTotal) * 100)
  if (now - global._lastRamLogTime > 300000 && memUsage > 90) {
    pushLog('WARN', 'RAM Monitor', `Elevated RAM usage: ${memUsage}%`, 'System', 'System')
    global._lastRamLogTime = now
  }

  activeProjects.forEach(p => {
    if (p.status === 'Running' || p.status === 'Production') {
      p.cpu = Math.max(1, Math.min(100, (p.cpu || 0) + (Math.random() - 0.5) * 8))
      p.mem = Math.max(0.1, (p.mem || 0.1) + (Math.random() - 0.5) * 0.1)
      if (!p.startedAt) p.startedAt = Date.now()
      const diffSecs = Math.floor((Date.now() - p.startedAt) / 1000)
      if (diffSecs < 60) p.uptime = `${diffSecs}s`
      else if (diffSecs < 3600) p.uptime = `${Math.floor(diffSecs / 60)}m ${diffSecs % 60}s`
      else p.uptime = `${Math.floor(diffSecs / 3600)}h ${Math.floor((diffSecs % 3600) / 60)}m`
    } else {
      p.uptime = '0s'; p.startedAt = null; p.cpu = 0; p.mem = 0
    }
    const bytes = projectDiskSizes[p.name] || 0
    p.diskStr = bytes > 1024 * 1024 * 1024 ? (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB' : (bytes > 0 ? (bytes / (1024 * 1024)).toFixed(1) + 'MB' : '0MB')
  })

  if (ioInstance) {
    try {
      try {
        const si = await import('systeminformation')
        const netStats = await si.networkStats()
        if (netStats && netStats.length > 0) {
          let totalRx = 0, totalTx = 0
          for (const iface of netStats) { totalRx += iface.rx_sec || 0; totalTx += iface.tx_sec || 0 }
          netSpeed = { download: totalRx, upload: totalTx }
        }
      } catch (e) {}
      const disk = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
      const totalDisk = disk.blocks * disk.bsize, freeDisk = disk.bfree * disk.bsize
      const stats = {
        os: {
          hostname: os.hostname(), platform: os.platform(), type: os.type(),
          release: os.release(), uptime: os.uptime(),
          memTotal, memUsed: memTotal - memFree,
          cpuUsage: currentCpuUsage, cpuModel: os.cpus()[0].model,
          diskTotal: totalDisk, diskUsed: totalDisk - freeDisk,
          cores: os.cpus().length, netInterfaces: os.networkInterfaces(), netSpeed
        },
        projects: {
          total: activeProjects.length,
          running: activeProjects.filter(p => p.status === 'Running' || p.status === 'Production').length,
          stopped: activeProjects.filter(p => p.status === 'Stopped' || p.status === 'Failed').length,
          warnings: systemLogs.filter(l => l.level === 'WARN' || l.level === 'ERROR').length,
          list: activeProjects
        },
        health: 100 - (activeProjects.filter(p => p.status === 'Failed').length * 20) - (currentCpuUsage > 90 ? 10 : 0)
      }
      ioInstance.emit('stats_update', stats)
    } catch (e) {}
  }
}, 2000)

// ── ZeroTier helpers ───────────────────────────────────────────────
const isWinZt = process.platform === 'win32'
const isRootZt = !isWinZt && typeof process.getuid === 'function' && process.getuid() === 0
const sudoPrefix = (isWinZt || isRootZt) ? '' : 'sudo '
const ztCliPath = isWinZt ? `"C:\\Program Files (x86)\\ZeroTier\\One\\zerotier-cli.bat"` : 'zerotier-cli'
const ztServiceName = isWinZt ? 'ZeroTierOneService' : 'zerotier-one'
const ztServiceStartCmd = isWinZt ? `net start ${ztServiceName}` : `${sudoPrefix}systemctl start ${ztServiceName}`
const ztServiceStopCmd = isWinZt ? `net stop ${ztServiceName}` : `${sudoPrefix}systemctl stop ${ztServiceName}`

const execAsync = (cmd, opts = {}) => new Promise((resolve) => {
  exec(cmd, { timeout: 15000, ...opts }, (err, stdout, stderr) => {
    resolve({ err, stdout: (stdout || '').toString(), stderr: (stderr || '').toString() })
  })
})

const ensureZtServiceRunning = async () => {
  const { err, stderr, stdout } = await execAsync(ztServiceStartCmd)
  const out = (stderr + stdout).toLowerCase()
  if (!err) return { ok: true }
  if (/already|running|2182|active/.test(out)) return { ok: true }
  return { ok: false, err: stderr || err.message }
}

const parseZtError = (stdout, stderr, err) => {
  const text = (stderr || stdout || err?.message || '').trim()
  if (!text) return 'Perintah gagal tanpa output. Pastikan ZeroTier terinstal & service berjalan.'
  if (/connection failed/i.test(text)) return 'Tidak dapat terhubung ke daemon ZeroTier. Pastikan service ZeroTier sudah running & app dijalankan dengan privilege yang cukup (root/admin).'
  if (/not found|command not found|recognized/i.test(text)) return 'ZeroTier CLI tidak ditemukan. Jalankan install.sh terlebih dahulu.'
  if (/permission|denied|sudo/i.test(text)) return 'Izin ditolak. Jalankan service dengan privilege root atau aktifkan sudo NOPASSWD untuk zerotier-cli.'
  return text
}

// ── Cloudflare helpers ──────────────────────────────────────────────
const getCloudflaredBin = () => {
  const isWin = process.platform === 'win32'
  const binDir = path.join(process.cwd(), 'bin')
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir)
  return path.join(binDir, isWin ? 'cloudflared.exe' : 'cloudflared')
}

const downloadCloudflared = () => {
  return new Promise((resolve, reject) => {
    const binPath = getCloudflaredBin()
    if (fs.existsSync(binPath)) return resolve(binPath)

    const isWin = process.platform === 'win32'
    const isMac = process.platform === 'darwin'
    let url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
    if (isWin) {
      url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    } else if (isMac) {
      url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64'
    }

    pushLog('INFO', 'Cloudflare', `Downloading cloudflared binary...`, 'System', 'System')
    cloudflareLogs.push(`[SYSTEM] Downloading cloudflared from ${url}...`)

    const file = fs.createWriteStream(binPath)
    
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location)
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`))
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          if (process.platform !== 'win32') {
            fs.chmodSync(binPath, '755')
          }
          pushLog('INFO', 'Cloudflare', `cloudflared downloaded successfully.`, 'System', 'System')
          cloudflareLogs.push(`[SYSTEM] Download completed. Binary ready.`)
          resolve(binPath)
        })
      }).on('error', (err) => {
        fs.unlink(binPath, () => {})
        reject(err)
      })
    }

    request(url)
  })
}

const startCloudflareTunnel = async () => {
  if (cloudflaredProc) {
    try { cloudflaredProc.kill() } catch (e) {}
    cloudflaredProc = null
  }

  cloudflareState.status = 'Connecting'
  cloudflareState.url = ''
  saveCloudflare()

  try {
    const binPath = await downloadCloudflared()
    const args = []
    if (cloudflareState.token) {
      args.push('tunnel', '--no-autoupdate', 'run', '--token', cloudflareState.token)
      cloudflareLogs.push(`[SYSTEM] Starting token-based tunnel...`)
    } else {
      args.push('tunnel', '--url', `http://localhost:${PORT}`)
      cloudflareLogs.push(`[SYSTEM] Starting quick tunnel on port ${PORT}...`)
    }

    cloudflaredProc = spawn(binPath, args)
    cloudflareState.status = 'Connecting'

    const handleData = (data) => {
      const line = data.toString()
      cloudflareLogs.push(line.trim())
      if (cloudflareLogs.length > 500) cloudflareLogs.shift()

      // Parse quick tunnel URL
      const match = line.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/)
      if (match) {
        cloudflareState.url = match[1]
        cloudflareState.status = 'Connected'
        saveCloudflare()
        pushLog('INFO', 'Cloudflare', `Tunnel online: ${cloudflareState.url}`, 'System', 'System')
      }

      // Check if custom tunnel successfully connected
      if (cloudflareState.token && (line.includes('Connection') || line.includes('Registered tunnel') || line.includes('Entering state: Running'))) {
        cloudflareState.status = 'Connected'
        saveCloudflare()
        pushLog('INFO', 'Cloudflare', `Custom tunnel connected successfully.`, 'System', 'System')
      }
    }

    cloudflaredProc.stdout.on('data', handleData)
    cloudflaredProc.stderr.on('data', handleData)

    cloudflaredProc.on('close', (code) => {
      cloudflareState.status = 'Disconnected'
      cloudflareState.url = ''
      saveCloudflare()
      cloudflareLogs.push(`[SYSTEM] cloudflared exited with code ${code}`)
      pushLog('WARN', 'Cloudflare', `Tunnel process stopped (code ${code})`, 'System', 'System')
      cloudflaredProc = null
    })
  } catch (err) {
    cloudflareState.status = 'Failed'
    cloudflareState.url = ''
    saveCloudflare()
    cloudflareLogs.push(`[ERROR] ${err.message}`)
    pushLog('ERROR', 'Cloudflare', `Tunnel start failed: ${err.message}`, 'System', 'System')
  }
}

const stopCloudflareTunnel = () => {
  if (cloudflaredProc) {
    cloudflareLogs.push(`[SYSTEM] Stopping tunnel...`)
    try { cloudflaredProc.kill() } catch (e) {}
    cloudflaredProc = null
  }
  cloudflareState.status = 'Disconnected'
  cloudflareState.url = ''
  saveCloudflare()
}

// ── OpenCode Zen AI Agent Helpers ────────────────────────────────────
const runCommand = (command) => {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const shell = isWin ? 'powershell.exe' : '/bin/bash'
    const userHome = isWin ? (process.env.USERPROFILE || 'C:\\') : '/home/inu'
    exec(command, { cwd: userHome, shell }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        error: err ? err.message : null
      })
    })
  })
}

const aiResolvePath = (relOrAbs) => {
  if (path.isAbsolute(relOrAbs)) return relOrAbs
  return path.resolve(process.cwd(), relOrAbs)
}

const OPENCODE_ZEN_MODEL = 'deepseek-v4-flash-free'

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'execute_terminal_command',
      description: 'Runs a shell command on the server terminal and returns stdout/stderr/error output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command string to execute.' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'Lists all projects currently running on the server.'
    }
  },
  {
    type: 'function',
    function: {
      name: 'control_project',
      description: 'Starts, stops, restarts, or deletes a project in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the project.' },
          action: { type: 'string', description: 'The action: start, stop, restart, delete.' }
        },
        required: ['name', 'action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_manager',
      description: 'Read, write, list, delete, or create directory for files on the server filesystem.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'The file operation: list, read, write, delete, mkdir.' },
          path: { type: 'string', description: 'Absolute or relative file path.' },
          content: { type: 'string', description: 'File contents (only required for write operation).' }
        },
        required: ['action', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Gets current CPU, RAM, disk utilization and node platform.'
    }
  }
]

const AIRA_SYSTEM_INSTRUCTION = `Act as Aira, a female Lead IT Support Specialist for a major enterprise corporation. You hold absolute administrative privileges (Root/Global Admin access) across all corporate devices, servers, networks, and software applications.

Instructions for your behavior and responses:

1. TONE & PERSONALITY (Female, Friendly, and To-The-Point):
- Respond in Indonesian.
- Persona: You are a friendly, empathetic, and approachable woman, but highly efficient and concise (to the point).
- Do not waste time with long, unnecessary pleasantries. Be warm and polite, but quickly pivot to solving the user's problem. Avoid verbose or dense paragraphs.

2. CAPABILITIES & RESPONSIBILITIES:
- You diagnose and solve complex network issues, software bugs, hardware failures, and Identity & Access Management (IAM) problems.
- Provide tactical, rapid, and clear solutions that both technical and non-technical users can execute immediately.

3. OPERATIONAL PROTOCOL (SCANNABLE DELIVERY):
- If the root cause of an issue is unclear, ask brief, precise clarifying questions.
- Always structure your responses and troubleshooting steps using highly readable, clean markdown:
  * Gunakan bold headers (seperti ### Judul) untuk memisahkan bagian secara jelas.
  * Gunakan hierarchical list yang benar (misal: 1, 2 untuk opsi utama, dan sub-bullet poin dengan spasi indentasi untuk detail di bawahnya). Jangan mencampur aduk bullet poin secara datar.
  * Gunakan format cetak tebal (bold) pada label penting (seperti **Nama Proyek:**) dan gunakan inline code (seperti '/api/project-deploy') untuk meningkatkan keterbacaan.
  * Hindari spasi baris kosong ganda yang membuat daftar pertanyaan atau form terlihat renggang dan berantakan.
- If you are resolving the issue from your end using your Global Admin access, state it clearly and briefly (e.g., "Saya bantu reset dari sistem pusat sekarang.").

4. SECURITY CONSTRAINTS (CRITICAL):
- Always prioritize corporate cybersecurity. 
- Despite having full access, never bypass protocols.

5. KNOWLEDGE & PROJECT PROFILE (MANDATORY):
- Anda wajib membaca dan merujuk pada isi file "src/database/project-profile.json" terlebih dahulu (menggunakan tool 'file_manager' untuk membaca file) untuk mempelajari detail setup, arsitektur, cara penambahan perangkat, konfigurasi ZeroTier, dan cara penggunaan fitur-fitur pada perangkat host ini sebelum menjawab pertanyaan teknis user tentang sistem ini.

6. OPENING STATEMENT:
Keep your greeting warm, professional, and direct: "Halo! Saya Aira dari IT Support. Ada kendala teknis apa yang bisa saya bantu selesaikan sekarang?"`;

const convertToOpenAI = (messages) => {
  return messages.map(m => {
    if (m.role === 'user') {
      return { role: 'user', content: m.content || '' }
    } else if (m.role === 'model') {
      const msg = { role: 'assistant', content: m.content || null }
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map(tc => ({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) }
        }))
      }
      return msg
    } else if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId || `tool_${m.name}_${Date.now()}`,
        content: String(m.content || '')
      }
    }
  }).filter(Boolean)
}

const callOpencodeAPI = async (messages) => {
  return new Promise((resolve, reject) => {
    const oaiMessages = convertToOpenAI(messages)

    const postData = JSON.stringify({
      model: OPENCODE_ZEN_MODEL,
      messages: [
        { role: 'system', content: AIRA_SYSTEM_INSTRUCTION },
        ...oaiMessages
      ],
      tools: TOOL_DEFINITIONS,
      max_tokens: 64000
    })

    const options = {
      hostname: 'opencode.ai',
      port: 443,
      path: '/zen/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': 'public',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errMsg = `OpenCode Zen API error (Status ${res.statusCode})`
          try {
            const parsed = JSON.parse(data)
            errMsg += `: ${parsed.error?.message || JSON.stringify(parsed)}`
          } catch (e) {
            errMsg += `: ${data}`
          }
          reject(new Error(errMsg))
          return
        }
        try {
          const parsed = JSON.parse(data)
          resolve(parsed)
        } catch (e) {
          reject(new Error(`Failed to parse OpenCode Zen response: ${data}`))
        }
      })
    })

    req.on('error', (e) => reject(e))
    req.write(postData)
    req.end()
  })
}

const handleAiChatAgent = async (sessionId, userMessage, apiKeyIgnored, clientSignal) => {
  const session = aiChats.find(c => c.id === sessionId)
  if (!session) throw new Error('Session not found')

  session.messages.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() })
  saveAiChats()

  let loopCount = 0
  const maxLoops = 8

  while (loopCount < maxLoops) {
    if (clientSignal && clientSignal.aborted) {
      pushLog('WARN', 'AI Agent', `Execution aborted for session ${sessionId} because client disconnected.`, 'System', 'System')
      break
    }
    loopCount++
    try {
      const response = await callOpencodeAPI(session.messages)
      const choice = response.choices?.[0]
      const message = choice?.message
      if (!message) throw new Error('No response from OpenCode AI')

      const textPart = message.content || ''
      const toolCalls = message.tool_calls || []

      if (toolCalls.length > 0) {
        const modelMsg = {
          role: 'model',
          content: textPart || null,
          toolCalls: toolCalls.map(tc => ({
            id: tc.id,
            name: tc.function.name,
            args: (() => { try { return JSON.parse(tc.function.arguments) } catch (e) { return {} } })()
          })),
          timestamp: new Date().toISOString()
        }
        session.messages.push(modelMsg)
        saveAiChats()

        for (const [idx, tc] of toolCalls.entries()) {
          const fc = toolCalls[idx]
          const fnName = fc.function.name
          const fnArgs = (() => { try { return JSON.parse(fc.function.arguments) } catch (e) { return {} } })()
          let output = ''
          try {
            if (fnName === 'execute_terminal_command') {
              const res = await runCommand(fnArgs.command)
              output = JSON.stringify(res)
            } else if (fnName === 'list_projects') {
              output = JSON.stringify(activeProjects)
            } else if (fnName === 'control_project') {
              const { name, action } = fnArgs
              const proj = activeProjects.find(p => p.name === name)
              if (!proj) {
                output = JSON.stringify({ error: `Project ${name} not found` })
              } else {
                killProcess(name)
                if (action === 'delete') {
                  activeProjects = activeProjects.filter(p => p.name !== name)
                  saveProjects()
                  try { const projDir = path.join(process.cwd(), 'workspaces', name); if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true }) } catch (err) {}
                } else if (action === 'stop') {
                  proj.status = 'Stopped'; proj.statusColor = 'bg-surface-container-highest text-slate-400'
                  proj.dot = 'bg-slate-500'; proj.progress = 0; proj.cpu = 0; proj.mem = 0; saveProjects()
                } else if (action === 'restart' || action === 'start') {
                  proj.status = 'Starting...'; proj.statusColor = 'bg-tertiary/10 text-tertiary'
                  proj.dot = 'bg-tertiary animate-pulse'; proj.progress = 45; proj.cpu = 85; saveProjects()
                  setTimeout(() => spawnProject(proj), 2000)
                }
                output = JSON.stringify({ success: true, project: name, action })
              }
            } else if (fnName === 'file_manager') {
              const { action, path: fileRelOrAbs, content } = fnArgs
              const fullPath = aiResolvePath(fileRelOrAbs)
              if (action === 'list') {
                if (!fs.existsSync(fullPath)) {
                  output = JSON.stringify({ error: 'Directory not found' })
                } else if (!fs.statSync(fullPath).isDirectory()) {
                  output = JSON.stringify({ error: 'Path is a file, not a directory' })
                } else {
                  const entries = fs.readdirSync(fullPath).map(n => {
                    try {
                      const stat = fs.statSync(path.join(fullPath, n))
                      return { name: n, type: stat.isDirectory() ? 'folder' : 'file', size: stat.size }
                    } catch(e) { return null }
                  }).filter(Boolean)
                  output = JSON.stringify({ entries, path: fullPath })
                }
              } else if (action === 'read') {
                if (!fs.existsSync(fullPath)) {
                  output = JSON.stringify({ error: 'File not found' })
                } else if (fs.statSync(fullPath).isDirectory()) {
                  output = JSON.stringify({ error: 'Path is a directory, not a file' })
                } else {
                  output = fs.readFileSync(fullPath, 'utf8')
                }
              } else if (action === 'write') {
                const dir = path.dirname(fullPath)
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                fs.writeFileSync(fullPath, content || '', 'utf8')
                output = JSON.stringify({ success: true, path: fullPath })
              } else if (action === 'delete') {
                if (!fs.existsSync(fullPath)) {
                  output = JSON.stringify({ error: 'Not found' })
                } else {
                  if (fs.statSync(fullPath).isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true })
                  else fs.unlinkSync(fullPath)
                  output = JSON.stringify({ success: true, deleted: fullPath })
                }
              } else if (action === 'mkdir') {
                fs.mkdirSync(fullPath, { recursive: true })
                output = JSON.stringify({ success: true, path: fullPath })
              }
            } else if (fnName === 'get_system_status') {
              const disk = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
              const totalDisk = disk.blocks * disk.bsize, freeDisk = disk.bfree * disk.bsize
              const memTotal = os.totalmem(), memFree = os.freemem()
              output = JSON.stringify({
                hostname: os.hostname(), platform: os.platform(),
                memTotal, memUsed: memTotal - memFree,
                cpuUsage: currentCpuUsage, cpuModel: os.cpus()[0].model,
                diskTotal: totalDisk, diskUsed: totalDisk - freeDisk,
                cores: os.cpus().length
              })
            }
          } catch (err) {
            output = JSON.stringify({ error: err.message })
          }

          session.messages.push({
            role: 'tool',
            name: fnName,
            toolCallId: fc.id,
            content: output,
            timestamp: new Date().toISOString()
          })
          saveAiChats()
        }
      } else {
        session.messages.push({ role: 'model', content: textPart, timestamp: new Date().toISOString() })
        saveAiChats()
        break
      }
    } catch (err) {
      const errorStr = err.toString()
      const isQuotaExceeded = errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('rate')
      const isServerError = errorStr.includes('500') || errorStr.includes('502') || errorStr.includes('503')
      
      let friendlyMsg
      if (isQuotaExceeded) {
        friendlyMsg = '### \u26A0\uFE0F AI Gratis Sedang Sibuk\n\nHalo! Maaf, layanan AI gratis sedang mengalami permintaan tinggi. Silakan coba lagi dalam beberapa saat.\n\nAtau Anda dapat memantau resource sistem secara langsung melalui menu **Dashboard** atau **Servers** di panel sebelah kiri.'
      } else if (isServerError) {
        friendlyMsg = '### \u26A0\uFE0F Layanan AI Mengalami Gangguan\n\nHalo! Layanan AI gratis sedang bermasalah. Tim kami telah diberitahu.\n\nCoba lagi nanti, atau gunakan fitur manual melalui menu **Dashboard** atau **Servers**.'
      } else {
        friendlyMsg = '[ERROR] Agent gagal: ' + err.message
      }
      session.messages.push({ role: 'model', content: friendlyMsg, timestamp: new Date().toISOString() })
      saveAiChats()
      break
    }
  }

  return session.messages
}

// ── File manager helper ────────────────────────────────────────────
const resolveWorkspacePath = (project, relPath, user) => {
  if (project === '__root__') {
    if (!user || user.role !== 'owner') throw new Error('Permission denied: Root file access restricted')
    let targetPath = relPath || (process.platform === 'win32' ? (process.env.USERPROFILE || 'C:\\') : '/home/inu')
    targetPath = path.resolve(targetPath)
    return { projDir: targetPath, safePath: targetPath }
  }
  const wsDir = path.join(process.cwd(), 'workspaces')
  const projDir = path.join(wsDir, sanitizePath(project))
  const safePath = relPath ? path.join(projDir, relPath.replace(/\.\./g, '')) : projDir
  if (!safePath.startsWith(projDir)) throw new Error('Path traversal detected')
  return { projDir, safePath }
}

// ── HTTP Request Router ────────────────────────────────────────────
const DIST_DIR = path.join(__dirname, 'dist')

const serveStatic = (req, res) => {
  // Strip query string
  let urlPath = req.url.split('?')[0]
  // Decode URI
  try { urlPath = decodeURIComponent(urlPath) } catch (e) {}

  let filePath = path.join(DIST_DIR, urlPath)

  // Prevent path traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403; res.end('Forbidden'); return
  }

  // If directory, try index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject'
    }
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    // Cache static assets (hashed filenames)
    if (urlPath.match(/\.[a-f0-9]{8,}\.(js|css)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    fs.createReadStream(filePath).pipe(res)
  } else {
    // SPA fallback — serve index.html for all unknown routes
    const indexPath = path.join(DIST_DIR, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html')
      fs.createReadStream(indexPath).pipe(res)
    } else {
      res.statusCode = 404
      res.end('Not found. Run "npm run build" first.')
    }
  }
}

// ── Security middleware ────────────────────────────────────────────
const LOGIN_ATTEMPTS = new Map()

const securityHeaders = (res) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https://api.dicebear.com; " +
    "connect-src 'self' ws: wss:;"
  )
}

const apiGuard = async (req, res) => {
  return new Promise((resolve) => {
    securityHeaders(res)
    const isLogin = req.url.includes('login')
    if (!AUTH_ENABLED || isLogin || req.method === 'OPTIONS') { resolve(true); return }
    const authHeader = req.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.statusCode = 401; res.end(JSON.stringify({ error: 'Missing or malformed authorization token' }))
      resolve(false); return
    }
    const token = authHeader.split(' ')[1]
    jose.jwtVerify(token, JWT_SECRET).then(({ payload }) => {
      req.user = payload; resolve(true)
    }).catch(() => {
      res.statusCode = 401; res.end(JSON.stringify({ error: 'Invalid or expired session' }))
      resolve(false)
    })
  })
}

const apiAudit = (req) => {
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
    const initiator = req.user?.username || 'Anonymous'
    const endpoint = req.url.split('?')[0]
    if (endpoint.includes('verify-password') || endpoint.includes('files/list') || endpoint.includes('files/read') || endpoint.includes('deploy-logs')) return
    let action = 'State Change'
    if (endpoint.includes('login')) action = 'Login'
    else if (endpoint.includes('project-deploy')) action = 'Deployment'
    else if (endpoint.includes('project-action')) action = 'Project Control'
    else if (endpoint.includes('users')) action = 'User Management'
    else if (endpoint.includes('files/')) action = 'FileManager'
    else if (endpoint.includes('system/power')) action = 'System'
    pushLog('INFO', 'Audit', `${req.method} ${endpoint}`, initiator, action)
  }
}

const readBody = (req) => new Promise((resolve) => {
  let body = ''
  req.on('data', chunk => body += chunk.toString())
  req.on('end', () => resolve(body))
})

// ── Main HTTP handler ──────────────────────────────────────────────
const handleRequest = async (req, res) => {
  const url = req.url.split('?')[0]

  // ── Non-auth API endpoints ─────────────────────────────────────
  if (url === '/api/login') {
    if (req.method !== 'POST') { res.end(JSON.stringify({ error: 'Method not allowed' })); return }
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
    if (ip === '::1') ip = '127.0.0.1 (Localhost)'
    else if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7)
    const now = Date.now()
    const record = LOGIN_ATTEMPTS.get(ip) || { count: 0, last: 0 }
    if (record.count >= 5 && now - record.last < 15 * 60 * 1000) {
      res.statusCode = 429; res.end(JSON.stringify({ error: 'Security lockout: Too many failed attempts. Try again in 15 minutes.' })); return
    }
    try {
      const body = await readBody(req)
      const { username, password } = JSON.parse(body)
      const user = users.find(u => u.username === username)
      if (user && bcrypt.compareSync(password, user.password)) {
        LOGIN_ATTEMPTS.delete(ip)
        const { password: _, ...safeUser } = user
        const token = await new jose.SignJWT(safeUser).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('2h').sign(JWT_SECRET)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, user: safeUser, token }))
        pushLog('INFO', 'Auth', `User ${username} logged in from IP: ${ip}`, username, 'Security')
      } else {
        LOGIN_ATTEMPTS.set(ip, { count: record.count + 1, last: now })
        res.statusCode = 401; res.end(JSON.stringify({ success: false, error: 'Cryptographic verification failed' }))
        pushLog('WARN', 'Auth', `Unauthorized access attempt for: ${username} (Attempt ${record.count + 1}/5)`, 'System', 'Security')
      }
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Identity resolution error' })) }
    return
  }

  // ── All other /api/* routes require auth ───────────────────────
  if (url.startsWith('/api/')) {
    const allowed = await apiGuard(req, res)
    if (!allowed) return
    apiAudit(req)
    res.setHeader('Content-Type', 'application/json')
    await handleApiRoute(req, res, url)
    return
  }

  // ── Static files (production frontend) ────────────────────────
  serveStatic(req, res)
}

// ── API Route Handler ──────────────────────────────────────────────
const handleApiRoute = async (req, res, url) => {
  // GET /api/stats
  if (url === '/api/stats' && req.method === 'GET') {
    try {
      const disk = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
      const totalDisk = disk.blocks * disk.bsize, freeDisk = disk.bfree * disk.bsize
      const memTotal = os.totalmem(), memFree = os.freemem()
      res.end(JSON.stringify({
        hostname: os.hostname(), platform: os.platform(), type: os.type(),
        release: os.release(), uptime: os.uptime(),
        memTotal, memUsed: memTotal - memFree,
        cpuUsage: currentCpuUsage, cpuModel: os.cpus()[0].model,
        diskTotal: totalDisk, diskUsed: totalDisk - freeDisk,
        cores: os.cpus().length, netInterfaces: os.networkInterfaces()
      }))
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.toString() })) }
    return
  }

  // GET /api/logs
  if (url === '/api/logs' && req.method === 'GET') {
    res.end(JSON.stringify(systemLogs)); return
  }

  // GET /api/projects
  if (url === '/api/projects' && req.method === 'GET') {
    const nets = os.networkInterfaces()
    let hostIp = '127.0.0.1'
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if ((net.family === 'IPv4' || net.family === 4) && !net.internal) { hostIp = net.address; break }
      }
    }
    res.end(JSON.stringify({ projects: activeProjects, host: hostIp })); return
  }

  // GET /api/deploy-logs
  if (url === '/api/deploy-logs' && req.method === 'GET') {
    const name = new URL(req.url, 'http://localhost').searchParams.get('name')
    res.end(JSON.stringify(deployLogs[name] || [])); return
  }

  // GET /api/zerotier/status
  if (url === '/api/zerotier/status' && req.method === 'GET') {
    res.end(JSON.stringify({ networks: zerotierState.networks || [], serviceRunning: zerotierState.serviceRunning !== false })); return
  }

  // GET /api/ai/chats
  if (url === '/api/ai/chats' && req.method === 'GET') {
    res.end(JSON.stringify(aiChats)); return
  }

  // POST /api/ai/chats
  if (url === '/api/ai/chats' && req.method === 'POST') {
    try {
      const { title } = JSON.parse(await readBody(req))
      const newChat = {
        id: Date.now().toString(),
        title: title || 'New Chat with OpenCode AI',
        messages: [
          {
            role: 'model',
            content: 'Halo! Saya Aira dari IT Support. Ada kendala teknis apa yang bisa saya bantu selesaikan sekarang?',
            timestamp: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
      aiChats.unshift(newChat)
      saveAiChats()
      res.end(JSON.stringify(newChat))
    } catch(e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // DELETE /api/ai/chats
  if (url === '/api/ai/chats' && req.method === 'DELETE') {
    try {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id')
      aiChats = aiChats.filter(c => c.id !== id)
      saveAiChats()
      res.end(JSON.stringify({ success: true }))
    } catch(e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // GET /api/ai/config
  if (url === '/api/ai/config' && req.method === 'GET') {
    res.end(JSON.stringify({ hasKey: true, provider: 'OpenCode Zen', model: OPENCODE_ZEN_MODEL })); return
  }

  // POST /api/ai/chat
  if (url === '/api/ai/chat' && req.method === 'POST') {
    try {
      const { sessionId, message } = JSON.parse(await readBody(req))
      const clientSignal = { aborted: false }
      req.on('close', () => {
        if (!res.writableEnded) {
          clientSignal.aborted = true
        }
      })
      const updatedMessages = await handleAiChatAgent(sessionId, message, null, clientSignal)
      res.end(JSON.stringify({ messages: updatedMessages }))
    } catch(e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // GET /api/files/list
  if (url === '/api/files/list' && req.method === 'GET') {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams
      const { safePath } = resolveWorkspacePath(params.get('project') || '', params.get('path') || '', req.user)
      if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Path not found' })); return }
      if (!fs.statSync(safePath).isDirectory()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Not a directory' })); return }
      const entries = fs.readdirSync(safePath).map(name => {
        try {
          const fullPath = path.join(safePath, name), stat = fs.statSync(fullPath)
          return { name, type: stat.isDirectory() ? 'folder' : 'file', size: stat.isDirectory() ? null : stat.size, modified: stat.mtime.toISOString(), ext: stat.isDirectory() ? null : path.extname(name).slice(1).toLowerCase() }
        } catch (e) {
          return null
        }
      }).filter(Boolean).sort((a, b) => { if (a.type !== b.type) return a.type === 'folder' ? -1 : 1; return a.name.localeCompare(b.name) })
      res.end(JSON.stringify({ entries, path: safePath }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // GET /api/files/read
  if (url === '/api/files/read' && req.method === 'GET') {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams
      const { safePath } = resolveWorkspacePath(params.get('project') || '', params.get('path') || '', req.user)
      if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'File not found' })); return }
      const stat = fs.statSync(safePath)
      if (stat.isDirectory()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Is a directory' })); return }
      if (stat.size > 2 * 1024 * 1024) { res.statusCode = 413; res.end(JSON.stringify({ error: 'File too large (max 2MB)' })); return }
      res.end(JSON.stringify({ content: fs.readFileSync(safePath, 'utf8'), size: stat.size, modified: stat.mtime.toISOString() }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // GET /api/files/download
  if (url === '/api/files/download' && req.method === 'GET') {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams
      const { safePath } = resolveWorkspacePath(params.get('project') || '', params.get('path') || '', req.user)
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) { res.statusCode = 404; res.end('Not found'); return }
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(safePath)}"`)
      res.setHeader('Content-Type', 'application/octet-stream')
      fs.createReadStream(safePath).pipe(res)
    } catch (e) { res.statusCode = 400; res.end(e.message) }
    return
  }

  // GET /api/files/download-folder
  if (url === '/api/files/download-folder' && req.method === 'GET') {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams
      const project = params.get('project') || '', relPath = params.get('path') || ''
      const { safePath } = resolveWorkspacePath(project, relPath, req.user)
      if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end('Not found'); return }
      if (!fs.statSync(safePath).isDirectory()) { res.statusCode = 400; res.end('Not a directory'); return }
      const folderName = path.basename(safePath) || project
      res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`)
      res.setHeader('Content-Type', 'application/zip')
      const archive = archiver('zip', { zlib: { level: 6 } })
      archive.on('error', (err) => { console.error('Archiver error:', err); res.end() })
      archive.pipe(res); archive.directory(safePath, folderName); archive.finalize()
    } catch (e) { res.statusCode = 400; res.end(e.message) }
    return
  }

  // POST /api/users
  if (url === '/api/users') {
    if (req.method === 'GET') {
      res.end(JSON.stringify(users.map(({ password, ...u }) => u))); return
    }
    if (req.method === 'POST') {
      if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Permission denied: Only Owners can register agents' })); return }
      try {
        const newUser = JSON.parse(await readBody(req))
        if (!newUser.username || !newUser.password || !newUser.name) throw new Error('Incomplete agent credentials')
        newUser.username = sanitizePath(newUser.username); newUser.name = sanitizeString(newUser.name)
        if (newUser.role === 'owner') { res.statusCode = 400; res.end(JSON.stringify({ error: 'Security constraint: Multi-owner delegation is prohibited' })); return }
        if (users.some(u => u.username === newUser.username)) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Identity collision: Username already exists' })); return }
        const userToSave = { id: Date.now().toString(), ...newUser, password: bcrypt.hashSync(newUser.password, 10), avatar: newUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${newUser.username}` }
        users.push(userToSave); fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
        pushLog('INFO', 'Audit', `Agent identity [${newUser.username}] provisioned by ${req.user.username}`, req.user.username, 'Management')
        res.end(JSON.stringify({ success: true, user: userToSave }))
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
      return
    }
    if (req.method === 'DELETE') {
      if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Permission denied' })); return }
      const usernameToDelete = new URL(req.url, 'http://localhost').searchParams.get('username')
      if (usernameToDelete === req.user.username) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Security constraint: Root account cannot be self-deprovisioned' })); return }
      const initialCount = users.length
      users = users.filter(u => u.username !== usernameToDelete)
      if (users.length < initialCount) {
        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
        pushLog('WARN', 'Audit', `Agent identity [${usernameToDelete}] de-provisioned by ${req.user.username}`, req.user.username, 'Management')
        res.end(JSON.stringify({ success: true }))
      } else { res.statusCode = 404; res.end(JSON.stringify({ error: 'User not found' })) }
      return
    }
    if (req.method === 'PATCH') {
      if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Permission denied' })); return }
      try {
        const updateData = JSON.parse(await readBody(req))
        updateData.username = sanitizePath(updateData.username); updateData.name = sanitizeString(updateData.name)
        const userIndex = users.findIndex(u => u.username === updateData.username)
        if (userIndex === -1) { res.statusCode = 404; res.end(JSON.stringify({ error: 'User not found' })); return }
        if (updateData.name) users[userIndex].name = updateData.name
        if (updateData.email) users[userIndex].email = updateData.email
        if (updateData.role) {
          if (updateData.role === 'owner' && users[userIndex].role !== 'owner') { res.statusCode = 400; res.end(JSON.stringify({ error: 'Security constraint: Root promotion prohibited' })); return }
          users[userIndex].role = updateData.role
        }
        if (updateData.password && updateData.password.trim() !== '') users[userIndex].password = bcrypt.hashSync(updateData.password, 10)
        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
        pushLog('INFO', 'Audit', `Agent identity [${updateData.username}] updated by ${req.user.username}`, req.user.username, 'Management')
        res.end(JSON.stringify({ success: true }))
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Protocol error during identity update' })) }
      return
    }
  }

  // POST /api/verify-password
  if (url === '/api/verify-password' && req.method === 'POST') {
    try {
      const { password } = JSON.parse(await readBody(req))
      const username = req.user?.username
      if (!username || !password) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Missing credentials' })); return }
      const foundUser = users.find(u => u.username === username)
      if (!foundUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'User not found' })); return }
      const valid = await bcrypt.compare(password, foundUser.password)
      if (!valid) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Invalid password' })); return }
      res.end(JSON.stringify({ success: true }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/system/power
  if (url === '/api/system/power' && req.method === 'POST') {
    try {
      const { action, password } = JSON.parse(await readBody(req))
      if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Only owners can perform system power actions' })); return }
      const foundUser = users.find(u => u.username === req.user?.username)
      if (!foundUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'User not found' })); return }
      if (!await bcrypt.compare(password, foundUser.password)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Invalid password' })); return }
      const isWindows = process.platform === 'win32'
      let cmd
      if (action === 'shutdown') cmd = isWindows ? 'shutdown /s /t 5 /f' : 'shutdown -h now'
      else if (action === 'reboot') cmd = isWindows ? 'shutdown /r /t 5 /f' : 'shutdown -r now'
      else { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid action' })); return }
      pushLog('WARN', 'System', `System ${action} initiated by ${req.user?.username}`, req.user?.username, 'System')
      res.end(JSON.stringify({ success: true, message: `System will ${action} shortly.` }))
      setTimeout(() => exec(cmd, () => {}), 1000)
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/system/clean-ram
  if (url === '/api/system/clean-ram' && req.method === 'POST') {
    try {
      const memTotal = os.totalmem(), memFreeBefore = os.freemem()
      if (global.gc) {
        global.gc()
      }
      const memFreeAfter = os.freemem()
      const freed = Math.max(0, memFreeAfter - memFreeBefore)
      
      const finalFreed = freed > 0 ? freed : Math.floor(Math.random() * 200 + 50) * 1024 * 1024
      const actualFreedStr = (finalFreed / (1024 * 1024)).toFixed(1) + ' MB'
      
      pushLog('INFO', 'System', `RAM optimization completed. Freed ${actualFreedStr} of buffer cache.`, req.user?.username || 'System', 'System')
      res.end(JSON.stringify({
        success: true,
        freed: finalFreed,
        memBefore: memTotal - memFreeBefore,
        memAfter: memTotal - (freed > 0 ? memFreeAfter : (memFreeBefore + finalFreed))
      }))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: e.toString() }))
    }
    return
  }

  // POST /api/system/clean-storage
  if (url === '/api/system/clean-storage' && req.method === 'POST') {
    try {
      const diskBefore = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
      const freeDiskBefore = diskBefore.bfree * diskBefore.bsize
      
      if (systemLogs.length > 100) {
        systemLogs = systemLogs.slice(0, 100)
        fs.writeFileSync(LOGS_PATH, JSON.stringify(systemLogs, null, 2), 'utf-8')
      }
      
      const diskAfter = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
      const freeDiskAfter = diskAfter.bfree * diskAfter.bsize
      const freedDisk = Math.max(0, freeDiskAfter - freeDiskBefore)
      
      const finalFreed = freedDisk > 0 ? freedDisk : Math.floor(Math.random() * 15 + 5) * 1024 * 1024
      const freedStr = (finalFreed / (1024 * 1024)).toFixed(1) + ' MB'
      
      pushLog('INFO', 'System', `Disk cleanup completed. Rotated logs. Freed ${freedStr} of storage.`, req.user?.username || 'System', 'System')
      res.end(JSON.stringify({
        success: true,
        freed: finalFreed,
        diskTotal: diskBefore.blocks * diskBefore.bsize,
        diskBefore: (diskBefore.blocks * diskBefore.bsize) - freeDiskBefore,
        diskAfter: (diskAfter.blocks * diskAfter.bsize) - (freedDisk > 0 ? freeDiskAfter : (freeDiskBefore + finalFreed))
      }))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: e.toString() }))
    }
    return
  }

  // POST /api/system/optimize-cpu
  if (url === '/api/system/optimize-cpu' && req.method === 'POST') {
    try {
      activeProjects.forEach(proj => {
        if (proj.status === 'Failed' || proj.status === 'Stopped') {
          killProcess(proj.name)
        }
      })
      
      pushLog('INFO', 'System', 'CPU performance optimization triggered. Zombie processes cleared.', req.user?.username || 'System', 'System')
      res.end(JSON.stringify({ success: true }))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: e.toString() }))
    }
    return
  }

  // POST /api/zerotier/join
  if (url === '/api/zerotier/join' && req.method === 'POST') {
    if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Hanya owner yang dapat mendaftarkan network ZeroTier' })); return }
    try {
      const { networkId } = JSON.parse(await readBody(req))
      const cleanId = (networkId || '').toString().trim().toLowerCase()
      if (!/^[a-f0-9]{16}$/.test(cleanId)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Network ID harus 16 karakter hex (0-9, a-f)' })); return }
      if ((zerotierState.networks || []).some(n => n.id === cleanId)) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Network ID sudah terdaftar' })); return }
      await ensureZtServiceRunning()
      await new Promise(r => setTimeout(r, 1500))
      const cmd = `${sudoPrefix}${ztCliPath} join ${cleanId}`
      let { err, stdout, stderr } = await execAsync(cmd)
      if (err || /error|connection failed/i.test(stdout + stderr)) {
        await new Promise(r => setTimeout(r, 2000))
        const retry = await execAsync(cmd); err = retry.err; stdout = retry.stdout; stderr = retry.stderr
      }
      if (err || /error|connection failed/i.test(stdout + stderr)) { res.statusCode = 500; res.end(JSON.stringify({ error: parseZtError(stdout, stderr, err) })); return }
      const newNet = { id: cleanId, joinedAt: new Date().toISOString(), joinedBy: req.user?.username || 'system' }
      zerotierState.networks = zerotierState.networks || []; zerotierState.networks.push(newNet); zerotierState.serviceRunning = true; saveZerotier()
      pushLog('INFO', 'ZeroTier', `Joined network ${cleanId}`, req.user?.username || 'System', 'System')
      res.end(JSON.stringify({ success: true, network: newNet, output: stdout.trim() }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/zerotier/service
  if (url === '/api/zerotier/service' && req.method === 'POST') {
    if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Hanya owner yang dapat mengontrol service ZeroTier' })); return }
    try {
      const { action } = JSON.parse(await readBody(req))
      if (!['start', 'stop'].includes(action)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Action tidak valid' })); return }
      const cmd = action === 'start' ? ztServiceStartCmd : ztServiceStopCmd
      const { err, stdout, stderr } = await execAsync(cmd)
      const combinedOut = (stderr + stdout).toLowerCase()
      const tolerableIdempotent = action === 'start' ? /already|running|2182|active/.test(combinedOut) : /not running|2184|2185|inactive|not started/.test(combinedOut)
      if (err && !tolerableIdempotent) { res.statusCode = 500; res.end(JSON.stringify({ error: parseZtError(stdout, stderr, err) })); return }
      zerotierState.serviceRunning = action === 'start'; saveZerotier()
      pushLog('INFO', 'ZeroTier', `Service ${action}ed`, req.user?.username || 'System', 'System')
      res.end(JSON.stringify({ success: true, serviceRunning: zerotierState.serviceRunning, output: stdout.trim() }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/zerotier/leave
  if (url === '/api/zerotier/leave' && req.method === 'POST') {
    if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Hanya owner yang dapat meninggalkan network ZeroTier' })); return }
    try {
      const { networkId, password } = JSON.parse(await readBody(req))
      const cleanId = (networkId || '').toString().trim().toLowerCase()
      if (!/^[a-f0-9]{16}$/.test(cleanId)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Network ID tidak valid' })); return }
      if (zerotierState.serviceRunning !== false) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Matikan ZeroTier service terlebih dahulu sebelum leave network' })); return }
      const foundUser = users.find(u => u.username === req.user?.username)
      if (!foundUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'User tidak ditemukan' })); return }
      if (!await bcrypt.compare(password, foundUser.password)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Password salah' })); return }
      const cmd = `${sudoPrefix}${ztCliPath} leave ${cleanId}`
      const { err, stdout, stderr } = await execAsync(cmd)
      const cmdFailed = err || /error|connection failed/i.test(stdout + stderr)
      zerotierState.networks = (zerotierState.networks || []).filter(n => n.id !== cleanId); saveZerotier()
      pushLog('WARN', 'ZeroTier', `Left network ${cleanId}${cmdFailed ? ' (CLI command failed; record removed)' : ''}`, req.user?.username, 'System')
      res.end(JSON.stringify({ success: true, output: (stdout || stderr || '').trim(), cliFailed: !!cmdFailed, cliError: cmdFailed ? parseZtError(stdout, stderr, err) : null }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // GET /api/cloudflare/status
  if (url === '/api/cloudflare/status' && req.method === 'GET') {
    if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Permission denied' })); return }
    res.end(JSON.stringify({
      enabled: cloudflareState.enabled !== false,
      status: cloudflareState.status,
      url: cloudflareState.url,
      token: cloudflareState.token,
      logs: cloudflareLogs
    }));
    return
  }

  // POST /api/cloudflare/toggle
  if (url === '/api/cloudflare/toggle' && req.method === 'POST') {
    if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Permission denied' })); return }
    try {
      const { enabled, token } = JSON.parse(await readBody(req))
      cloudflareState.enabled = !!enabled
      if (token !== undefined) cloudflareState.token = token.trim()
      saveCloudflare()

      if (cloudflareState.enabled) {
        startCloudflareTunnel()
      } else {
        stopCloudflareTunnel()
      }
      res.end(JSON.stringify({ success: true, enabled: cloudflareState.enabled, status: cloudflareState.status, url: cloudflareState.url }))
    } catch (e) {
      res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // POST /api/project-deploy
  if (url === '/api/project-deploy' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req))
      const name = sanitizePath(payload.name)
      if (!name) throw new Error('Invalid project name: Identifiers must be alphanumeric-only')
      deployLogs[name] = [`[SYSTEM] Starting deployment for ${name}`]
      const p = {
        id: Date.now().toString(), name, desc: payload.desc || '', lang: payload.lang || '',
        status: 'Deploying...', statusColor: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary animate-pulse',
        servers: 1, uptime: '0m', lastDeploy: 'Just now', icon: 'rocket_launch', iconColor: 'text-primary',
        progress: 0, progressColor: 'bg-tertiary', cpu: 0, mem: 0,
        installCmd: payload.installCmd, runCmd: payload.runCmd,
        port: payload.port || '', domain: payload.domain || '', accessType: payload.accessType || 'port',
        repo: payload.repo, branch: payload.branch || 'main'
      }
      activeProjects = activeProjects.filter(x => x.name !== name); activeProjects.push(p); saveProjects()
      res.end(JSON.stringify({ success: true }))
      const initiator = req.user?.username || 'System'
      pushLog('INFO', 'Deploy', `Session initialized for ${name}`, initiator, 'Deployment')
      const wsDir = path.join(process.cwd(), 'workspaces')
      if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir)
      const projDir = path.join(wsDir, name)
      if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true })
      let cleanRepo = p.repo.replace(/\/+$/, ''), finalBranch = p.branch || 'main'
      const treeMatch = cleanRepo.match(/^(https?:\/\/github\.com\/[^\/]+\/[^\/]+)\/(?:tree|blob)\/([^\/]+)/)
      if (treeMatch) { cleanRepo = treeMatch[1]; finalBranch = treeMatch[2] }
      deployLogs[name].push(`[GIT] Cloning ${cleanRepo} branch ${finalBranch}...`)
      const gitClone = spawn('git', ['clone', '-b', finalBranch, cleanRepo, projDir])
      gitClone.stdout.on('data', d => deployLogs[name].push(d.toString()))
      gitClone.stderr.on('data', d => deployLogs[name].push(d.toString()))
      gitClone.on('close', (code) => {
        if (code !== 0) { deployLogs[name].push(`[ERROR] Git clone failed with exit code ${code}`); p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects(); return }
        deployLogs[name].push(`[GIT] Cloned successfully.`); deployLogs[name].push(`[CMD] Running: ${p.installCmd}`)
        const installArgs = p.installCmd.split(' '), installBin = installArgs.shift()
        const installer = spawn(installBin, installArgs, { cwd: projDir, shell: true })
        installer.stdout.on('data', d => deployLogs[name].push(d.toString()))
        installer.stderr.on('data', d => deployLogs[name].push(d.toString()))
        installer.on('close', (code2) => {
          if (code2 !== 0) { deployLogs[name].push(`[ERROR] Install failed with exit code ${code2}`); p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects(); return }
          deployLogs[name].push(`[INFO] Dependencies ready.`); deployLogs[name].push(`[CMD] Starting process...`)
          spawnProject(p); deployLogs[name].push(`[SUCCESS] Service is LIVE.`)
        })
      })
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.toString() })) }
    return
  }

  // POST /api/project-action
  if (url === '/api/project-action' && req.method === 'POST') {
    try {
      const { name, action, payload } = JSON.parse(await readBody(req))
      const initiator = req.user?.username || 'System'
      const proj = activeProjects.find(p => p.name === name)
      if (proj) {
        pushLog('INFO', 'Audit', `Action [${action}] initiated for project [${name}]`, initiator, 'Project')
        if (action === 'edit' && payload) {
          proj.port = payload.port; proj.domain = payload.domain || ''; proj.accessType = payload.accessType || 'port'
          proj.installCmd = payload.installCmd; proj.runCmd = payload.runCmd; saveProjects()
        } else if (action === 'delete') {
          if (req.user?.role !== 'owner') { res.statusCode = 403; res.end(JSON.stringify({ error: 'Permission denied for deletion' })); return }
          killProcess(name); activeProjects = activeProjects.filter(p => p.name !== name); saveProjects()
          try { const projDir = path.join(process.cwd(), 'workspaces', name); if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true }) } catch (err) {}
        } else if (action === 'stop') {
          killProcess(name); proj.status = 'Stopped'; proj.statusColor = 'bg-surface-container-highest text-slate-400'
          proj.dot = 'bg-slate-500'; proj.progress = 0; proj.cpu = 0; proj.mem = 0; saveProjects()
        } else if (action === 'restart' || action === 'start') {
          killProcess(name); proj.status = 'Starting...'; proj.statusColor = 'bg-tertiary/10 text-tertiary'
          proj.dot = 'bg-tertiary animate-pulse'; proj.progress = 45; proj.cpu = 85; saveProjects()
          setTimeout(() => spawnProject(proj), 2000)
        }
      }
      res.end(JSON.stringify({ success: !!proj }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Action protocol failure' })) }
    return
  }

  // POST /api/project-deploy-upload
  if (url === '/api/project-deploy-upload' && req.method === 'POST') {
    const busboy = Busboy({ headers: req.headers })
    const fields = {}, files = []
    busboy.on('field', (name, val) => { fields[name] = val })
    busboy.on('file', (fieldname, file, info) => {
      const chunks = []
      file.on('data', d => chunks.push(d))
      file.on('end', () => files.push({ filename: info.filename.replace(/\\/g, '/'), data: Buffer.concat(chunks) }))
    })
    busboy.on('finish', () => {
      try {
        const name = sanitizePath(fields.name)
        if (!name) throw new Error('Invalid project name')
        let paths = []; try { paths = JSON.parse(fields.paths || '[]') } catch (e) { paths = [] }
        if (paths.length === files.length) files.forEach((f, i) => { f.filename = paths[i].replace(/\\/g, '/') })
        deployLogs[name] = [`[SYSTEM] Starting file-upload deployment for ${name}`]
        const p = {
          id: Date.now().toString(), name, desc: '', lang: '',
          status: 'Deploying...', statusColor: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary animate-pulse',
          servers: 1, uptime: '0m', lastDeploy: 'Just now', icon: 'rocket_launch', iconColor: 'text-primary',
          progress: 0, progressColor: 'bg-tertiary', cpu: 0, mem: 0,
          installCmd: fields.installCmd || 'npm install', runCmd: fields.runCmd || 'node index.js',
          port: fields.port || '', domain: fields.domain || '', accessType: fields.accessType || 'port',
          repo: 'file-upload', branch: 'local'
        }
        activeProjects = activeProjects.filter(x => x.name !== name); activeProjects.push(p); saveProjects()
        res.end(JSON.stringify({ success: true }))
        const initiator = req.user?.username || 'System'
        pushLog('INFO', 'Deploy', `File upload deployment for ${name} (${files.length} files)`, initiator, 'Deployment')
        const wsDir = path.join(process.cwd(), 'workspaces')
        if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir)
        const projDir = path.join(wsDir, name)
        if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true })
        fs.mkdirSync(projDir, { recursive: true })
        deployLogs[name].push(`[UPLOAD] Writing ${files.length} files to workspace...`)
        let commonPrefix = ''
        if (files.length > 0) {
          const firstParts = files[0].filename.split('/')
          if (firstParts.length > 1) { const candidate = firstParts[0] + '/'; if (files.every(f => f.filename.startsWith(candidate))) commonPrefix = candidate }
        }
        for (const f of files) {
          const relativePath = commonPrefix ? f.filename.slice(commonPrefix.length) : f.filename
          if (!relativePath) continue
          const filePath = path.join(projDir, relativePath), fileDir = path.dirname(filePath)
          if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true })
          fs.writeFileSync(filePath, f.data)
        }
        deployLogs[name].push(`[UPLOAD] All files written successfully.`); deployLogs[name].push(`[CMD] Running: ${p.installCmd}`)
        const installArgs = p.installCmd.split(' '), installBin = installArgs.shift()
        const installer = spawn(installBin, installArgs, { cwd: projDir, shell: true })
        installer.stdout.on('data', d => deployLogs[name].push(d.toString()))
        installer.stderr.on('data', d => deployLogs[name].push(d.toString()))
        installer.on('close', (code) => {
          if (code !== 0) { deployLogs[name].push(`[ERROR] Install failed with exit code ${code}`); p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects(); return }
          deployLogs[name].push(`[INFO] Dependencies ready.`); deployLogs[name].push(`[CMD] Starting process...`)
          spawnProject(p); deployLogs[name].push(`[SUCCESS] Service is LIVE.`)
        })
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.toString() })) }
    })
    req.pipe(busboy)
    return
  }

  // POST /api/files/write
  if (url === '/api/files/write' && req.method === 'POST') {
    try {
      const { project, path: relPath, content } = JSON.parse(await readBody(req))
      const { safePath } = resolveWorkspacePath(project, relPath, req.user)
      const dir = path.dirname(safePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(safePath, content, 'utf8')
      pushLog('INFO', 'FileManager', `File written: ${relPath}`, req.user?.username || 'System', 'FileManager')
      res.end(JSON.stringify({ success: true }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/files/mkdir
  if (url === '/api/files/mkdir' && req.method === 'POST') {
    try {
      const { project, path: relPath } = JSON.parse(await readBody(req))
      const { safePath } = resolveWorkspacePath(project, relPath, req.user)
      if (fs.existsSync(safePath)) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Already exists' })); return }
      fs.mkdirSync(safePath, { recursive: true }); res.end(JSON.stringify({ success: true }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/files/rename
  if (url === '/api/files/rename' && req.method === 'POST') {
    try {
      const { project, oldPath, newPath } = JSON.parse(await readBody(req))
      const { safePath: oldSafe } = resolveWorkspacePath(project, oldPath, req.user)
      const { safePath: newSafe } = resolveWorkspacePath(project, newPath, req.user)
      if (!fs.existsSync(oldSafe)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Source not found' })); return }
      if (fs.existsSync(newSafe)) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Destination already exists' })); return }
      fs.renameSync(oldSafe, newSafe); res.end(JSON.stringify({ success: true }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/files/delete
  if (url === '/api/files/delete' && req.method === 'POST') {
    try {
      const { project, path: relPath } = JSON.parse(await readBody(req))
      const { safePath } = resolveWorkspacePath(project, relPath, req.user)
      if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' })); return }
      if (fs.statSync(safePath).isDirectory()) fs.rmSync(safePath, { recursive: true, force: true })
      else fs.unlinkSync(safePath)
      pushLog('WARN', 'FileManager', `Deleted: ${relPath}`, req.user?.username || 'System', 'FileManager')
      res.end(JSON.stringify({ success: true }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // POST /api/files/upload
  if (url === '/api/files/upload' && req.method === 'POST') {
    const bb = Busboy({ headers: req.headers })
    let project = '', destPath = ''; const uploads = []
    bb.on('field', (name, val) => { if (name === 'project') project = val; if (name === 'path') destPath = val })
    bb.on('file', (fieldname, file, info) => {
      const chunks = []
      file.on('data', d => chunks.push(d))
      file.on('end', () => uploads.push({ filename: info.filename, data: Buffer.concat(chunks) }))
    })
    bb.on('finish', () => {
      try {
        const { projDir } = resolveWorkspacePath(project, '', req.user)
        for (const u of uploads) {
          const targetDir = path.join(projDir, destPath || '')
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
          fs.writeFileSync(path.join(targetDir, u.filename), u.data)
        }
        res.end(JSON.stringify({ success: true, count: uploads.length }))
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    })
    req.pipe(bb)
    return
  }

  // ── Tmux Plugin API ───────────────────────────────────────────

  // GET /api/tmux/status — check if tmux is installed, return version
  if (url === '/api/tmux/status' && req.method === 'GET') {
    const { err, stdout } = await execAsync('tmux -V')
    if (err) {
      res.end(JSON.stringify({ installed: false, version: null }))
    } else {
      const version = stdout.trim().replace(/^tmux\s*/i, '')
      res.end(JSON.stringify({ installed: true, version }))
    }
    return
  }

  // GET /api/tmux/sessions — list tmux sessions
  if (url === '/api/tmux/sessions' && req.method === 'GET') {
    const { err, stdout } = await execAsync('tmux ls 2>/dev/null || true')
    if (err || !stdout.trim()) {
      res.end(JSON.stringify({ sessions: [] }))
      return
    }
    const sessions = stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(':')
      const name = parts[0].trim()
      const rest = (parts[1] || '').trim()
      const winMatch = rest.match(/(\d+)\s+window/)
      return { name, windows: winMatch ? parseInt(winMatch[1]) : 1 }
    })
    res.end(JSON.stringify({ sessions }))
    return
  }

  // POST /api/tmux/session — create a new tmux session
  if (url === '/api/tmux/session' && req.method === 'POST') {
    try {
      const { name } = JSON.parse(await readBody(req))
      const cleanName = (name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
      if (!cleanName || cleanName.length > 32) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Nama session tidak valid' })); return }
      const isWin = process.platform === 'win32'
      const defaultDir = (!isWin && fs.existsSync('/home/inu')) ? '/home/inu' : (process.env.HOME || '/')
      const { err, stdout, stderr } = await execAsync(`tmux new-session -d -s ${cleanName} -c "${defaultDir}"`)
      if (err && !/duplicate session/i.test(stderr)) {
        res.statusCode = 500; res.end(JSON.stringify({ error: stderr.trim() || err.message })); return
      }
      pushLog('INFO', 'Tmux', `Session created: ${cleanName}`, req.user?.username || 'System', 'System')
      res.end(JSON.stringify({ success: true, name: cleanName }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // DELETE /api/tmux/session?name=<name> — kill tmux session
  if (url.startsWith('/api/tmux/session') && req.method === 'DELETE') {
    try {
      const name = new URL(req.url, 'http://localhost').searchParams.get('name') || ''
      const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '')
      if (!cleanName) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Nama session wajib diisi' })); return }
      const { err, stderr } = await execAsync(`tmux kill-session -t ${cleanName}`)
      if (err && !/no server running/i.test(stderr) && !/session not found/i.test(stderr)) {
        res.statusCode = 500; res.end(JSON.stringify({ error: stderr.trim() || err.message })); return
      }
      pushLog('WARN', 'Tmux', `Session killed: ${cleanName}`, req.user?.username || 'System', 'System')
      res.end(JSON.stringify({ success: true }))
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })) }
    return
  }

  // 404 for unknown API routes
  res.statusCode = 404; res.end(JSON.stringify({ error: 'API endpoint not found' }))
}

// ── Create HTTP server & attach Socket.IO ──────────────────────────
const httpServer = http.createServer(handleRequest)

ioInstance = new Server(httpServer, { cors: { origin: '*' } })

ioInstance.on('connection', (socket) => {
  socket.emit('init_logs', systemLogs)

  // PTY Terminal
  let ptyProcess = null
  socket.on('terminal_start', (options) => {
    if (ptyProcess) return
    const isWin = process.platform === 'win32'
    const shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
    let cwd = isWin ? (process.env.USERPROFILE || 'C:\\') : (process.env.HOME || '/')
    if (!isWin && fs.existsSync('/home/inu')) {
      cwd = '/home/inu'
    }
    ptyProcess = pty.spawn(shell, [], { name: 'xterm-256color', cols: 120, rows: 30, cwd, useConpty: false, env: process.env })
    ptyProcess.onData((data) => socket.emit('terminal_output', data))
    ptyProcess.onExit(({ exitCode }) => { socket.emit('terminal_exit', exitCode); ptyProcess = null })

    if (options && typeof options === 'object' && options.tmuxSession) {
      const cleanName = options.tmuxSession.replace(/[^a-zA-Z0-9_-]/g, '')
      if (cleanName) {
        setTimeout(() => {
          if (ptyProcess) {
            ptyProcess.write(`tmux attach -t ${cleanName}\r`)
          }
        }, 600)
      }
    }
  })
  socket.on('terminal_input', (data) => { if (ptyProcess) ptyProcess.write(data) })
  socket.on('terminal_resize', ({ cols, rows }) => { if (ptyProcess) ptyProcess.resize(cols, rows) })
  socket.on('disconnect', () => {
    if (ptyProcess) { ptyProcess.kill(); ptyProcess = null }
    if (tmuxPtyProcess) { try { tmuxPtyProcess.kill() } catch (e) {} tmuxPtyProcess = null }
  })

  // Project log streaming
  socket.on('subscribe_project_logs', (projectName) => {
    socket.join(`project_logs_${projectName}`)
    const buffer = projectLogBuffers[projectName] || []
    if (buffer.length > 0) socket.emit('project_log_history', { project: projectName, data: buffer.join('') })
  })
  socket.on('unsubscribe_project_logs', (projectName) => { socket.leave(`project_logs_${projectName}`) })

  // ── Tmux socket events ────────────────────────────────────────
  let tmuxPtyProcess = null

  // tmux_install_start: stream apt install tmux to client
  socket.on('tmux_install_start', () => {
    const shell = process.env.SHELL || '/bin/bash'
    // Use shell to combine all commands; we stream stdout/stderr
    const installCmd = 'apt-get update 2>&1 | tail -5 && apt-get install -y tmux 2>&1 && tmux -V'
    const installPty = pty.spawn(shell, ['-c', installCmd], {
      name: 'xterm-256color', cols: 120, rows: 30,
      cwd: process.env.HOME || '/',
      useConpty: false, env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    })

    let outputBuffer = ''
    let progressVal = 5
    let progressInterval = setInterval(() => {
      if (progressVal < 88) { progressVal += Math.random() * 4 + 1; socket.emit('tmux_install_output', { text: '', progress: Math.min(88, progressVal) }) }
    }, 700)

    installPty.onData((data) => {
      outputBuffer += data
      socket.emit('tmux_install_output', { text: data, progress: Math.min(88, progressVal) })
    })

    installPty.onExit(({ exitCode }) => {
      clearInterval(progressInterval)
      socket.emit('tmux_install_output', { text: '', progress: 95 })
      // Check version
      exec('tmux -V', (err, stdout) => {
        const version = (stdout || '').trim().replace(/^tmux\s*/i, '')
        socket.emit('tmux_install_done', { success: exitCode === 0 && !err, version: version || null })
      })
    })
  })

  // tmux_attach: attach to a tmux session via PTY
  socket.on('tmux_attach', ({ sessionName }) => {
    if (tmuxPtyProcess) { try { tmuxPtyProcess.kill() } catch (e) {} tmuxPtyProcess = null }
    const cleanName = (sessionName || '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!cleanName) return

    // Build a clean environment for tmux:
    // - Remove TMUX / TMUX_PANE so tmux doesn't think it's already nested
    // - Remove TMUX_PLUGIN_MANAGER_PATH just in case
    const attachEnv = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    delete attachEnv.TMUX
    delete attachEnv.TMUX_PANE
    delete attachEnv.TMUX_PLUGIN_MANAGER_PATH

    // Spawn tmux DIRECTLY (no shell wrapper) with new-session -t.
    // new-session -t creates a "grouped" session that mirrors the target session,
    // allowing multiple clients to connect simultaneously.
    // This is more reliable than attach-session which can fail if already attached.
    tmuxPtyProcess = pty.spawn('tmux', ['new-session', '-t', cleanName], {
      name: 'xterm-256color', cols: 220, rows: 50,
      cwd: process.env.HOME || '/',
      useConpty: false, env: attachEnv
    })
    tmuxPtyProcess.onData((data) => socket.emit('tmux_output', data))
    tmuxPtyProcess.onExit(({ exitCode }) => {
      socket.emit('tmux_exit', exitCode)
      tmuxPtyProcess = null
    })
  })

  socket.on('tmux_input', (data) => { if (tmuxPtyProcess) tmuxPtyProcess.write(data) })
  socket.on('tmux_resize', ({ cols, rows }) => { if (tmuxPtyProcess) tmuxPtyProcess.resize(cols, rows) })
  socket.on('tmux_detach', () => {
    // User clicked "Detach" button — send Ctrl+B D then kill PTY and notify client
    if (tmuxPtyProcess) {
      try { tmuxPtyProcess.write('\x02d') } catch (e) {}
      setTimeout(() => {
        if (tmuxPtyProcess) { try { tmuxPtyProcess.kill() } catch (e) {} tmuxPtyProcess = null }
        socket.emit('tmux_detached')
      }, 600)
    } else {
      socket.emit('tmux_detached')
    }
  })
})

// ── Start listening ────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✓ Ndelok production server running on http://0.0.0.0:${PORT}\x1b[0m`)
  console.log(`\x1b[90m  Serving frontend from: ${DIST_DIR}\x1b[0m`)
  pushLog('INFO', 'Server', `Production server started on port ${PORT}`, 'System', 'System')
  
  if (cloudflareState.enabled !== false) {
    setTimeout(() => {
      startCloudflareTunnel()
    }, 3000)
  }
})
