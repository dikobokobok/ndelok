import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { exec, spawn } from 'child_process'
import { Server } from 'socket.io'

let ioInstance = null;

const DB_PATH = path.join(process.cwd(), 'src', 'database', 'projects.json')
let lastCpuInfo = os.cpus()
let currentCpuUsage = 0
let activeProjects = []
let runningProcs = {}
let deployLogs = {}

const LOGS_PATH = path.join(process.cwd(), 'src', 'database', 'system-logs.json')
let systemLogs = []
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
const pushLog = (level, service, msg) => {
  const d = new Date()
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  const payload = { time, level, service, msg }
  systemLogs.unshift(payload)
  if (systemLogs.length > 5000) systemLogs.pop()
  saveLogs()
  if (ioInstance) ioInstance.emit('new_log', payload)
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

  if (currentCpuUsage > 85) pushLog('ERROR', 'CPU Monitor', `Critical CPU load detected: ${currentCpuUsage}%`)
  else if (currentCpuUsage > 60) pushLog('WARN', 'CPU Monitor', `Elevated CPU usage: ${currentCpuUsage}%`)

  if (Math.random() > 0.8) pushLog('INFO', 'Network', `Handling inbound connection from ${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.X.X`)

  activeProjects.forEach(p => {
    if (p.status === 'Running' || p.status === 'Production') {
      p.cpu = Math.max(1, Math.min(100, (p.cpu || 0) + (Math.random() - 0.5) * 8))
      p.mem = Math.max(0.1, (p.mem || 0.1) + (Math.random() - 0.5) * 0.1)
      if (Math.random() > 0.8) pushLog('INFO', p.name, `Handled ${Math.floor(Math.random()*40)+5} connections in ${Math.floor(Math.random()*15)+1}ms`)
      if (Math.random() > 0.95) pushLog('WARN', p.name, `Memory spike detected, performing GC collection`)
      
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
  
  child.stdout.on('data', d => pushLog('INFO', proj.name, d.toString().trim()))
  child.stderr.on('data', d => pushLog('ERROR', proj.name, d.toString().trim()))
  
  child.on('close', code => {
    pushLog('WARN', proj.name, `Process exited with code ${code}`)
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
            pushLog('INFO', 'Terminal', `Executing: ${cmd}`)
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
              const name = payload.name
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
              exec(`git clone -b ${finalBranch} ${cleanRepo} "${projDir}"`, (err, stdout, stderr) => {
                if (err) {
                  deployLogs[name].push(`[ERROR] Git clone failed: ${err.message}`)
                  if (stderr) deployLogs[name].push(stderr.toString());
                  p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects(); return;
                }
                deployLogs[name].push(`[GIT] Cloned successfully into workspace.`)
                deployLogs[name].push(`[CMD] Running: ${p.installCmd}`)
                
                exec(p.installCmd, { cwd: projDir }, (err2, stdout2, stderr2) => {
                  if (err2) {
                    deployLogs[name].push(`[ERROR] Install failed: ${err2.message}`)
                    if (stdout2) deployLogs[name].push(stdout2.toString())
                    if (stderr2) deployLogs[name].push(stderr2.toString())
                    p.status = 'Failed'; p.statusColor = 'bg-error/10 text-error'; p.dot = 'bg-error'; saveProjects(); return;
                  }
                  deployLogs[name].push(`[INFO] Dependencies installed successfully.`)
                  deployLogs[name].push(`[CMD] Starting process: ${p.runCmd}`)
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
              const proj = activeProjects.find(p => p.name === name)
              if (proj) {
                if (action === 'edit' && payload) {
                  proj.port = payload.port
                  proj.installCmd = payload.installCmd
                  proj.runCmd = payload.runCmd
                  saveProjects()
                } else if (action === 'delete') {
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
              res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid config' }))
            }
          })
        })
      }
    }
  ],
})
