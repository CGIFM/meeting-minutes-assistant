import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'

interface TranscriptPanelProps {
  audioUrl?: string
}

export function TranscriptPanel({ audioUrl }: TranscriptPanelProps) {
  const { currentMeeting, updateMeeting } = useAppStore()
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [activeSegment, setActiveSegment] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const updateTime = () => setCurrentTime(audio.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [audioUrl])

  // 当前播放片段 + 自动滚动
  useEffect(() => {
    if (!currentMeeting?.segments.length || !audioUrl) {
      setActiveSegment(-1)
      return
    }
    const idx = currentMeeting.segments.findIndex(
      (s, i) => s.start <= currentTime && (i === currentMeeting.segments.length - 1 || currentMeeting.segments[i + 1].start > currentTime)
    )
    if (idx !== activeSegment && idx >= 0) {
      setActiveSegment(idx)
      // 自动滚动到当前片段
      const el = segmentRefs.current[idx]
      if (el && isPlaying) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [currentTime, currentMeeting, audioUrl, activeSegment, isPlaying])

  if (!currentMeeting) return null

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const speakerStyles: Record<string, {bg: string; text: string}> = {}
  const palette = [
    {bg: '#3b82f6', text: '#fff'},   // 蓝
    {bg: '#10b981', text: '#fff'},   // 绿
    {bg: '#a855f7', text: '#fff'},   // 紫
    {bg: '#f59e0b', text: '#fff'},   // 橙
    {bg: '#ef4444', text: '#fff'},   // 红
    {bg: '#06b6d4', text: '#fff'},   // 青
  ]
  let colorIdx = 0
  const getSpeakerStyle = (speaker: string) => {
    if (!speakerStyles[speaker]) {
      speakerStyles[speaker] = palette[colorIdx % palette.length]
      colorIdx++
    }
    return speakerStyles[speaker]
  }

  // 说话人 chip 组件（实心彩色，可改名）
  const SpeakerChip = ({ speaker, size = 'small' }: { speaker: string; size?: 'small' | 'big' }) => {
    const style = getSpeakerStyle(speaker)
    const big = size === 'big'
    return (
      <span
        onClick={() => { setEditingSpeaker(speaker); setNewName(speaker) }}
        style={{
          display:'inline-flex',alignItems:'center',gap:'4px',
          background: style.bg, color: style.text,
          fontSize: big ? '11px' : '10px',
          fontWeight: 600,
          padding: big ? '4px 10px' : '2px 8px',
          borderRadius: '99px',
          cursor: 'pointer',
          border: 'none',
          whiteSpace: 'nowrap',
        }}
        title="点击重命名"
      >
        {speaker}
        <span style={{opacity:0.6,fontSize:'0.85em'}}>✎</span>
      </span>
    )
  }

  const uniqueSpeakers = [...new Set(currentMeeting.segments.map(s => s.speaker))]

  const handleRenameSpeaker = (oldName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingSpeaker(null)
      return
    }
    const updatedSegments = currentMeeting.segments.map(seg =>
      seg.speaker === oldName ? { ...seg, speaker: newName.trim() } : seg
    )
    const updatedTranscript = updatedSegments.map(seg =>
      `[${formatTime(seg.start)}] ${seg.speaker}: ${seg.text}`
    ).join('\n')
    updateMeeting(currentMeeting.id, { segments: updatedSegments, transcript: updatedTranscript })
    setEditingSpeaker(null)
    setNewName('')
  }

  const handleCopyTranscript = () => {
    const text = currentMeeting.segments.map(seg =>
      `[${formatTime(seg.start)}] ${seg.speaker}: ${seg.text}`
    ).join('\n')
    navigator.clipboard.writeText(text)
  }

  const handleJumpToTime = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      audioRef.current.play().catch(() => {})
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) audioRef.current.play().catch(() => {})
    else audioRef.current.pause()
  }

  const playhead = currentTime / (audioRef.current?.duration || 1)

  return (
    <div style={{width:'50%',borderRight:'1px solid rgba(255,255,255,0.06)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Audio Player */}
      {audioUrl && (
        <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.25)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <button
              onClick={togglePlay}
              style={{width:'32px',height:'32px',borderRadius:'50%',background:'rgba(96,165,250,0.2)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}
            >
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#93c5fd"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#93c5fd"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:'4px'}}>
              <div
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const ratio = (e.clientX - rect.left) / rect.width
                  if (audioRef.current && audioRef.current.duration) {
                    audioRef.current.currentTime = ratio * audioRef.current.duration
                  }
                }}
                style={{height:'4px',background:'rgba(255,255,255,0.1)',borderRadius:'2px',cursor:'pointer',position:'relative'}}
              >
                <div style={{height:'100%',background:'linear-gradient(90deg, #3b82f6, #8b5cf6)',borderRadius:'2px',width:`${playhead*100}%`}} />
                <div style={{position:'absolute',top:'-3px',left:`${playhead*100}%`,width:'10px',height:'10px',borderRadius:'50%',background:'white',transform:'translateX(-50%)',boxShadow:'0 0 4px rgba(0,0,0,0.4)'}} />
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'9px',color:'rgba(255,255,255,0.35)',fontFamily:'monospace'}}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(audioRef.current?.duration || 0)}</span>
              </div>
            </div>
          </div>
          <audio ref={audioRef} src={audioUrl} preload="metadata" style={{display:'none'}} />
        </div>
      )}

      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{minWidth:0,flex:1}}>
          <h2 style={{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>转录结果</h2>
          <p style={{fontSize:'11px',color:'rgba(255,255,255,0.25)',margin:'4px 0 0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentMeeting.filename}</p>
        </div>
        <button onClick={handleCopyTranscript} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer',flexShrink:0}}>复制</button>
      </div>

      {/* Speaker Tags - 顶部说话人列表 */}
      {uniqueSpeakers.length > 0 && (
        <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',background:'rgba(0,0,0,0.15)'}}>
          <span style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',marginRight:'4px'}}>说话人 ({uniqueSpeakers.length})：</span>
          {uniqueSpeakers.map(speaker => (
            <div key={speaker}>
              {editingSpeaker === speaker ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => handleRenameSpeaker(speaker)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSpeaker(speaker)}
                  style={{fontSize:'11px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(96,165,250,0.5)',borderRadius:'6px',padding:'4px 8px',color:'white',width:'100px',outline:'none'}}
                />
              ) : (
                <SpeakerChip speaker={speaker} size="big" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transcript List */}
      <div style={{flex:1,overflowY:'auto',padding:'10px 16px'}}>
        {currentMeeting.segments.length > 0 ? (
          currentMeeting.segments.map((seg, i) => {
            const isActive = activeSegment === i
            return (
              <div
                key={i}
                ref={(el) => { segmentRefs.current[i] = el }}
                style={{
                  display:'flex',gap:'8px',marginBottom:'8px',padding:'6px 8px',borderRadius:'8px',
                  background: isActive ? 'rgba(96,165,250,0.1)' : 'transparent',
                  borderLeft: isActive ? '2px solid #60a5fa' : '2px solid transparent',
                  transition:'background 0.2s, border-color 0.2s',
                }}
              >
                {/* 时间 + 播放按钮 */}
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',flexShrink:0,width:'36px'}}>
                  <button
                    onClick={() => handleJumpToTime(seg.start)}
                    title={`跳转到 ${formatTime(seg.start)}`}
                    style={{width:'20px',height:'20px',borderRadius:'50%',background:isActive?'rgba(96,165,250,0.3)':'rgba(255,255,255,0.06)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill={isActive?'#93c5fd':'rgba(255,255,255,0.5)'}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <span style={{color:isActive?'rgba(96,165,250,0.8)':'rgba(255,255,255,0.25)',fontSize:'9px',fontFamily:'monospace'}}>
                    {formatTime(seg.start)}
                  </span>
                </div>
                {/* 文字内容（点击也跳转） */}
                <div style={{flex:1,minWidth:0,cursor:audioUrl?'pointer':'default'}} onClick={() => handleJumpToTime(seg.start)}>
                  <div style={{marginBottom:'4px'}}>
                    <SpeakerChip speaker={seg.speaker} />
                  </div>
                  <p style={{color:isActive?'rgba(255,255,255,0.95)':'rgba(255,255,255,0.7)',fontSize:'13px',margin:0,lineHeight:1.6}}>{seg.text}</p>
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
