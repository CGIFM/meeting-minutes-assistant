import { useCallback, useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { RecordButton } from './RecordButton'
import { deleteMeeting, renameMeeting, saveMeetingState } from '../services/api'
import { toast } from '../services/toast'

interface SidebarProps {
  onFileDrop: (file: File) => void
}

export function Sidebar({ onFileDrop }: SidebarProps) {
  const { meetings, currentMeeting, setCurrentMeeting, setShowSettings, isTranscribing, updateMeeting } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const lastClickedIdx = useRef<number>(-1)
  const confirmTimer = useRef<number>(0)

  const handleFileSelect = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,video/mp4'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) onFileDrop(file)
    }
    input.click()
  }, [onFileDrop])

  // 多选模式下：Cmd/Ctrl+A 全选；Esc 退出
  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const filtered = filterMeetings()
        setSelected(new Set(filtered.map(m => m.id)))
      } else if (e.key === 'Escape') {
        exitSelectMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode, meetings, searchQuery])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
    setConfirmDelete(false)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
  }

  const filterMeetings = () => {
    return searchQuery
      ? meetings.filter(m => m.filename.toLowerCase().includes(searchQuery.toLowerCase()))
      : meetings
  }

  const toggleSelect = (id: string, idx: number, e: React.MouseEvent) => {
    const next = new Set(selected)
    if (e.shiftKey && lastClickedIdx.current >= 0 && lastClickedIdx.current !== idx) {
      const from = Math.min(lastClickedIdx.current, idx)
      const to = Math.max(lastClickedIdx.current, idx)
      const filtered = filterMeetings()
      filtered.slice(from, to + 1).forEach(m => next.add(m.id))
    } else {
      if (next.has(id)) next.delete(id)
      else next.add(id)
    }
    lastClickedIdx.current = idx
    setSelected(next)
  }

  const selectAll = () => {
    const filtered = filterMeetings()
    setSelected(new Set(filtered.map(m => m.id)))
  }

  const handleDelete = async () => {
    if (selected.size === 0) {
      toast('请先选择要删除的项', 'info')
      return
    }
    if (!confirmDelete) {
      setConfirmDelete(true)
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    const ids = Array.from(selected)
    try {
      await Promise.all(ids.map(id => deleteMeeting(id)))
      const wasCurrentSelected = currentMeeting && selected.has(currentMeeting.id)
      useAppStore.setState((s) => ({
        meetings: s.meetings.filter(m => !selected.has(m.id)),
        currentMeeting: wasCurrentSelected ? null : s.currentMeeting,
      }))
      toast(`已删除 ${ids.length} 条`, 'success')
      exitSelectMode()
    } catch (e: any) {
      toast(`删除失败: ${e.message}`, 'error')
    }
  }

  const startRename = (id: string, filename: string) => {
    setRenamingId(id)
    setRenameVal(filename.replace(/\.[^.]+$/, ''))
  }

  const commitRename = (id: string) => {
    const m = meetings.find(x => x.id === id)
    if (!m) { setRenamingId(null); return }
    const newName = renameVal.trim()
    if (!newName || newName + (m.filename.match(/\.[^.]+$/)?.[0] || '') === m.filename) {
      setRenamingId(null)
      return
    }
    renameMeeting(id, newName)
      .then((r: any) => {
        if (r.success) {
          updateMeeting(id, { filename: r.filename })
          toast('已重命名', 'success')
        } else {
          toast(r.message || '重命名失败', 'error')
        }
      })
      .catch((e: any) => toast(`重命名失败: ${e.message}`, 'error'))
    setRenamingId(null)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return ''
    const m = Math.floor(seconds / 60)
    return `${m}分钟`
  }

  const filtered = filterMeetings()
  const allSelected = filtered.length > 0 && filtered.every(m => selected.has(m.id))

  return (
    <aside style={{width:'220px',display:'flex',flexDirection:'column',height:'100%',background:'#0f0f12',borderRight:'1px solid rgba(255,255,255,0.05)',position:'relative',zIndex:10,flexShrink:0}}>
      {/* Drag Region + Title */}
      <div style={{padding:'20px 16px 14px',WebkitAppRegion:'drag'} as any}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',paddingLeft:'60px'}}>
          <div style={{width:'24px',height:'24px',borderRadius:'8px',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </div>
          <h1 style={{fontSize:'13px',fontWeight:600,color:'rgba(255,255,255,0.9)',margin:0}}>会议纪要</h1>
        </div>
      </div>

      {/* Import & Record Buttons（多选模式下隐藏，让位给管理工具条） */}
      {!selectMode && (
        <div style={{padding:'0 12px 12px'}}>
          <button
            onClick={handleFileSelect}
            disabled={isTranscribing}
            style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'10px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'10px',fontSize:'12px',color:'rgba(255,255,255,0.8)',cursor:isTranscribing?'not-allowed':'pointer',opacity:isTranscribing?0.4:1}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            导入音频
          </button>
        </div>
      )}
      {!selectMode && <RecordButton onRecordingComplete={onFileDrop} />}

      {/* 列表头部：标题 + 管理/全选按钮 */}
      <div style={{padding:'4px 8px 8px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:500}}>
          {selectMode ? `已选 ${selected.size}/${filtered.length}` : `历史记录 ${meetings.length > 0 ? `(${meetings.length})` : ''}`}
        </span>
        {meetings.length > 0 && (
          <button
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            style={{fontSize:'10px',color:selectMode?'#fca5a5':'rgba(255,255,255,0.4)',background:'transparent',border:'none',cursor:'pointer',padding:'2px 6px'}}
          >
            {selectMode ? '退出' : '管理'}
          </button>
        )}
      </div>

      {/* 搜索框（始终显示如果记录多） */}
      {meetings.length > 3 && (
        <div style={{padding:'0 8px 8px'}}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索会议..."
            style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'8px',padding:'6px 10px',fontSize:'11px',color:'rgba(255,255,255,0.8)',outline:'none'}}
          />
        </div>
      )}

      {/* Meeting List */}
      <div style={{flex:1,overflowY:'auto',padding:'0 8px'}}>
        {filtered.length === 0 ? (
          <div style={{padding:'32px 12px',textAlign:'center',color:'rgba(255,255,255,0.15)',fontSize:'11px',lineHeight:1.8}}>
            {searchQuery ? '未找到匹配' : '暂无记录'}<br/>{!searchQuery && '拖入音频开始'}
          </div>
        ) : (
          filtered.map((meeting, idx) => {
            const isSel = selected.has(meeting.id)
            const isCurrent = currentMeeting?.id === meeting.id
            const isRenaming = renamingId === meeting.id
            return (
              <div
                key={meeting.id}
                onClick={(e) => {
                  if (selectMode) {
                    e.stopPropagation()
                    toggleSelect(meeting.id, idx, e)
                  } else if (!isRenaming) {
                    setCurrentMeeting(meeting)
                  }
                }}
                onMouseEnter={(e) => {
                  if (!selectMode && !isRenaming) {
                    const btn = (e.currentTarget.querySelector('[data-rename]') as HTMLElement)
                    if (btn) btn.style.opacity = '1'
                  }
                }}
                onMouseLeave={(e) => {
                  const btn = (e.currentTarget.querySelector('[data-rename]') as HTMLElement)
                  if (btn) btn.style.opacity = '0'
                }}
                style={{
                  position:'relative',
                  display:'flex',alignItems:'flex-start',gap:'6px',
                  padding:'10px 12px',borderRadius:'8px',fontSize:'12px',cursor:'pointer',border:'none',marginBottom:'2px',
                  transition:'background 0.15s',
                  background: selectMode
                    ? (isSel ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)')
                    : (isCurrent ? 'rgba(255,255,255,0.08)' : 'transparent'),
                  color: selectMode
                    ? (isSel ? '#fca5a5' : 'rgba(255,255,255,0.5)')
                    : (isCurrent ? 'white' : 'rgba(255,255,255,0.5)'),
                  borderLeft: selectMode && isSel ? '3px solid #ef4444' : '3px solid transparent',
                }}
              >
                {/* 选择模式下显示圆形 checkbox */}
                {selectMode && (
                  <div style={{
                    flexShrink:0,width:'16px',height:'16px',borderRadius:'50%',
                    border: isSel ? '5px solid #ef4444' : '1.5px solid rgba(255,255,255,0.25)',
                    background: isSel ? 'transparent' : 'transparent',
                    marginTop:'2px',transition:'all 0.15s',
                  }} />
                )}

                <div style={{flex:1,minWidth:0}}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => commitRename(meeting.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(meeting.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      style={{width:'100%',boxSizing:'border-box',fontSize:'11px',background:'rgba(96,165,250,0.1)',border:'1px solid rgba(96,165,250,0.5)',borderRadius:'4px',padding:'3px 6px',color:'#fff',outline:'none'}}
                    />
                  ) : (
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{opacity:0.6,flexShrink:0}}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'11px',flex:1}}>{meeting.filename}</span>
                      </div>
                      <div style={{fontSize:'10px',opacity:0.4,marginTop:'3px',marginLeft:'18px'}}>
                        {formatDate(meeting.created_at)}
                        {meeting.duration > 0 && ` · ${formatDuration(meeting.duration)}`}
                      </div>
                    </>
                  )}
                </div>

                {/* 重命名按钮（hover 显示） */}
                {!selectMode && !isRenaming && (
                  <button
                    data-rename="1"
                    onClick={(e) => { e.stopPropagation(); startRename(meeting.id, meeting.filename) }}
                    title="重命名"
                    style={{
                      opacity:0,flexShrink:0,padding:'2px',background:'rgba(255,255,255,0.06)',
                      border:'1px solid rgba(255,255,255,0.08)',borderRadius:'4px',cursor:'pointer',
                      color:'rgba(255,255,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center',
                      transition:'opacity 0.15s',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 多选模式下的底部操作栏 */}
      {selectMode && (
        <div style={{padding:'10px 12px',borderTop:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.04)'}}>
          <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
            <button
              onClick={selectAll}
              style={{flex:1,padding:'6px',fontSize:'10px',color:'rgba(255,255,255,0.7)',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',cursor:'pointer'}}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
            <button
              onClick={handleDelete}
              style={{flex:1,padding:'6px',fontSize:'10px',fontWeight:600,color:'#fff',
                background: confirmDelete ? '#ef4444' : (selected.size > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.04)'),
                border: confirmDelete ? '1px solid #ef4444' : '1px solid rgba(239,68,68,0.3)',
                borderRadius:'6px',cursor:selected.size > 0 ? 'pointer' : 'not-allowed',
                opacity: selected.size > 0 ? 1 : 0.5,
                transition:'all 0.15s',
              }}
            >
              {confirmDelete ? `确认删除 ${selected.size}` : (selected.size > 0 ? `删除 (${selected.size})` : '删除')}
            </button>
          </div>
          <p style={{fontSize:'9px',color:'rgba(255,255,255,0.3)',margin:'6px 0 0'}}>
            Cmd/ Ctrl+A 全选 · Shift+点击 多选 · Esc 退出
          </p>
        </div>
      )}

      {/* Settings */}
      {!selectMode && (
        <div style={{padding:'12px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
          <button
            onClick={() => setShowSettings(true)}
            style={{width:'100%',display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',borderRadius:'8px',border:'none',background:'transparent',color:'rgba(255,255,255,0.35)',fontSize:'11px',cursor:'pointer'}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
            设置
          </button>
        </div>
      )}
    </aside>
  )
}
