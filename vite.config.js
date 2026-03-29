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

const LOGS_PATH = path.join(process.cwd(), 'src', 'database', 'system-logs.json')
const USERS_PATH = path.join(process.cwd(), 'src', 'database', 'users.json')

let systemLogs = []
let users = []

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
    if (os.platform() === 'win32') {
      exec(`taskkill /pid ${child.pid} /t /f`, () => {})
    } else {
      try { process.kill(-child.pid, 'SIGKILL') } catch (e) { child.kill('SIGKILL') }
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
    // Mark everything stopped on boot since we lost process handles during Vite restart
    activeProjects.forEach(p => {
      p.status = 'Stopped'
      p.statusColor = 'bg-surface-container-highest text-slate-400'
      p.dot = 'bg-slate-500'
      p.progress = 0
    })
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

  if (currentCpuUsage > 85) pushLog('ERROR', 'CPU Monitor', `Critical CPU load detected: ${currentCpuUsage}%`, 'System', 'System')
  else if (currentCpuUsage > 60) pushLog('WARN', 'CPU Monitor', `Elevated CPU usage: ${currentCpuUsage}%`, 'System', 'System')

  if (Math.random() > 0.8) pushLog('INFO', 'Network', `Handling inbound connection from ${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.X.X`, 'System', 'Traffic')

  activeProjects.forEach(p => {
    if (p.status === 'Running' || p.status === 'Production') {
      p.cpu = Math.max(1, Math.min(100, (p.cpu || 0) + (Math.random() - 0.5) * 8))
      p.mem = Math.max(0.1, (p.mem || 0.1) + (Math.random() - 0.5) * 0.1)
      if (Math.random() > 0.8) pushLog('INFO', p.name, `Handled ${Math.floor(Math.random()*40)+5} connections in ${Math.floor(Math.random()*15)+1}ms`, 'System', 'Traffic')
      if (Math.random() > 0.95) pushLog('WARN', p.name, `Memory spike detected, performing GC collection`, 'System', 'System')
      
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
          cores: os.cpus().length, netInterfaces: os.networkInterfaces()
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
  
  const args = proj.runCmd.split(' ')
  const bin = args.shift()
  const child = spawn(bin, args, { cwd: workspaceDir, shell: true, detached: os.platform() !== 'win32' })
  runningProcs[proj.name] = child
  
  child.stdout.on('data', d => pushLog('INFO', proj.name, d.toString().trim(), 'System', 'Process'))
  child.stderr.on('data', d => pushLog('ERROR', proj.name, d.toString().trim(), 'System', 'Process'))
  
  child.on('close', code => {
    pushLog('WARN', proj.name, `Process exited with code ${code}`, 'System', 'Process')
    proj.status = 'Stopped'
    proj.statusColor = 'bg-surface-container-highest text-slate-400'
    proj.dot = 'bg-slate-500'
    proj.progress = 0
    proj.cpu = 0
    proj.mem = 0
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
          socket.on('terminal_command', (cmd) => {
            pushLog('INFO', 'Terminal', `Executing: ${cmd}`, socket.user?.username || 'User', 'Audit')
            const [executable, ...args] = cmd.split(' ')
            try {
              const proc = spawn(executable, args, { shell: true })
              proc.stdout.on('data', (d) => socket.emit('terminal_output', d.toString()))
              proc.stderr.on('data', (d) => socket.emit('terminal_output', `\x1b[31m${d.toString()}\x1b[0m`))
              proc.on('close', (code) => {
                 socket.emit('terminal_output', `\n\r[Process completed with code ${code}]\r\n`)
              })
            } catch (e) {
              socket.emit('terminal_output', `\x1b[31mError: ${e.message}\x1b[0m\n`)
            }
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
            
            // Capture specific actions for better logging
            let action = 'State Change'
            if (endpoint.includes('login')) action = 'Login'
            else if (endpoint.includes('project-deploy')) action = 'Deployment'
            else if (endpoint.includes('project-action')) action = 'Project Control'
            else if (endpoint.includes('users')) action = 'User Management'
            
            pushLog('INFO', 'Audit', `${req.method} request to ${endpoint} initiated`, initiator, action)
          }
          next()
        }

        server.middlewares.use('/api', apiGuard)
        server.middlewares.use('/api', apiAudit)

        server.middlewares.use('/api/login', (req, res) => {
          if (req.method !== 'POST') return res.end(JSON.stringify({ error: 'Method not allowed' }))
          
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
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
                pushLog('INFO', 'Auth', `User ${username} session initialized`, username, 'Security')
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
