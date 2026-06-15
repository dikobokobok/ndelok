import { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import Toast from '../components/Toast'
import { AuthContext } from '../App'

// ── helpers ──────────────────────────────────────────────────────────────────
const EXT_LANG = {
  js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
  json:'json', md:'markdown', css:'css', html:'html', py:'python',
  sh:'shell', bash:'shell', yml:'yaml', yaml:'yaml', env:'shell',
  txt:'plaintext', sql:'sql', rs:'rust', go:'go', java:'java',
  php:'php', rb:'ruby', c:'c', cpp:'cpp', cs:'csharp', kt:'kotlin',
  swift:'swift', vue:'html', svelte:'html', toml:'ini', ini:'ini',
}

const getLanguage = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase()
  return EXT_LANG[ext] || 'plaintext'
}

const formatSize = (bytes) => {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
}

const FILE_ICON = {
  js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
  json:'data_object', md:'description', css:'css', html:'html',
  py:'code', sh:'terminal', bash:'terminal', yml:'settings', yaml:'settings',
  env:'key', txt:'article', sql:'storage', png:'image', jpg:'image',
  jpeg:'image', gif:'image', svg:'image', mp4:'movie', mp3:'audio_file',
  zip:'folder_zip', tar:'folder_zip', gz:'folder_zip',
}

const getFileIcon = (name, type) => {
  if (type === 'folder') return { icon: 'folder', color: 'text-amber-400' }
  const ext = name?.split('.').pop()?.toLowerCase()
  const icon = FILE_ICON[ext] || 'description'
  const colorMap = {
    javascript:'text-yellow-400', typescript:'text-blue-400', json:'text-orange-400',
    description:'text-slate-400', css:'text-cyan-400', html:'text-orange-500',
    code:'text-green-400', terminal:'text-emerald-400', settings:'text-purple-400',
    key:'text-yellow-300', article:'text-slate-300', storage:'text-blue-300',
    image:'text-pink-400', movie:'text-red-400', audio_file:'text-purple-400',
    folder_zip:'text-amber-500', data_object:'text-orange-400',
  }
  return { icon, color: colorMap[icon] || 'text-slate-400' }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FileManager() {
  const { project } = useParams()
  const navigate = useNavigate()
  const { authenticatedFetch, token, user } = useContext(AuthContext)

  const [entries, setEntries] = useState([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  // Editor state
  const [openFile, setOpenFile] = useState(null) // { path, name, content, modified }
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Modal states
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [newItemModal, setNewItemModal] = useState(null) // 'file' | 'folder'
  const [newItemName, setNewItemName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, entry }

  const uploadRef = useRef(null)

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000) }

  const isRootMode = project === '__root__'
  const separator = currentPath && currentPath.includes('\\') ? '\\' : '/'

  // Redirect non-owners away from root files
  useEffect(() => {
    if (isRootMode && user && user.role !== 'owner') {
      navigate('/dashboard')
    }
  }, [isRootMode, user, navigate])

  const joinPaths = (base, sub) => {
    if (!base) return sub
    if (base.endsWith('/') || base.endsWith('\\')) return base + sub
    return base + separator + sub
  }

  const getParentPath = (pathStr) => {
    if (!pathStr) return ''
    const parts = pathStr.split(/[/\\]/).filter(Boolean)
    if (parts.length <= 1) {
      if (pathStr.match(/^[a-zA-Z]:/)) {
        return parts[0] + separator // "C:\"
      }
      return separator // "/"
    }
    parts.pop()
    let parent = parts.join(separator)
    if (pathStr.startsWith('\\\\')) parent = '\\\\' + parent
    else if (pathStr.startsWith('/')) parent = '/' + parent
    if (parent.match(/^[a-zA-Z]:$/)) parent += separator
    return parent
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  const loadDir = useCallback(async (p = '') => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/files/list?project=${encodeURIComponent(project)}&path=${encodeURIComponent(p)}`)
      if (!res?.ok) throw new Error('Failed to load directory')
      const data = await res.json()
      setEntries(data.entries)
      setCurrentPath(data.path)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setLoading(false)
    }
  }, [project, authenticatedFetch])

  useEffect(() => { loadDir('') }, [loadDir])

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const openFileForEdit = async (entry) => {
    if (isDirty && openFile) {
      if (!window.confirm('You have unsaved changes. Discard?')) return
    }
    try {
      const filePath = joinPaths(currentPath, entry.name)
      const res = await authenticatedFetch(`/api/files/read?project=${encodeURIComponent(project)}&path=${encodeURIComponent(filePath)}`)
      if (!res?.ok) { showToast('error', 'Cannot read file'); return }
      const data = await res.json()
      setOpenFile({ path: filePath, name: entry.name, modified: data.modified })
      setEditorContent(data.content)
      setIsDirty(false)
    } catch (e) {
      showToast('error', e.message)
    }
  }

  const saveFile = async () => {
    if (!openFile) return
    setSaving(true)
    try {
      const res = await authenticatedFetch('/api/files/write', {
        method: 'POST',
        body: JSON.stringify({ project, path: openFile.path, content: editorContent })
      })
      if (!res?.ok) throw new Error('Save failed')
      setIsDirty(false)
      showToast('success', `${openFile.name} saved.`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const navigateInto = (entry) => {
    const newPath = joinPaths(currentPath, entry.name)
    loadDir(newPath)
  }

  const navigateBreadcrumb = (idx) => {
    const parts = currentPath.split(/[/\\]/).filter(Boolean)
    let newPath = parts.slice(0, idx + 1).join(separator)
    if (currentPath.startsWith('\\\\')) {
      newPath = '\\\\' + newPath
    } else if (currentPath.match(/^[a-zA-Z]:/)) {
      if (idx === 0) newPath += separator
    } else if (currentPath.startsWith('/')) {
      newPath = '/' + newPath
    }
    loadDir(newPath)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const filePath = joinPaths(currentPath, deleteTarget.name)
    try {
      const res = await authenticatedFetch('/api/files/delete', {
        method: 'POST',
        body: JSON.stringify({ project, path: filePath })
      })
      if (!res?.ok) throw new Error('Delete failed')
      showToast('warn', `${deleteTarget.name} deleted.`)
      if (openFile?.path === filePath) { setOpenFile(null); setEditorContent('') }
      loadDir(currentPath)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return
    const oldPath = joinPaths(currentPath, renameTarget.name)
    const newPath = joinPaths(currentPath, renameValue.trim())
    try {
      const res = await authenticatedFetch('/api/files/rename', {
        method: 'POST',
        body: JSON.stringify({ project, oldPath, newPath })
      })
      if (!res?.ok) throw new Error('Rename failed')
      showToast('success', 'Renamed successfully.')
      loadDir(currentPath)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setRenameTarget(null); setRenameValue('')
    }
  }

  const handleNewItem = async () => {
    if (!newItemName.trim()) return
    const itemPath = joinPaths(currentPath, newItemName.trim())
    try {
      if (newItemModal === 'folder') {
        const res = await authenticatedFetch('/api/files/mkdir', {
          method: 'POST',
          body: JSON.stringify({ project, path: itemPath })
        })
        if (!res?.ok) throw new Error('Failed to create folder')
        showToast('success', 'Folder created.')
      } else {
        const res = await authenticatedFetch('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ project, path: itemPath, content: '' })
        })
        if (!res?.ok) throw new Error('Failed to create file')
        showToast('success', 'File created.')
      }
      loadDir(currentPath)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setNewItemModal(null); setNewItemName('')
    }
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const fd = new FormData()
    fd.append('project', project)
    fd.append('path', currentPath)
    files.forEach(f => fd.append('files', f))
    try {
      const res = await authenticatedFetch('/api/files/upload', { method: 'POST', body: fd })
      if (!res?.ok) throw new Error('Upload failed')
      showToast('success', `${files.length} file(s) uploaded.`)
      loadDir(currentPath)
    } catch (e) {
      showToast('error', e.message)
    }
    e.target.value = ''
  }

  const triggerBlobDownload = (blob, filename) => {
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.setAttribute('download', filename)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }

  const handleDownload = (entry) => {
    const filePath = joinPaths(currentPath, entry.name)
    const url = `/api/files/download?project=${encodeURIComponent(project)}&path=${encodeURIComponent(filePath)}`
    authenticatedFetch(url)
      .then(r => r.blob())
      .then(blob => triggerBlobDownload(blob, entry.name))
      .catch(() => showToast('error', 'Download failed'))
  }

  const handleDownloadFolder = (entry) => {
    const folderPath = joinPaths(currentPath, entry.name)
    const url = `/api/files/download-folder?project=${encodeURIComponent(project)}&path=${encodeURIComponent(folderPath)}`
    showToast('success', `Zipping "${entry.name}"... download will start shortly.`)
    authenticatedFetch(url)
      .then(r => r.blob())
      .then(blob => triggerBlobDownload(blob, `${entry.name}.zip`))
      .catch(() => showToast('error', 'Folder download failed'))
  }

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (openFile && isDirty) saveFile() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openFile, isDirty, editorContent])

  // ── Breadcrumb parts ───────────────────────────────────────────────────────
  const breadcrumbs = currentPath ? currentPath.split(/[/\\]/).filter(Boolean) : []

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden animate-in fade-in duration-300">
      {/* Top Bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-white/5 bg-surface-container-low shrink-0 overflow-x-auto">
        <button onClick={() => navigate('/projects')} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs font-bold flex-shrink-0">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span className="hidden sm:inline">Projects</span>
        </button>
        <span className="text-white/10">/</span>
        <span className="material-symbols-outlined text-[16px] text-amber-400" style={{ fontVariationSettings:"'FILL' 1" }}>folder_open</span>
        <span className="text-sm font-black text-white">{isRootMode ? 'System Root' : project}</span>
        {isRootMode && (
          <span className="px-2 py-0.5 text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded uppercase tracking-wider">
            Root Access
          </span>
        )}
        <span className="text-white/10">/</span>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-slate-400 flex-1 min-w-0">
          <button onClick={() => loadDir('')} className="hover:text-white transition-colors font-medium">{isRootMode ? 'root' : 'root'}</button>
          {breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-white/20">/</span>
              <button onClick={() => navigateBreadcrumb(i)} className="hover:text-white transition-colors font-medium truncate max-w-[120px]">{part}</button>
            </span>
          ))}
        </div>
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => loadDir(currentPath)} title="Refresh" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
          <button onClick={() => { setNewItemModal('file'); setNewItemName('') }} title="New File" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">
            <span className="material-symbols-outlined text-[16px]">note_add</span>
          </button>
          <button onClick={() => { setNewItemModal('folder'); setNewItemName('') }} title="New Folder" className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
            <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
          </button>
          <button onClick={() => uploadRef.current?.click()} title="Upload Files" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all">
            <span className="material-symbols-outlined text-[16px]">upload</span>
          </button>
          <button onClick={() => {
            const folderPath = currentPath || ''
            const url = `/api/files/download-folder?project=${encodeURIComponent(project)}&path=${encodeURIComponent(folderPath)}`
            showToast('success', `Zipping current folder...`)
            authenticatedFetch(url).then(r => r.blob()).then(blob => {
              const name = currentPath ? currentPath.split(/[/\\]/).pop() : (isRootMode ? 'root' : project)
              triggerBlobDownload(blob, `${name}.zip`)
            }).catch(() => showToast('error', 'Download failed'))
          }} title="Download current folder as ZIP" className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all">
            <span className="material-symbols-outlined text-[16px]">folder_zip</span>
          </button>
          <input ref={uploadRef} type="file" multiple className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File List Panel */}
        <div className={`flex flex-col border-r border-white/5 bg-[#080d1a] overflow-hidden transition-all duration-300 ${openFile ? 'hidden md:flex md:w-72 md:shrink-0' : 'flex-1'}`}>
          {/* Column Headers */}
          <div className="grid grid-cols-[1fr_80px_140px_80px] gap-2 px-4 py-2 border-b border-white/5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
            <span>Name</span>
            <span className="text-right">Size</span>
            <span>Modified</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Entries */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-32 gap-2 text-slate-500 text-xs">
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Loading...
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-600">
                <span className="material-symbols-outlined text-3xl">folder_open</span>
                <span className="text-xs">Empty directory</span>
              </div>
            ) : (
              <>
                {/* Back button */}
                {currentPath && (
                  <button onClick={() => {
                    const parent = getParentPath(currentPath)
                    loadDir(parent)
                  }} className="w-full grid grid-cols-[1fr_80px_140px_80px] gap-2 px-4 py-2.5 hover:bg-white/5 transition-colors text-left group">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="material-symbols-outlined text-[16px] text-slate-500">arrow_upward</span>
                      <span className="text-xs text-slate-500 font-medium">..</span>
                    </div>
                    <span /><span /><span />
                  </button>
                )}
                {entries.map((entry) => {
                  const { icon, color } = getFileIcon(entry.name, entry.type)
                  const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name
                  const isActive = openFile?.path === filePath
                  return (
                    <div
                      key={entry.name}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, entry }) }}
                      className={`grid grid-cols-[1fr_80px_140px_80px] gap-2 px-4 py-2 transition-colors group cursor-pointer ${isActive ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-white/5 border-l-2 border-transparent'}`}
                      onClick={() => entry.type === 'folder' ? navigateInto(entry) : openFileForEdit(entry)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`material-symbols-outlined text-[16px] shrink-0 ${color}`} style={{ fontVariationSettings: entry.type === 'folder' ? "'FILL' 1" : "'FILL' 0" }}>{icon}</span>
                        <span className={`text-xs truncate font-medium ${isActive ? 'text-primary' : 'text-slate-200 group-hover:text-white'}`}>{entry.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 text-right self-center">{formatSize(entry.size)}</span>
                      <span className="text-[10px] text-slate-600 self-center truncate">{formatDate(entry.modified)}</span>
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {entry.type === 'file' && (
                          <button onClick={(e) => { e.stopPropagation(); handleDownload(entry) }} title="Download" className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[13px]">download</span>
                          </button>
                        )}
                        {entry.type === 'folder' && (
                          <button onClick={(e) => { e.stopPropagation(); handleDownloadFolder(entry) }} title="Download as ZIP" className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors">
                            <span className="material-symbols-outlined text-[13px]">folder_zip</span>
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setRenameTarget(entry); setRenameValue(entry.name) }} title="Rename" className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-colors">
                          <span className="material-symbols-outlined text-[13px]">edit</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry) }} title="Delete" className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-colors">
                          <span className="material-symbols-outlined text-[13px]">delete</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Status bar */}
          <div className="px-4 py-1.5 border-t border-white/5 text-[9px] text-slate-600 font-mono flex items-center justify-between">
            <span>{entries.length} items</span>
            <span>{currentPath || '/'}</span>
          </div>
        </div>

        {/* Editor Panel */}
        {openFile && (
          <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200">
            {/* Editor Top Bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-[#0a0f1d] shrink-0">
              <button onClick={() => {
                  if (isDirty && !window.confirm('Discard unsaved changes?')) return
                  setOpenFile(null); setEditorContent(''); setIsDirty(false)
                }} className="md:hidden p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all -ml-2">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              </button>
              <span className="hidden md:inline-flex material-symbols-outlined text-[14px] text-slate-400">code</span>
              <span className="text-xs font-bold text-slate-200 flex-1 truncate">{openFile.path}</span>
              {isDirty && <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Unsaved</span>}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-600 font-mono">{getLanguage(openFile.name)}</span>
                <div className="w-[1px] h-3 bg-white/10 mx-1" />
                <button onClick={saveFile} disabled={saving || !isDirty}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 disabled:pointer-events-none">
                  {saving ? <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-[13px]">save</span>}
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => {
                  if (isDirty && !window.confirm('Discard unsaved changes?')) return
                  setOpenFile(null); setEditorContent(''); setIsDirty(false)
                }} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language={getLanguage(openFile.name)}
                value={editorContent}
                onChange={(val) => { setEditorContent(val || ''); setIsDirty(true) }}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  bracketPairColorization: { enabled: true },
                  padding: { top: 12, bottom: 12 },
                  tabSize: 2,
                }}
              />
            </div>

            {/* Editor Status Bar */}
            <div className="flex items-center gap-4 px-4 py-1 border-t border-white/5 bg-[#0a0f1d] text-[9px] text-slate-600 font-mono shrink-0">
              <span>{openFile.name}</span>
              <span>·</span>
              <span>{getLanguage(openFile.name)}</span>
              <span>·</span>
              <span>Modified: {formatDate(openFile.modified)}</span>
              <span className="ml-auto">Ctrl+S to save</span>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-surface-container-low border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] animate-in fade-in duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.entry.type === 'file' && (
            <button onClick={() => { openFileForEdit(contextMenu.entry); setContextMenu(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[14px] text-primary">edit_document</span> Open in Editor
            </button>
          )}
          {contextMenu.entry.type === 'folder' && (
            <button onClick={() => { navigateInto(contextMenu.entry); setContextMenu(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[14px] text-amber-400">folder_open</span> Open Folder
            </button>
          )}
          {contextMenu.entry.type === 'file' && (
            <button onClick={() => { handleDownload(contextMenu.entry); setContextMenu(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[14px] text-cyan-400">download</span> Download
            </button>
          )}
          {contextMenu.entry.type === 'folder' && (
            <button onClick={() => { handleDownloadFolder(contextMenu.entry); setContextMenu(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[14px] text-cyan-400">folder_zip</span> Download as ZIP
            </button>
          )}
          <div className="my-1 border-t border-white/5" />
          <button onClick={() => { setRenameTarget(contextMenu.entry); setRenameValue(contextMenu.entry.name); setContextMenu(null) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[14px] text-amber-400">drive_file_rename_outline</span> Rename
          </button>
          <button onClick={() => { setDeleteTarget(contextMenu.entry); setContextMenu(null) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors">
            <span className="material-symbols-outlined text-[14px]">delete</span> Delete
          </button>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRenameTarget(null)}>
          <div className="bg-surface-container-low border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black text-white mb-1">Rename</h3>
            <p className="text-[11px] text-slate-400 mb-4">Renaming: <span className="text-white font-bold">{renameTarget.name}</span></p>
            <input autoFocus type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null) }}
              className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-white p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRenameTarget(null)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleRename} className="px-4 py-2 text-xs font-black bg-white text-black rounded-xl hover:bg-primary hover:text-white transition-all">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* New File/Folder Modal */}
      {newItemModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setNewItemModal(null)}>
          <div className="bg-surface-container-low border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`material-symbols-outlined text-xl ${newItemModal === 'folder' ? 'text-amber-400' : 'text-emerald-400'}`} style={{ fontVariationSettings:"'FILL' 1" }}>
                {newItemModal === 'folder' ? 'create_new_folder' : 'note_add'}
              </span>
              <h3 className="text-base font-black text-white">New {newItemModal === 'folder' ? 'Folder' : 'File'}</h3>
            </div>
            <input autoFocus type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)}
              placeholder={newItemModal === 'folder' ? 'folder-name' : 'filename.js'}
              onKeyDown={e => { if (e.key === 'Enter') handleNewItem(); if (e.key === 'Escape') setNewItemModal(null) }}
              className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl text-white p-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none mb-4 placeholder:text-slate-600" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewItemModal(null)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleNewItem} className="px-4 py-2 text-xs font-black bg-white text-black rounded-xl hover:bg-primary hover:text-white transition-all">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-surface-container-low border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-rose-400">delete_forever</span>
              </div>
              <div>
                <h3 className="text-base font-black text-white">Delete {deleteTarget.type === 'folder' ? 'Folder' : 'File'}</h3>
                <p className="text-[11px] text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-rose-300 font-mono break-all">{deleteTarget.name}</p>
              {deleteTarget.type === 'folder' && <p className="text-[10px] text-rose-400/70 mt-1">All contents will be permanently deleted.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-xs font-black bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
