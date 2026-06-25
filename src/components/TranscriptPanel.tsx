import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'

interface TranscriptPanelProps {
  audioUrl?: string
}

export function TranscriptPanel({ audioUrl }: TranscriptPanelProps) {
  const { currentMeeting, updateMeeting } = useAppStore()
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [activeSegment, setActiveSegment] = useState<number>(-1)
  const [hoverSegment, setHoverSegment] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const updateTime = () => { if (!dragging) setCurrentTime(audio.currentTime) }
    const onLoaded = () => setDuration(audio.duration || 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('durationchange', onLoaded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('durationchange', onLoaded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [audioUrl, dragging])

  // 当前播放片段 + 自动滚动
  useEffect(() => {
    if (!currentMeeting?.segments.length || !audioUrl) { setActiveSegment(-1); return }
    const idx = currentMeeting.segments.findIndex(
      (s, i) => s.start <= currentTime && (i === currentMeeting.segments.length - 1 || currentMeeting.segments[i + 1].start > currentTime)
    )
    if (idx !== activeSegment && idx >= 0) {
      setActiveSegment(idx)
      const el = segmentRefs.current[idx]
      if (el && isPlaying) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentTime, currentMeeting, audioUrl, activeSegment, isPlaying])

  if (!currentMeeting) return null

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const speakerStyles: Record<string, {bg: string; text: string}> = {}
  const palette = [
    {bg: '#3b82f6', text: '#fff'},
    {bg: '#10b981', text: '#fff'},
    {bg: '#a855f7', text: '#fff'},
    {bg: '#f59e0b', text: '#fff'},
    {bg: '#ef4444', text: '#fff'},
    {bg: '#06b6d4', text: '#fff'},
  ]
  let colorIdx = 0
  const getSpeakerStyle = (speaker: string) => {
    if (!speakerStyles[speaker]) {
      speakerStyles[speaker] = palette[colorIdx % palette.length]
      colorIdx++
    }
    return speakerStyles[speaker]
  }

  const uniqueSpeakers = [...new Set(currentMeeting.segments.map(s => s.speaker))]

  const handleRenameSpeaker = (oldName: string) => {
    if (!newName.trim() || newName === oldName) { setEditingSpeaker(null); return }
    const updatedSegments = currentMeeting.segments.map(seg =>
      seg.speaker === oldName ? { ...seg, speaker: newName.trim() } : seg
    )
    const updatedTranscript = updatedSegments.map(seg => `[${formatTime(seg.start)}] ${seg.speaker}: ${seg.text}`).join('\n')
    updateMeeting(currentMeeting.id, { segments: updatedSegments, transcript: updatedTranscript })
    setEditingSpeaker(null); setNewName('')
  }

  const handleCopyTranscript = () => {
    const text = currentMeeting.segments.map(seg => `[${formatTime(seg.start)}] ${seg.speaker}: ${seg.text}`).join('\n')
    navigator.clipboard.writeText(text)
  }

  const handleExportTranscript = () => {
    const header = `# ${currentMeeting.filename} - 转录记录\n\n> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`
    const body = currentMeeting.segments.map(seg => `**[${formatTime(seg.start)}] ${seg.speaker}:** ${seg.text}`).join('\n\n')
    const content = header + body + '\n'
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentMeeting.filename.replace(/\.[^.]+$/, '')}_转录.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const seekTo = useCallback((ratio: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration
    setCurrentTime(audio.currentTime)
  }, [])

  const handleJumpToTime = (time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
    audio.play().catch(() => {})
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  // 进度条点击/拖动（用 document 监听，避免 pointer capture 锁定全局事件）
  const getRatio = (clientX: number) => {
    const el = progressRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onProgressDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const ratio = getRatio(e.clientX)
    seekTo(ratio)
    setDragging(true)

    const onMove = (ev: PointerEvent) => {
      const r = getRatio(ev.clientX)
      setCurrentTime(r * (duration || 0))
      seekTo(r)
    }
    const onUp = () => {
      setDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const playhead = duration > 0 ? currentTime / duration : 0

  const SpeakerChip = ({ speaker, size = 'small' }: { speaker: string; size?: 'small' | 'big' }) => {
    const style = getSpeakerStyle(speaker)
    const big = size === 'big'
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditingSpeaker(speaker); setNewName(speaker) }}
        style={{
          display:'inline-flex',alignItems:'center',gap:'4px',
          background: style.bg, color: style.text,
          fontSize: big ? '11px' : '10px', fontWeight: 600,
          padding: big ? '4px 10px' : '2px 8px',
          borderRadius: '99px', cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
        }}
        title="点击重命名"
      >
        {speaker}<span style={{opacity:0.6,fontSize:'0.85em'}}>✎</span>
      </span>
    )
  }

  return (
    <div style={{width:'50%',borderRight:'1px solid rgba(255,255,255,0.06)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Audio Player */}
      {audioUrl && (
        <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.25)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <button onClick={togglePlay} style={{width:'34px',height:'34px',borderRadius:'50%',background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:'4px'}}>
              <div
                ref={progressRef}
                onPointerDown={onProgressDown}
                style={{height:'6px',background:'rgba(255,255,255,0.12)',borderRadius:'3px',cursor:'pointer',position:'relative',touchAction:'none'}}
              >
                <div style={{height:'100%',background:'linear-gradient(90deg,#3b82f6,#8b5cf6)',borderRadius:'3px',width:`${playhead*100}%`,pointerEvents:'none'}} />
                <div style={{position:'absolute',top:'50%',left:`${playhead*100}%`,width:'14px',height:'14px',borderRadius:'50%',background:'#fff',transform:'translate(-50%,-50%)',boxShadow:'0 2px 6px rgba(0,0,0,0.4)',pointerEvents:'none'}} />
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'9px',color:'rgba(255,255,255,0.4)',fontFamily:'monospace'}}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
          <audio ref={audioRef} src={audioUrl} preload="none" style={{display:'none',pointerEvents:'none'}} />
        </div>
      )}

      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{minWidth:0,flex:1}}>
          <h2 style={{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>转录结果</h2>
          <p style={{fontSize:'11px',color:'rgba(255,255,255,0.25)',margin:'4px 0 0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentMeeting.filename}</p>
        </div>
        <div style={{display:'flex',gap:'4px',flexShrink:0}}>
          <button onClick={handleExportTranscript} title="导出为 Markdown 文件" style={{fontSize:'10px',color:'#a78bfa',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.25)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>导出 MD</button>
          <button onClick={handleCopyTranscript} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>复制</button>
        </div>
      </div>

      {/* Speaker Tags */}
      {uniqueSpeakers.length > 0 && (
        <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',background:'rgba(0,0,0,0.15)'}}>
          <span style={{fontSize:'10px',color:'rgba(255,255,255,0.4)'}}>说话人 ({uniqueSpeakers.length})：</span>
          {uniqueSpeakers.map(speaker => (
            <div key={speaker}>
              {editingSpeaker === speaker ? (
                <input autoFocus value={newName} onChange={(e)=>setNewName(e.target.value)} onBlur={()=>handleRenameSpeaker(speaker)} onKeyDown={(e)=>e.key==='Enter'&&handleRenameSpeaker(speaker)} style={{fontSize:'11px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(96,165,250,0.5)',borderRadius:'6px',padding:'4px 8px',color:'#fff',width:'100px',outline:'none'}} />
              ) : (
                <SpeakerChip speaker={speaker} size="big" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transcript List */}
      <div style={{flex:1,overflowY:'auto',padding:'8px 12px'}}>
        {currentMeeting.segments.length > 0 ? (
          currentMeeting.segments.map((seg, i) => {
            const isActive = activeSegment === i
            const isHover = hoverSegment === i
            return (
              <div
                key={i}
                ref={(el) => { segmentRefs.current[i] = el }}
                onClick={() => handleJumpToTime(seg.start)}
                onMouseEnter={() => setHoverSegment(i)}
                onMouseLeave={() => setHoverSegment(-1)}
                style={{
                  display:'flex',gap:'8px',marginBottom:'4px',padding:'8px 10px',borderRadius:'8px',cursor:'pointer',
                  background: isActive ? 'rgba(249,115,22,0.15)' : (isHover ? 'rgba(249,115,22,0.08)' : 'transparent'),
                  borderLeft: isActive ? '3px solid #f97316' : (isHover ? '3px solid rgba(249,115,22,0.4)' : '3px solid transparent'),
                  transition:'background 0.15s, border-color 0.15s',
                }}
              >
                {/* 时间戳 + 播放按钮（可点击） */}
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',flexShrink:0,width:'32px'}}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleJumpToTime(seg.start) }}
                    title={`跳转到 ${formatTime(seg.start)}`}
                    style={{width:'22px',height:'22px',borderRadius:'50%',background:isActive?'rgba(249,115,22,0.3)':'rgba(96,165,250,0.2)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill={isActive?'#fb923c':'#93c5fd'}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <span style={{color:isActive?'#fb923c':(isHover?'rgba(249,115,22,0.7)':'rgba(255,255,255,0.3)'),fontSize:'9px',fontFamily:'monospace'}}>
                    {formatTime(seg.start)}
                  </span>
                </div>
                {/* 文字 */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{marginBottom:'4px'}}><SpeakerChip speaker={seg.speaker} /></div>
                  <p style={{color:isActive?'rgba(255,255,255,0.95)':(isHover?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.7)'),fontSize:'13px',margin:0,lineHeight:1.6}}>{seg.text}</p>
                </div>
              </div>
            )
          })
        ) : currentMeeting.transcript ? (
          <pre style={{fontSize:'13px',color:'rgba(255,255,255,0.7)',whiteSpace:'pre-wrap',lineHeight:1.6,margin:0}}>{currentMeeting.transcript}</pre>
        ) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
            <div style={{textAlign:'center'}}>
              <div style={{width:'32px',height:'32px',border:'2px solid rgba(255,255,255,0.1)',borderTop:'2px solid #60a5fa',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 12px'}} />
              <p style={{color:'rgba(255,255,255,0.3)',fontSize:'13px',margin:0}}>正在转录...</p>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
