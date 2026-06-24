import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { RecordButton } from './RecordButton'

interface SidebarProps {
  onFileDrop: (file: File) => void
}

export function Sidebar({ onFileDrop }: SidebarProps) {
  const { meetings, currentMeeting, setCurrentMeeting, setShowSettings, isTranscribing } = useAppStore()

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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return ''
    const m = Math.floor(seconds / 60)
    return `${m}分钟`
  }

  return (
    <aside style={{width:'220px',display:'flex',flexDirection:'column',height:'100%',background:'#0f0f12',borderRight:'1px solid rgba(255,255,255,0.05)'}}>
      {/* Drag Region + Title */}
      <div style={{padding:'20px 16px 14px',WebkitAppRegion:'drag'} as any}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',paddingLeft:'60px'}}>
          <div style={{width:'24px',height:'24px',borderRadius:'8px',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </div>
          <h1 style={{fontSize:'13px',fontWeight:600,color:'rgba(255,255,255,0.9)',margin:0}}>会议纪要</h1>
        </div>
      </div>

      {/* Import & Record Buttons */}
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
      <RecordButton onRecordingComplete={onFileDrop} />

      {/* Meeting List */}
      <div style={{flex:1,overflowY:'auto',padding:'0 8px'}}>
        <div style={{padding:'4px 8px 8px',fontSize:'10px',color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:500}}>
          历史记录
        </div>
        {meetings.length === 0 ? (
          <div style={{padding:'32px 12px',textAlign:'center',color:'rgba(255,255,255,0.15)',fontSize:'11px',lineHeight:1.8}}>
            暂无记录<br/>拖入音频开始
          </div>
        ) : (
          meetings.map(meeting => (
            <button
              key={meeting.id}
              onClick={() => setCurrentMeeting(meeting)}
              style={{width:'100%',textAlign:'left',padding:'10px 12px',borderRadius:'8px',fontSize:'12px',cursor:'pointer',border:'none',marginBottom:'2px',transition:'background 0.15s',
                background: currentMeeting?.id === meeting.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: currentMeeting?.id === meeting.id ? 'white' : 'rgba(255,255,255,0.5)',
              }}
            >
              <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{opacity:0.6,flexShrink:0}}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'11px'}}>{meeting.filename}</span>
              </div>
              <div style={{fontSize:'10px',opacity:0.4,marginTop:'3px',marginLeft:'18px'}}>
                {formatDate(meeting.created_at)}
                {meeting.duration > 0 && ` · ${formatDuration(meeting.duration)}`}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Settings */}
      <div style={{padding:'12px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
        <button
          onClick={() => setShowSettings(true)}
          style={{width:'100%',display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',borderRadius:'8px',border:'none',background:'transparent',color:'rgba(255,255,255,0.35)',fontSize:'11px',cursor:'pointer'}}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
          设置
        </button>
      </div>
    </aside>
  )
}
