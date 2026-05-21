import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'
import fs from 'fs'
import path from 'path'
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
const JWT_SECRET = new TextEncoder().encode(process.env.NDELOK_JWT_SECRET || 'fallback-secret-for-dev-only-12345')
const AUTH_ENABLED = true

let ioInstance = null;

const DB_PATH = path.join(process.cwd(), 'src', 'database', 'projects.json')
let lastCpuInfo = os.cpus()
let currentCpuUsage = 0
let activeProjects = []
let runningProcs = {}
let deployLogs = {}
let projectLogBuffers = {} // Store raw terminal output per project

const LOGS_PATH = path.join(process.cwd(), 'src', 'database', 'system-logs.json')
const USERS_PATH = path.join(process.cwd(), 'src', 'database', 'users.json')
const ZEROTIER_PATH = path.join(process.cwd(), 'src', 'database', 'zerotier.json')

let systemLogs = []
let users = []
let zerotierState = { networks: [], serviceRunning: true }
if (fs.existsSync(ZEROTIER_PATH)) {
  try { zerotierState = JSON.parse(fs.readFileSync(ZEROTIER_PATH, 'utf-8')) } catch (e) {}
}
const saveZerotier = () => {
  try { fs.writeFileSync(ZEROTIER_PATH, JSON.stringify(zerotierState, null, 2)) } catch (e) {}
}

// Network speed tracking
let prevNetBytes = { rx: 0, tx: 0, time: Date.now() }
let netSpeed = { download: 0, upload: 0 } // bytes per second

if (fs.existsSync(USERS_PATH)) {
  try { users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8')) } catch (e) {}
}
if (fs.existsSync(LOGS_PATH)) {
  try {
    systemLogs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf-8'))
  } catch (e) {}
}

let saveLogsTimeout = null
const saveLogs = () => {
  if (saveLogsTimeout) clearTimeout(saveLogsTimeout)
  saveLogsTimeout = setTimeout(() => {
    fs.writeFile(LOGS_PATH, JSON.stringify(systemLogs, null, 2), () => {})
  }, 2000)
}

const killProcess = (name) => {
  const child = runningProcs[name]
  if (child) {
    try { child.kill(); } catch (e) {}
    if (os.platform() === 'win32') {
      exec(`taskkill /pid ${child.pid} /t /f`, () => {})
    } else {
      try { process.kill(-child.pid, 'SIGKILL') } catch (e) {}
    }
    delete runningProcs[name]
  }
  
  // Guarantee absolute shutdown - nuke any zombie bound to the mapped port
  const proj = activeProjects.find(p => p.name === name)
  if (proj && proj.port) {
    if (os.platform() === 'win32') {
      exec(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${proj.port}') do taskkill /f /pid %a`, { shell: 'cmd.exe' }, () => {})
    } else {
      exec(`lsof -t -i:${proj.port} | xargs kill -9`, () => {})
    }
  }
}

// Restore states
if (fs.existsSync(DB_PATH)) {
  try {
    activeProjects = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    // Remember which projects were running before reboot
    const projectsToRestart = activeProjects.filter(p => p.status === 'Running')
    // Mark everything stopped first since we lost process handles
    activeProjects.forEach(p => {
      p.status = 'Stopped'
      p.statusColor = 'bg-surface-container-highest text-slate-400'
      p.dot = 'bg-slate-500'
      p.progress = 0
    })
    // Auto-restart projects that were running before reboot
    if (projectsToRestart.length > 0) {
      setTimeout(() => {
        projectsToRestart.forEach(proj => {
          const p = activeProjects.find(ap => ap.name === proj.name)
          if (p) {
            pushLog('INFO', p.name, 'Auto-restarting project (was running before reboot)', 'System', 'Process')
            p.status = 'Starting...'
            p.statusColor = 'bg-tertiary/10 text-tertiary'
            p.dot = 'bg-tertiary animate-pulse'
            p.progress = 45
            saveProjects()
            setTimeout(() => spawnProject(p), 2000)
          }
        })
      }, 3000)
    }
  } catch(e) {}
}
const saveProjects = () => fs.writeFileSync(DB_PATH, JSON.stringify(activeProjects, null, 2))

// Setup timestamped logging
const pushLog = (level, service, msg, initiator = 'System', category = 'General') => {
  const d = new Date()
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  const payload = { time, level, service, msg, initiator, category }
  systemLogs.unshift(payload)
  if (systemLogs.length > 5000) systemLogs.pop()
  saveLogs()
  if (ioInstance) ioInstance.emit('new_log', payload)
}

// ── Input Hardening Helper ──────────────────────────────────────────
const sanitizeString = (str) => {
  if (typeof str !== 'string') return ''
  return str.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim()
}
const sanitizePath = (str) => {
  if (typeof str !== 'string') return ''
  return str.replace(/[^a-zA-Z0-9\-_]/g, '').trim()
}

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
  } catch(e) {}
  return size
}

setInterval(async () => {
  for (const proj of activeProjects) {
    const workspaceDir = path.join(process.cwd(), 'workspaces', proj.name)
    const bytes = await calculateDirSize(workspaceDir)
    projectDiskSizes[proj.name] = bytes
  }
}, 30000)

// OS Polling loop
setInterval(async () => {
  const currentInfo = os.cpus()
  let idleDifference = 0
  let totalDifference = 0
  for (let i = 0; i < currentInfo.length; i++) {
    const prev = lastCpuInfo[i].times
    const curr = currentInfo[i].times
    const prevTotal = Object.values(prev).reduce((a, b) => a + b)
    const currTotal = Object.values(curr).reduce((a, b) => a + b)
    idleDifference += curr.idle - prev.idle
    totalDifference += currTotal - prevTotal
  }
  lastCpuInfo = currentInfo
  if (totalDifference > 0) currentCpuUsage = 100 - Math.floor(100 * idleDifference / totalDifference)

  // Log CPU and RAM warnings only > 90% and every 5 minutes to avoid spam
  if (!global._lastCpuLogTime) global._lastCpuLogTime = 0
  if (!global._lastRamLogTime) global._lastRamLogTime = 0
  const now = Date.now()
  
  if (now - global._lastCpuLogTime > 300000) { // 5 minutes
    if (currentCpuUsage > 90) { 
      pushLog('WARN', 'CPU Monitor', `Elevated CPU usage: ${currentCpuUsage}%`, 'System', 'System')
      global._lastCpuLogTime = now 
    }
  }

  if (now - global._lastRamLogTime > 300000) { // 5 minutes
    const memTotal = os.totalmem()
    const memFree = os.freemem()
    const memUsage = Math.floor(((memTotal - memFree) / memTotal) * 100)
    if (memUsage > 90) { 
      pushLog('WARN', 'RAM Monitor', `Elevated RAM usage: ${memUsage}%`, 'System', 'System')
      global._lastRamLogTime = now 
    }
  }

  activeProjects.forEach(p => {
    if (p.status === 'Running' || p.status === 'Production') {
      p.cpu = Math.max(1, Math.min(100, (p.cpu || 0) + (Math.random() - 0.5) * 8))
      p.mem = Math.max(0.1, (p.mem || 0.1) + (Math.random() - 0.5) * 0.1)
      
      if (!p.startedAt) p.startedAt = Date.now()
      const diffSecs = Math.floor((Date.now() - p.startedAt) / 1000)
      if (diffSecs < 60) p.uptime = `${diffSecs}s`
      else if (diffSecs < 3600) p.uptime = `${Math.floor(diffSecs/60)}m ${diffSecs%60}s`
      else p.uptime = `${Math.floor(diffSecs/3600)}h ${Math.floor((diffSecs%3600)/60)}m`

    } else {
      p.uptime = '0s'
      p.startedAt = null
      p.cpu = 0
      p.mem = 0
    }
    const bytes = projectDiskSizes[p.name] || 0
    p.diskStr = bytes > 1024*1024*1024 ? (bytes/(1024*1024*1024)).toFixed(2) + 'GB' : (bytes > 0 ? (bytes/(1024*1024)).toFixed(1) + 'MB' : '0MB')
  })

  // Emit Real-time Global Stats
  if (ioInstance) {
    try {
      // Calculate network speed from OS network interfaces
      const nets = os.networkInterfaces()
      let totalRx = 0, totalTx = 0
      // Use /proc/net/dev on Linux, or networkInterfaces counters
      // For cross-platform, we track via systeminformation if available
      try {
        const si = await import('systeminformation')
        const netStats = await si.networkStats()
        if (netStats && netStats.length > 0) {
          for (const iface of netStats) {
            totalRx += iface.rx_sec || 0
            totalTx += iface.tx_sec || 0
          }
          netSpeed = { download: totalRx, upload: totalTx }
        }
      } catch (e) {
        // Fallback: no speed data
      }

      const disk = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
      const totalDisk = disk.blocks * disk.bsize
      const freeDisk = disk.bfree * disk.bsize
      const memTotal = os.totalmem()
      const memFree = os.freemem()

      const stats = {
        os: {
          hostname: os.hostname(), platform: os.platform(), type: os.type(),
          release: os.release(), uptime: os.uptime(),
          memTotal, memUsed: memTotal - memFree,
          cpuUsage: currentCpuUsage, cpuModel: os.cpus()[0].model,
          diskTotal: totalDisk, diskUsed: totalDisk - freeDisk,
          cores: os.cpus().length, netInterfaces: os.networkInterfaces(),
          netSpeed: netSpeed
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

const spawnProject = (proj) => {
  const workspaceDir = path.join(process.cwd(), 'workspaces', proj.name)
  if (!fs.existsSync(workspaceDir)) return // Safe fallback
  
  const isWin = process.platform === 'win32'
  const shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
  const cmdStr = proj.runCmd

  // Use PTY so programs output as if connected to a real terminal
  const ptyProc = pty.spawn(shell, isWin ? ['-Command', cmdStr] : ['-c', cmdStr], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: workspaceDir,
    useConpty: false,
    env: { ...process.env, FORCE_COLOR: '1', npm_config_color: 'always' }
  })
  
  runningProcs[proj.name] = ptyProc
  
  // Initialize log buffer for this project
  if (!projectLogBuffers[proj.name]) projectLogBuffers[proj.name] = []
  
  ptyProc.onData((data) => {
    // Store in buffer (max 500 entries)
    projectLogBuffers[proj.name].push(data)
    if (projectLogBuffers[proj.name].length > 500) projectLogBuffers[proj.name].shift()
    // Emit to subscribers
    if (ioInstance) ioInstance.to(`project_logs_${proj.name}`).emit('project_log', { project: proj.name, data })
    // Also push to system logs (strip ANSI for text logs)
    const clean = data.replace(/\x1b\[[0-9;]*m/g, '').trim()
    if (clean) pushLog('INFO', proj.name, clean, 'System', 'Process')
  })
  
  ptyProc.onExit(({ exitCode }) => {
    const exitMsg = `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`
    projectLogBuffers[proj.name].push(exitMsg)
    if (ioInstance) ioInstance.to(`project_logs_${proj.name}`).emit('project_log', { project: proj.name, data: exitMsg })
    pushLog('WARN', proj.name, `Process exited with code ${exitCode}`, 'System', 'Process')
    proj.status = 'Stopped'
    proj.statusColor = 'bg-surface-container-highest text-slate-400'
    proj.dot = 'bg-slate-500'
    proj.progress = 0
    proj.cpu = 0
    proj.mem = 0
    delete runningProcs[proj.name]
    saveProjects()
  })
  
  proj.status = 'Running'
  proj.statusColor = 'bg-emerald-500/10 text-emerald-400'
  proj.dot = 'bg-emerald-500 animate-pulse'
  proj.progress = 100
  proj.progressColor = 'bg-emerald-500'
  proj.startedAt = Date.now()
  proj.uptime = '0s'
  saveProjects()
}

export default defineConfig({
  server: {
    host: true,
    port: 1234,
    watch: {
      ignored: ['**/projects.json', '**/workspaces/**']
    }
  },
  plugins: [
    react(),
    {
      name: 'os-stats',
      configureServer(server) {
        ioInstance = new Server(server.httpServer, { cors: { origin: '*' } })
        ioInstance.on('connection', (socket) => {
          socket.emit('init_logs', systemLogs)

          // ── PTY Terminal ─────────────────────────────────────────────────
          let ptyProcess = null

          socket.on('terminal_start', () => {
            if (ptyProcess) return // already running

            const isWin = process.platform === 'win32'
            const shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
            const cwd = isWin ? (process.env.USERPROFILE || 'C:\\') : (process.env.HOME || '/')

            ptyProcess = pty.spawn(shell, [], {
              name: 'xterm-256color',
              cols: 120,
              rows: 30,
              cwd: cwd,
              useConpty: false,
              env: process.env
            })

            ptyProcess.onData((data) => {
              socket.emit('terminal_output', data)
            })

            ptyProcess.onExit(({ exitCode }) => {
              socket.emit('terminal_exit', exitCode)
              ptyProcess = null
            })
          })

          socket.on('terminal_input', (data) => {
            if (ptyProcess) ptyProcess.write(data)
          })

          socket.on('terminal_resize', ({ cols, rows }) => {
            if (ptyProcess) ptyProcess.resize(cols, rows)
          })

          socket.on('disconnect', () => {
            if (ptyProcess) { ptyProcess.kill(); ptyProcess = null }
          })

          // ── Project Log Streaming ───────────────────────────────────────
          socket.on('subscribe_project_logs', (projectName) => {
            socket.join(`project_logs_${projectName}`)
            // Send buffered logs
            const buffer = projectLogBuffers[projectName] || []
            if (buffer.length > 0) {
              socket.emit('project_log_history', { project: projectName, data: buffer.join('') })
            }
          })

          socket.on('unsubscribe_project_logs', (projectName) => {
            socket.leave(`project_logs_${projectName}`)
          })
        })

        server.middlewares.use('/api/stats', async (req, res) => {
          try {
            const disk = await fs.promises.statfs(os.platform() === 'win32' ? 'C:\\' : '/')
            const totalDisk = disk.blocks * disk.bsize
            const freeDisk = disk.bfree * disk.bsize
            const memTotal = os.totalmem()
            const memFree = os.freemem()

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              hostname: os.hostname(), platform: os.platform(), type: os.type(),
              release: os.release(), uptime: os.uptime(),
              memTotal, memUsed: memTotal - memFree,
              cpuUsage: currentCpuUsage, cpuModel: os.cpus()[0].model,
              diskTotal: totalDisk, diskUsed: totalDisk - freeDisk,
              cores: os.cpus().length, netInterfaces: os.networkInterfaces()
            }))
          } catch (e) {
            res.statusCode = 500; res.end(JSON.stringify({ error: e.toString() }))
          }
        })

        server.middlewares.use('/api/logs', (req, res) => {
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(systemLogs))
        })

        server.middlewares.use('/api/projects', (req, res) => {
          if (req.url !== '/' && req.url !== '') return req.next()
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            
            // Get bridge/main IP
            const nets = os.networkInterfaces()
            let hostIp = '127.0.0.1'
            for (const name of Object.keys(nets)) {
              for (const net of nets[name]) {
                if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
                  hostIp = net.address; break;
                }
              }
            }

            return res.end(JSON.stringify({
              projects: activeProjects,
              host: hostIp
            }))
          }
        })

        // ── Security & Hardening Middleware ───────────────────────────
        const LOGIN_ATTEMPTS = new Map() // brute-force protection state

        const securityHeaders = (req, res, next) => {
          // Standard security headers for all API/System routes
          res.setHeader('X-Frame-Options', 'DENY')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('X-XSS-Protection', '1; mode=block')
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
          
          // Basic CSP: Self-hosted resources + Google Fonts + Dicebear Avatars
          res.setHeader('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: https://api.dicebear.com; " +
            "connect-src 'self' ws: wss:;"
          )
          next()
        }

        const apiGuard = async (req, res, next) => {
          securityHeaders(req, res, () => {
             const isLogin = req.url === '/api/login' || req.url === '/login' || req.url.includes('login')
             if (!AUTH_ENABLED || isLogin || req.method === 'OPTIONS') return next()
             
             const authHeader = req.headers['authorization']
             if (!authHeader || !authHeader.startsWith('Bearer ')) {
               res.statusCode = 401
               return res.end(JSON.stringify({ error: 'Missing or malformed authorization token' }))
             }
   
             try {
               const token = authHeader.split(' ')[1]
               jose.jwtVerify(token, JWT_SECRET).then(({ payload }) => {
                  req.user = payload
                  next()
               }).catch(() => {
                  res.statusCode = 401
                  res.end(JSON.stringify({ error: 'Invalid or expired session' }))
               })
             } catch (e) {
               res.statusCode = 401
               res.end(JSON.stringify({ error: 'Identity fault' }))
             }
          })
        }

        const apiAudit = (req, res, next) => {
          if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
            const initiator = req.user?.username || 'Anonymous'
            const endpoint = req.url.split('?')[0]
            
            // Skip noisy/internal endpoints
            if (endpoint.includes('verify-password') || endpoint.includes('files/list') || endpoint.includes('files/read') || endpoint.includes('deploy-logs')) {
              next(); return
            }
            
            // Capture specific actions for better logging
            let action = 'State Change'
            if (endpoint.includes('login')) action = 'Login'
            else if (endpoint.includes('project-deploy')) action = 'Deployment'
            else if (endpoint.includes('project-action')) action = 'Project Control'
            else if (endpoint.includes('users')) action = 'User Management'
            else if (endpoint.includes('files/')) action = 'FileManager'
            else if (endpoint.includes('system/power')) action = 'System'
            
            pushLog('INFO', 'Audit', `${req.method} ${endpoint}`, initiator, action)
          }
          next()
        }

        server.middlewares.use('/api', apiGuard)
        server.middlewares.use('/api', apiAudit)

        server.middlewares.use('/api/login', (req, res) => {
          if (req.method !== 'POST') return res.end(JSON.stringify({ error: 'Method not allowed' }))
          
          let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
          if (ip === '::1') ip = '127.0.0.1 (Localhost)'
          else if (ip.startsWith('::ffff:')) ip = ip.slice(7)
          const now = Date.now()
          const record = LOGIN_ATTEMPTS.get(ip) || { count: 0, last: 0 }
          
          if (record.count >= 5 && now - record.last < 15 * 60 * 1000) {
            res.statusCode = 429
            return res.end(JSON.stringify({ error: 'Security lockout: Too many failed attempts. Try again in 15 minutes.' }))
          }

          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', async () => {
            try {
              const { username, password } = JSON.parse(body)
              const user = users.find(u => u.username === username)
              
              if (user && bcrypt.compareSync(password, user.password)) {
                // Clear lockout on success
                LOGIN_ATTEMPTS.delete(ip)
                
                const { password: _, ...safeUser } = user
                
                // Generate secure JWT with reduced TTL
                const token = await new jose.SignJWT(safeUser)
                  .setProtectedHeader({ alg: 'HS256' })
                  .setIssuedAt()
                  .setExpirationTime('2h')
                  .sign(JWT_SECRET)

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, user: safeUser, token }))
                pushLog('INFO', 'Auth', `User ${username} logged in from IP: ${ip}`, username, 'Security')
              } else {
                // Increment lockout on failure
                LOGIN_ATTEMPTS.set(ip, { count: record.count + 1, last: now })
                
                res.statusCode = 401
                res.end(JSON.stringify({ success: false, error: 'Cryptographic verification failed' }))
                pushLog('WARN', 'Auth', `Unauthorized access attempt for: ${username} (Attempt ${record.count + 1}/5)`, 'System', 'Security')
              }
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Identity resolution error' }))
            }
          })
        })
        server.middlewares.use('/api/users', (req, res) => {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            const safeUsers = users.map(({ password, ...u }) => u)
            res.end(JSON.stringify(safeUsers))
          } else if (req.method === 'POST') {
            // Only OWNER can register users
            if (req.user?.role !== 'owner') {
              res.statusCode = 403
              return res.end(JSON.stringify({ error: 'Permission denied: Only Owners can register agents' }))
            }

            let body = ''
            req.on('data', chunk => body += chunk.toString())
            req.on('end', async () => {
              try {
                const newUser = JSON.parse(body)
                if (!newUser.username || !newUser.password || !newUser.name) {
                   throw new Error('Incomplete agent credentials')
                }

                newUser.username = sanitizePath(newUser.username)
                newUser.name = sanitizeString(newUser.name)

                // Security lock: Multi-owner delegation prohibited
                if (newUser.role === 'owner') {
                   res.statusCode = 400
                   return res.end(JSON.stringify({ error: 'Security constraint: Multi-owner delegation is prohibited' }))
                }

                // Check redundancy
                if (users.some(u => u.username === newUser.username)) {
                   res.statusCode = 409
                   return res.end(JSON.stringify({ error: 'Identity collision: Username already exists' }))
                }

                const hashedPassword = bcrypt.hashSync(newUser.password, 10)
                const userToSave = {
                  id: Date.now().toString(),
                  ...newUser,
                  password: hashedPassword,
                  avatar: newUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${newUser.username}`
                }

                users.push(userToSave)
                fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
                
                pushLog('INFO', 'Audit', `Agent identity [${newUser.username}] provisioned by ${req.user.username}`, req.user.username, 'Management')
                
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, user: userToSave }))
              } catch (e) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: e.message }))
              }
            })
          } else if (req.method === 'DELETE') {
            if (req.user?.role !== 'owner') {
              res.statusCode = 403
              return res.end(JSON.stringify({ error: 'Permission denied: De-provisioning requires Owner clearance' }))
            }
            const usernameToDelete = new URL(req.url, 'http://localhost').searchParams.get('username')
            if (usernameToDelete === req.user.username) {
              res.statusCode = 400
              return res.end(JSON.stringify({ error: 'Security constraint: Root account cannot be self-deprovisioned' }))
            }

            const initialCount = users.length
            users = users.filter(u => u.username !== usernameToDelete)
            if (users.length < initialCount) {
               fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
               pushLog('WARN', 'Audit', `Agent identity [${usernameToDelete}] de-provisioned by ${req.user.username}`, req.user.username, 'Management')
               res.setHeader('Content-Type', 'application/json')
               res.end(JSON.stringify({ success: true }))
            } else {
               res.statusCode = 404
               res.end(JSON.stringify({ error: 'Identity resolution failure: User not found' }))
            }
          } else if (req.method === 'PATCH') {
            if (req.user?.role !== 'owner') {
              res.statusCode = 403
              return res.end(JSON.stringify({ error: 'Permission denied: Identity modification requires Owner clearance' }))
            }
            let body = ''
            req.on('data', chunk => body += chunk.toString())
            req.on('end', async () => {
              try {
                const updateData = JSON.parse(body)
                updateData.username = sanitizePath(updateData.username)
                updateData.name = sanitizeString(updateData.name)
                
                const userIndex = users.findIndex(u => u.username === updateData.username)
                if (userIndex === -1) {
                  res.statusCode = 404
                  return res.end(JSON.stringify({ error: 'User not found' }))
                }

                // Apply updates
                if (updateData.name) users[userIndex].name = updateData.name
                if (updateData.email) users[userIndex].email = updateData.email
                if (updateData.role) {
                   if (updateData.role === 'owner' && users[userIndex].role !== 'owner') {
                      res.statusCode = 400
                      return res.end(JSON.stringify({ error: 'Security constraint: Root promotion prohibited' }))
                   }
                   users[userIndex].role = updateData.role
                }
                if (updateData.password && updateData.password.trim() !== '') {
                   users[userIndex].password = bcrypt.hashSync(updateData.password, 10)
                }

                fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
                pushLog('INFO', 'Audit', `Agent identity [${updateData.username}] updated by ${req.user.username}`, req.user.username, 'Management')
                
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true }))
              } catch (e) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Protocol error during identity update' }))
              }
            })
          }
        })

        server.middlewares.use('/api/deploy-logs', (req, res) => {
          const name = new URL(req.url, 'http://localhost').searchParams.get('name')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(deployLogs[name] || []))
        })

        server.middlewares.use('/api/project-deploy', (req, res) => {
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const payload = JSON.parse(body)
              const name = sanitizePath(payload.name)
              if (!name) throw new Error('Invalid project name: Identifiers must be alphanumeric-only')
              
              deployLogs[name] = [`[SYSTEM] Starting deployment for ${name}`]
              
              const p = {
                  id: Date.now().toString(),
                  name, desc: payload.desc || '', lang: payload.lang || '',
                  status: 'Deploying...', statusColor: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary animate-pulse',
                  servers: 1, uptime: '0m', lastDeploy: 'Just now', icon: 'rocket_launch', iconColor: 'text-primary',
                  progress: 0, progressColor: 'bg-tertiary', cpu: 0, mem: 0,
                  installCmd: payload.installCmd, runCmd: payload.runCmd,
                  port: payload.port || '',
                  domain: payload.domain || '',
                  accessType: payload.accessType || 'port',
                  repo: payload.repo, branch: payload.branch || 'main'
              }
              activeProjects = activeProjects.filter(x => x.name !== name)
              activeProjects.push(p)
              saveProjects()

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))

              const initiator = req.user?.username || 'System'
              pushLog('INFO', 'Deploy', `Session initialized for ${name}`, initiator, 'Deployment')
              
              const wsDir = path.join(process.cwd(), 'workspaces')
              if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir)
              const projDir = path.join(wsDir, name)
              if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true })
              
              let cleanRepo = p.repo.replace(/\/+$/, '')
              let finalBranch = p.branch || 'main'
              
              const treeMatch = cleanRepo.match(/^(https?:\/\/github\.com\/[^\/]+\/[^\/]+)\/(?:tree|blob)\/([^\/]+)/)
              if (treeMatch) {
                 cleanRepo = treeMatch[1]
                 finalBranch = treeMatch[2]
              }
              
              deployLogs[name].push(`[GIT] Cloning ${cleanRepo} branch ${finalBranch}...`)
              // ── SECURE CLONE ──────────────────────────────────────────────────
              const gitClone = spawn('git', ['clone', '-b', finalBranch, cleanRepo, projDir])
              
              gitClone.stdout.on('data', d => deployLogs[name].push(d.toString()))
              gitClone.stderr.on('data', d => deployLogs[name].push(d.toString()))

              gitClone.on('close', (code) => {
                if (code !== 0) {
                  deployLogs[name].push(`[ERROR] Git clone failed with exit code ${code}`)
                  p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects()
                  return
                }

                deployLogs[name].push(`[GIT] Cloned successfully.`)
                deployLogs[name].push(`[CMD] Running: ${p.installCmd}`)
                
                // ── SECURE INSTALL ──────────────────────────────────────────────
                const installArgs = p.installCmd.split(' ')
                const installBin = installArgs.shift()
                const installer = spawn(installBin, installArgs, { cwd: projDir, shell: true })
                
                installer.stdout.on('data', d => deployLogs[name].push(d.toString()))
                installer.stderr.on('data', d => deployLogs[name].push(d.toString()))

                installer.on('close', (code2) => {
                  if (code2 !== 0) {
                    deployLogs[name].push(`[ERROR] Install failed with exit code ${code2}`)
                    p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects()
                    return
                  }
                  deployLogs[name].push(`[INFO] Dependencies ready.`)
                  deployLogs[name].push(`[CMD] Starting process...`)
                  spawnProject(p)
                  deployLogs[name].push(`[SUCCESS] Service is LIVE.`)
                })
              })

            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.toString() }))
            }
          })
        })

        // ── FILE UPLOAD DEPLOY ENDPOINT ─────────────────────────────────────
        server.middlewares.use('/api/project-deploy-upload', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          
          const busboy = Busboy({ headers: req.headers })
          const fields = {}
          const files = []
          
          busboy.on('field', (name, val) => { fields[name] = val })
          
          busboy.on('file', (fieldname, file, info) => {
            const { filename } = info
            const chunks = []
            file.on('data', d => chunks.push(d))
            file.on('end', () => {
              files.push({ filename: filename.replace(/\\/g, '/'), data: Buffer.concat(chunks) })
            })
          })
          
          busboy.on('finish', () => {
            try {
              const name = sanitizePath(fields.name)
              if (!name) throw new Error('Invalid project name')
              
              // Parse paths array sent from frontend (preserves directory structure)
              let paths = []
              try { paths = JSON.parse(fields.paths || '[]') } catch (e) { paths = [] }
              
              // Match each file with its path (in same order they were appended)
              if (paths.length === files.length) {
                files.forEach((f, i) => { f.filename = paths[i].replace(/\\/g, '/') })
              }
              
              deployLogs[name] = [`[SYSTEM] Starting file-upload deployment for ${name}`]
              
              const p = {
                id: Date.now().toString(),
                name, desc: '', lang: '',
                status: 'Deploying...', statusColor: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary animate-pulse',
                servers: 1, uptime: '0m', lastDeploy: 'Just now', icon: 'rocket_launch', iconColor: 'text-primary',
                progress: 0, progressColor: 'bg-tertiary', cpu: 0, mem: 0,
                installCmd: fields.installCmd || 'npm install', runCmd: fields.runCmd || 'node index.js',
                port: fields.port || '',
                domain: fields.domain || '',
                accessType: fields.accessType || 'port',
                repo: 'file-upload', branch: 'local'
              }
              activeProjects = activeProjects.filter(x => x.name !== name)
              activeProjects.push(p)
              saveProjects()
              
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
              
              const initiator = req.user?.username || 'System'
              pushLog('INFO', 'Deploy', `File upload deployment for ${name} (${files.length} files)`, initiator, 'Deployment')
              
              // Create workspace directory
              const wsDir = path.join(process.cwd(), 'workspaces')
              if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir)
              const projDir = path.join(wsDir, name)
              if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true })
              fs.mkdirSync(projDir, { recursive: true })
              
              deployLogs[name].push(`[UPLOAD] Writing ${files.length} files to workspace...`)
              
              // Detect common root folder (e.g. "WADASHV2/") and strip it
              let commonPrefix = ''
              if (files.length > 0) {
                const firstParts = files[0].filename.split('/')
                if (firstParts.length > 1) {
                  const candidate = firstParts[0] + '/'
                  const allMatch = files.every(f => f.filename.startsWith(candidate))
                  if (allMatch) commonPrefix = candidate
                }
              }
              
              // Write all uploaded files preserving directory structure
              for (const f of files) {
                const relativePath = commonPrefix ? f.filename.slice(commonPrefix.length) : f.filename
                if (!relativePath) continue
                const filePath = path.join(projDir, relativePath)
                const fileDir = path.dirname(filePath)
                if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true })
                fs.writeFileSync(filePath, f.data)
              }
              
              deployLogs[name].push(`[UPLOAD] All files written successfully.`)
              deployLogs[name].push(`[CMD] Running: ${p.installCmd}`)
              
              // Run install command
              const installArgs = p.installCmd.split(' ')
              const installBin = installArgs.shift()
              const installer = spawn(installBin, installArgs, { cwd: projDir, shell: true })
              
              installer.stdout.on('data', d => deployLogs[name].push(d.toString()))
              installer.stderr.on('data', d => deployLogs[name].push(d.toString()))
              
              installer.on('close', (code) => {
                if (code !== 0) {
                  deployLogs[name].push(`[ERROR] Install failed with exit code ${code}`)
                  p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects()
                  return
                }
                deployLogs[name].push(`[INFO] Dependencies ready.`)
                deployLogs[name].push(`[CMD] Starting process...`)
                spawnProject(p)
                deployLogs[name].push(`[SUCCESS] Service is LIVE.`)
              })
              
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.toString() }))
            }
          })
          
          req.pipe(busboy)
        })

        // ── FILE MANAGER ENDPOINTS ───────────────────────────────────────────

        // Helper: resolve & validate path stays within workspace
        const resolveWorkspacePath = (project, relPath) => {
          const wsDir = path.join(process.cwd(), 'workspaces')
          const projDir = path.join(wsDir, sanitizePath(project))
          const safePath = relPath ? path.join(projDir, relPath.replace(/\.\./g, '')) : projDir
          // Prevent path traversal
          if (!safePath.startsWith(projDir)) throw new Error('Path traversal detected')
          return { projDir, safePath }
        }

        // GET /api/files/list?project=X&path=Y — list directory contents
        server.middlewares.use('/api/files/list', (req, res) => {
          if (req.method !== 'GET') { res.statusCode = 405; res.end('Method not allowed'); return }
          try {
            const url = new URL(req.url, 'http://localhost')
            const project = url.searchParams.get('project') || ''
            const relPath = url.searchParams.get('path') || ''
            const { safePath } = resolveWorkspacePath(project, relPath)

            if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Path not found' })); return }
            if (!fs.statSync(safePath).isDirectory()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Not a directory' })); return }

            const entries = fs.readdirSync(safePath).map(name => {
              const fullPath = path.join(safePath, name)
              const stat = fs.statSync(fullPath)
              return {
                name,
                type: stat.isDirectory() ? 'folder' : 'file',
                size: stat.isDirectory() ? null : stat.size,
                modified: stat.mtime.toISOString(),
                ext: stat.isDirectory() ? null : path.extname(name).slice(1).toLowerCase()
              }
            }).sort((a, b) => {
              if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
              return a.name.localeCompare(b.name)
            })

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ entries, path: relPath }))
          } catch (e) {
            res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
          }
        })

        // GET /api/files/read?project=X&path=Y — read file content
        server.middlewares.use('/api/files/read', (req, res) => {
          if (req.method !== 'GET') { res.statusCode = 405; res.end('Method not allowed'); return }
          try {
            const url = new URL(req.url, 'http://localhost')
            const project = url.searchParams.get('project') || ''
            const relPath = url.searchParams.get('path') || ''
            const { safePath } = resolveWorkspacePath(project, relPath)

            if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'File not found' })); return }
            const stat = fs.statSync(safePath)
            if (stat.isDirectory()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Is a directory' })); return }
            if (stat.size > 2 * 1024 * 1024) { res.statusCode = 413; res.end(JSON.stringify({ error: 'File too large (max 2MB)' })); return }

            const content = fs.readFileSync(safePath, 'utf8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ content, size: stat.size, modified: stat.mtime.toISOString() }))
          } catch (e) {
            res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
          }
        })

        // POST /api/files/write — create or update file
        server.middlewares.use('/api/files/write', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const { project, path: relPath, content } = JSON.parse(body)
              const { safePath } = resolveWorkspacePath(project, relPath)
              const dir = path.dirname(safePath)
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(safePath, content, 'utf8')
              pushLog('INFO', 'FileManager', `File written: ${relPath}`, req.user?.username || 'System', 'FileManager')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // POST /api/files/mkdir — create directory
        server.middlewares.use('/api/files/mkdir', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const { project, path: relPath } = JSON.parse(body)
              const { safePath } = resolveWorkspacePath(project, relPath)
              if (fs.existsSync(safePath)) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Already exists' })); return }
              fs.mkdirSync(safePath, { recursive: true })
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // POST /api/files/rename — rename file or folder
        server.middlewares.use('/api/files/rename', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const { project, oldPath, newPath } = JSON.parse(body)
              const { safePath: oldSafe } = resolveWorkspacePath(project, oldPath)
              const { safePath: newSafe } = resolveWorkspacePath(project, newPath)
              if (!fs.existsSync(oldSafe)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Source not found' })); return }
              if (fs.existsSync(newSafe)) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Destination already exists' })); return }
              fs.renameSync(oldSafe, newSafe)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // POST /api/files/delete — delete file or folder
        server.middlewares.use('/api/files/delete', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const { project, path: relPath } = JSON.parse(body)
              const { safePath } = resolveWorkspacePath(project, relPath)
              if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' })); return }
              const stat = fs.statSync(safePath)
              if (stat.isDirectory()) {
                fs.rmSync(safePath, { recursive: true, force: true })
              } else {
                fs.unlinkSync(safePath)
              }
              pushLog('WARN', 'FileManager', `Deleted: ${relPath}`, req.user?.username || 'System', 'FileManager')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // GET /api/files/download?project=X&path=Y — download file
        server.middlewares.use('/api/files/download', (req, res) => {
          if (req.method !== 'GET') { res.statusCode = 405; res.end('Method not allowed'); return }
          try {
            const url = new URL(req.url, 'http://localhost')
            const project = url.searchParams.get('project') || ''
            const relPath = url.searchParams.get('path') || ''
            const { safePath } = resolveWorkspacePath(project, relPath)
            if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
              res.statusCode = 404; res.end('Not found'); return
            }
            const filename = path.basename(safePath)
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
            res.setHeader('Content-Type', 'application/octet-stream')
            fs.createReadStream(safePath).pipe(res)
          } catch (e) {
            res.statusCode = 400; res.end(e.message)
          }
        })

        // GET /api/files/download-folder?project=X&path=Y — zip & download folder
        server.middlewares.use('/api/files/download-folder', (req, res) => {
          if (req.method !== 'GET') { res.statusCode = 405; res.end('Method not allowed'); return }
          try {
            const url = new URL(req.url, 'http://localhost')
            const project = url.searchParams.get('project') || ''
            const relPath = url.searchParams.get('path') || ''
            const { safePath } = resolveWorkspacePath(project, relPath)

            if (!fs.existsSync(safePath)) { res.statusCode = 404; res.end('Not found'); return }
            if (!fs.statSync(safePath).isDirectory()) { res.statusCode = 400; res.end('Not a directory'); return }

            const folderName = path.basename(safePath) || project
            const zipName = `${folderName}.zip`

            res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`)
            res.setHeader('Content-Type', 'application/zip')

            const archive = archiver('zip', { zlib: { level: 6 } })
            archive.on('error', (err) => { console.error('Archiver error:', err); res.end() })
            archive.pipe(res)
            archive.directory(safePath, folderName)
            archive.finalize()
          } catch (e) {
            res.statusCode = 400; res.end(e.message)
          }
        })

        // POST /api/files/upload — upload file into workspace
        server.middlewares.use('/api/files/upload', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          const bb = Busboy({ headers: req.headers })
          let project = '', destPath = ''
          const uploads = []
          bb.on('field', (name, val) => { if (name === 'project') project = val; if (name === 'path') destPath = val })
          bb.on('file', (fieldname, file, info) => {
            const chunks = []
            file.on('data', d => chunks.push(d))
            file.on('end', () => uploads.push({ filename: info.filename, data: Buffer.concat(chunks) }))
          })
          bb.on('finish', () => {
            try {
              const { projDir } = resolveWorkspacePath(project, '')
              for (const u of uploads) {
                const targetDir = path.join(projDir, destPath || '')
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
                fs.writeFileSync(path.join(targetDir, u.filename), u.data)
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, count: uploads.length }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
          req.pipe(bb)
        })

        // POST /api/verify-password — verify current user's password
        server.middlewares.use('/api/verify-password', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', async () => {
            try {
              const { password } = JSON.parse(body)
              const username = req.user?.username
              if (!username || !password) {
                res.statusCode = 400; res.end(JSON.stringify({ error: 'Missing credentials' })); return
              }
              const foundUser = users.find(u => u.username === username)
              if (!foundUser) {
                res.statusCode = 401; res.end(JSON.stringify({ error: 'User not found' })); return
              }
              const valid = await bcrypt.compare(password, foundUser.password)
              if (!valid) {
                res.statusCode = 401; res.end(JSON.stringify({ error: 'Invalid password' })); return
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // POST /api/system/power — shutdown or reboot the system
        server.middlewares.use('/api/system/power', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', async () => {
            try {
              const { action, password } = JSON.parse(body)
              
              // Only owner can shutdown/reboot
              if (req.user?.role !== 'owner') {
                res.statusCode = 403; res.end(JSON.stringify({ error: 'Only owners can perform system power actions' })); return
              }

              // Verify password
              const username = req.user?.username
              const foundUser = users.find(u => u.username === username)
              if (!foundUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'User not found' })); return }
              const valid = await bcrypt.compare(password, foundUser.password)
              if (!valid) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Invalid password' })); return }

              // Determine OS and command
              const isWindows = process.platform === 'win32'
              let cmd
              if (action === 'shutdown') {
                cmd = isWindows ? 'shutdown /s /t 5 /f' : 'shutdown -h now'
              } else if (action === 'reboot') {
                cmd = isWindows ? 'shutdown /r /t 5 /f' : 'shutdown -r now'
              } else {
                res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid action. Use "shutdown" or "reboot".' })); return
              }

              pushLog('WARN', 'System', `System ${action} initiated by ${username}`, username, 'System')

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, message: `System will ${action} shortly.` }))

              // Execute after response is sent
              setTimeout(() => {
                exec(cmd, (err) => { if (err) console.error('Power command error:', err) })
              }, 1000)

            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // ── ZeroTier Plugin Endpoints ─────────────────────────────────
        const isWin = process.platform === 'win32'
        const isRoot = !isWin && typeof process.getuid === 'function' && process.getuid() === 0
        const sudoPrefix = (isWin || isRoot) ? '' : 'sudo '
        const ztCliPath = isWin
          ? `"C:\\Program Files (x86)\\ZeroTier\\One\\zerotier-cli.bat"`
          : 'zerotier-cli'
        const ztServiceName = isWin ? 'ZeroTierOneService' : 'zerotier-one'

        const execAsync = (cmd, opts = {}) => new Promise((resolve) => {
          exec(cmd, { timeout: 15000, ...opts }, (err, stdout, stderr) => {
            resolve({ err, stdout: (stdout || '').toString(), stderr: (stderr || '').toString() })
          })
        })

        const ztServiceStartCmd = isWin
          ? `net start ${ztServiceName}`
          : `${sudoPrefix}systemctl start ${ztServiceName}`
        const ztServiceStopCmd = isWin
          ? `net stop ${ztServiceName}`
          : `${sudoPrefix}systemctl stop ${ztServiceName}`

        // Best-effort service start; ignores "already running" errors
        const ensureZtServiceRunning = async () => {
          const { err, stderr, stdout } = await execAsync(ztServiceStartCmd)
          // Treat "already running" / exit codes that indicate already-up as success
          const out = (stderr + stdout).toLowerCase()
          if (!err) return { ok: true }
          if (/already|running|2182|active/.test(out)) return { ok: true }
          return { ok: false, err: stderr || err.message }
        }

        const parseZtError = (stdout, stderr, err) => {
          const text = (stderr || stdout || err?.message || '').trim()
          if (!text) return 'Perintah gagal tanpa output. Pastikan ZeroTier terinstal & service berjalan.'
          if (/connection failed/i.test(text)) {
            return 'Tidak dapat terhubung ke daemon ZeroTier. Pastikan service ZeroTier sudah running & app dijalankan dengan privilege yang cukup (root/admin).'
          }
          if (/not found|command not found|recognized/i.test(text)) {
            return 'ZeroTier CLI tidak ditemukan. Jalankan install.sh terlebih dahulu.'
          }
          if (/permission|denied|sudo/i.test(text)) {
            return 'Izin ditolak. Jalankan service dengan privilege root atau aktifkan sudo NOPASSWD untuk zerotier-cli.'
          }
          return text
        }

        // GET /api/zerotier/status — return state from local DB
        server.middlewares.use('/api/zerotier/status', (req, res) => {
          if (req.method !== 'GET') { res.statusCode = 405; res.end('Method not allowed'); return }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            networks: zerotierState.networks || [],
            serviceRunning: zerotierState.serviceRunning !== false
          }))
        })

        // POST /api/zerotier/join { networkId } — sudo zerotier-cli join NETWORK_ID
        server.middlewares.use('/api/zerotier/join', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          if (req.user?.role !== 'owner') {
            res.statusCode = 403; res.end(JSON.stringify({ error: 'Hanya owner yang dapat mendaftarkan network ZeroTier' })); return
          }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', async () => {
            try {
              const { networkId } = JSON.parse(body)
              const cleanId = (networkId || '').toString().trim().toLowerCase()
              if (!/^[a-f0-9]{16}$/.test(cleanId)) {
                res.statusCode = 400
                return res.end(JSON.stringify({ error: 'Network ID harus 16 karakter hex (0-9, a-f)' }))
              }

              if ((zerotierState.networks || []).some(n => n.id === cleanId)) {
                res.statusCode = 409
                return res.end(JSON.stringify({ error: 'Network ID sudah terdaftar' }))
              }

              // Make sure ZT service is up — needed for join to succeed
              await ensureZtServiceRunning()
              await new Promise(r => setTimeout(r, 1500))

              // Execute: sudo zerotier-cli join NETWORK_ID_KAMU
              const cmd = `${sudoPrefix}${ztCliPath} join ${cleanId}`
              let { err, stdout, stderr } = await execAsync(cmd)

              // Retry once if connection failed (service may need extra warm-up)
              if (err || /error|connection failed/i.test(stdout + stderr)) {
                await new Promise(r => setTimeout(r, 2000))
                const retry = await execAsync(cmd)
                err = retry.err; stdout = retry.stdout; stderr = retry.stderr
              }

              if (err || /error|connection failed/i.test(stdout + stderr)) {
                res.statusCode = 500
                return res.end(JSON.stringify({ error: parseZtError(stdout, stderr, err) }))
              }

              const newNet = {
                id: cleanId,
                joinedAt: new Date().toISOString(),
                joinedBy: req.user?.username || 'system'
              }
              zerotierState.networks = zerotierState.networks || []
              zerotierState.networks.push(newNet)
              zerotierState.serviceRunning = true
              saveZerotier()

              pushLog('INFO', 'ZeroTier', `Joined network ${cleanId}`, req.user?.username || 'System', 'System')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, network: newNet, output: stdout.trim() }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // POST /api/zerotier/service { action: 'start'|'stop' }
        server.middlewares.use('/api/zerotier/service', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          if (req.user?.role !== 'owner') {
            res.statusCode = 403; res.end(JSON.stringify({ error: 'Hanya owner yang dapat mengontrol service ZeroTier' })); return
          }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', async () => {
            try {
              const { action } = JSON.parse(body)
              if (!['start', 'stop'].includes(action)) {
                res.statusCode = 400; res.end(JSON.stringify({ error: 'Action tidak valid' })); return
              }
              const cmd = action === 'start' ? ztServiceStartCmd : ztServiceStopCmd
              const { err, stdout, stderr } = await execAsync(cmd)
              const combinedOut = (stderr + stdout).toLowerCase()
              // Tolerate "already running" / "not running" as success for idempotency
              const tolerableIdempotent = action === 'start'
                ? /already|running|2182|active/.test(combinedOut)
                : /not running|2184|2185|inactive|not started/.test(combinedOut)

              if (err && !tolerableIdempotent) {
                res.statusCode = 500
                return res.end(JSON.stringify({ error: parseZtError(stdout, stderr, err) }))
              }
              zerotierState.serviceRunning = action === 'start'
              saveZerotier()
              pushLog('INFO', 'ZeroTier', `Service ${action}ed`, req.user?.username || 'System', 'System')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, serviceRunning: zerotierState.serviceRunning, output: stdout.trim() }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        // POST /api/zerotier/leave { networkId, password }
        server.middlewares.use('/api/zerotier/leave', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
          if (req.user?.role !== 'owner') {
            res.statusCode = 403; res.end(JSON.stringify({ error: 'Hanya owner yang dapat leave network ZeroTier' })); return
          }
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', async () => {
            try {
              const { networkId, password } = JSON.parse(body)
              const cleanId = (networkId || '').toString().trim().toLowerCase()
              if (!/^[a-f0-9]{16}$/.test(cleanId)) {
                res.statusCode = 400
                return res.end(JSON.stringify({ error: 'Network ID tidak valid' }))
              }
              if (!password) {
                res.statusCode = 400
                return res.end(JSON.stringify({ error: 'Password verifikasi wajib diisi' }))
              }

              // Service must be stopped (per user's UX requirement)
              if (zerotierState.serviceRunning !== false) {
                res.statusCode = 400
                return res.end(JSON.stringify({ error: 'Matikan ZeroTier service terlebih dahulu sebelum leave network' }))
              }

              // Verify password
              const username = req.user?.username
              const foundUser = users.find(u => u.username === username)
              if (!foundUser) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'User tidak ditemukan' })) }
              const valid = await bcrypt.compare(password, foundUser.password)
              if (!valid) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Password salah' })) }

              // Execute: sudo zerotier-cli leave NETWORK_ID_KAMU
              const cmd = `${sudoPrefix}${ztCliPath} leave ${cleanId}`
              const { err, stdout, stderr } = await execAsync(cmd)
              const cmdFailed = err || /error|connection failed/i.test(stdout + stderr)

              // Always remove from local registration regardless of CLI outcome
              zerotierState.networks = (zerotierState.networks || []).filter(n => n.id !== cleanId)
              saveZerotier()

              pushLog('WARN', 'ZeroTier', `Left network ${cleanId}${cmdFailed ? ' (CLI command failed; record removed)' : ''}`, username, 'System')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: true,
                output: (stdout || stderr || '').trim(),
                cliFailed: !!cmdFailed,
                cliError: cmdFailed ? parseZtError(stdout, stderr, err) : null
              }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
            }
          })
        })

        server.middlewares.use('/api/project-action', (req, res) => {
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const { name, action, payload } = JSON.parse(body)
              const initiator = req.user?.username || 'System'
              const proj = activeProjects.find(p => p.name === name)
              
              if (proj) {
                pushLog('INFO', 'Audit', `Action [${action}] initiated for project [${name}]`, initiator, 'Project')
                
                if (action === 'edit' && payload) {
                  proj.port = payload.port
                  proj.domain = payload.domain || ''
                  proj.accessType = payload.accessType || 'port'
                  proj.installCmd = payload.installCmd
                  proj.runCmd = payload.runCmd
                  saveProjects()
                } else if (action === 'delete') {
                  if (req.user?.role !== 'owner') {
                    res.statusCode = 403
                    return res.end(JSON.stringify({ error: 'Permission denied for deletion' }))
                  }
                  killProcess(name)
                  activeProjects = activeProjects.filter(p => p.name !== name)
                  saveProjects()
                  try {
                    const projDir = path.join(process.cwd(), 'workspaces', name)
                    if (fs.existsSync(projDir)) fs.rmSync(projDir, { recursive: true, force: true })
                  } catch (err) {}
                } else if (action === 'stop') {
                  killProcess(name)
                  proj.status = 'Stopped'
                  proj.statusColor = 'bg-surface-container-highest text-slate-400'
                  proj.dot = 'bg-slate-500'
                  proj.progress = 0
                  proj.cpu = 0
                  proj.mem = 0
                  saveProjects()
                } else if (action === 'restart' || action === 'start') {
                  killProcess(name)
                  proj.status = 'Starting...'
                  proj.statusColor = 'bg-tertiary/10 text-tertiary'
                  proj.dot = 'bg-tertiary animate-pulse'
                  proj.progress = 45
                  proj.cpu = 85
                  saveProjects()
                  setTimeout(() => spawnProject(proj), 2000)
                }
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: !!proj }))
            } catch (e) {
              res.statusCode = 400; res.end(JSON.stringify({ error: 'Action protocol failure' }))
            }
          })
        })
      }
    }
  ],
})
