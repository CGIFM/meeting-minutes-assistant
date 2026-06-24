import { useState, useEffect, useRef } from 'react'
import { useAppStore, TranscriptSegment } from '../stores/appStore'

interface TranscriptPanelProps {
  audioUrl?: string
}

export function TranscriptPanel({ audioUrl }: TranscriptPanelProps) {
  const { currentMeeting, updateMeeting } = useAppStore()
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [activeSegment, setActiveSegment] = useState<number>(-1)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const updateTime = () => setCurrentTime(audio.currentTime)
    audio.addEventListener('timeupdate', updateTime)
    return () => audio.removeEventListener('timeupdate', updateTime)
  }, [audioUrl])

  useEffect(() => {
    if (!currentMeeting?.segments.length || !audioUrl) {
      setActiveSegment(-1)
      return
    }
    const idx = currentMeeting.segments.findIndex(
      (s, i) => s.start <= currentTime && (i === currentMeeting.segments.length - 1 || currentMeeting.segments[i + 1].start > currentTime)
    )
    setActiveSegment(idx)
  }, [currentTime, currentMeeting, audioUrl])

  if (!currentMeeting) return null

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const speakerColors: Record<string, string> = {}
  const colors = ['#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#fb7185']
  let colorIdx = 0
  const getSpeakerColor = (speaker: string) => {
    if (!speakerColors[speaker]) {
      speakerColors[speaker] = colors[colorIdx % colors.length]
      colorIdx++
    }
    return speakerColors[speaker]
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

  return (
    <div style={{width:'50%',borderRight:'1px solid rgba(255,255,255,0.06)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Audio Player */}
      {audioUrl && (
        <div style={{padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.2)'}}>
          <audio ref={audioRef} src={audioUrl} controls style={{width:'100%',height:'32px'}} />
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

      {/* Speaker Tags */}
      {uniqueSpeakers.length > 0 && (
        <div style={{padding:'8px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
          {uniqueSpeakers.map(speaker => (
            <div key={speaker} style={{display:'flex',alignItems:'center',gap:'4px'}}>
              {editingSpeaker === speaker ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => handleRenameSpeaker(speaker)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSpeaker(speaker)}
                  style={{fontSize:'10px',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:'4px',padding:'2px 6px',color:'white',width:'80px',outline:'none'}}
                />
              ) : (
                <span
                  onClick={() => { setEditingSpeaker(speaker); setNewName(speaker) }}
                  style={{fontSize:'10px',color:getSpeakerColor(speaker),background:'rgba(255,255,255,0.04)',borderRadius:'4px',padding:'2px 8px',cursor:'pointer',border:'1px solid rgba(255,255,255,0.06)'}}
                  title="点击重命名"
                >
                  {speaker}
                </span>
              )}
            </div>
          ))}
          <span style={{fontSize:'9px',color:'rgba(255,255,255,0.2)'}}>点击改名</span>
        </div>
      )}

      {/* Transcript List */}
      <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>
        {currentMeeting.segments.length > 0 ? (
          currentMeeting.segments.map((seg, i) => (
            <div
              key={i}
              onClick={() => handleJumpToTime(seg.start)}
              style={{
                display:'flex',gap:'10px',marginBottom:'10px',padding:'6px 8px',borderRadius:'8px',cursor:audioUrl?'pointer':'default',
                background: activeSegment === i ? 'rgba(96,165,250,0.08)' : 'transparent',
                borderLeft: activeSegment === i ? '2px solid #60a5fa' : '2px solid transparent',
                transition:'background 0.2s'
              }}
            >
              <span style={{color:audioUrl?'rgba(96,165,250,0.6)':'rgba(255,255,255,0.2)',fontSize:'10px',fontFamily:'monospace',flexShrink:0,paddingTop:'2px',width:'40px',textAlign:'right'}}>
                {formatTime(seg.start)}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <span style={{fontWeight:500,fontSize:'10px',color:getSpeakerColor(seg.speaker),textTransform:'uppercase',letterSpacing:'0.03em'}}>
                  {seg.speaker}
                </span>
                <p style={{color: activeSegment === i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)',fontSize:'13px',margin:'3px 0 0',lineHeight:1.6}}>{seg.text}</p>
              </div>
            </div>
          ))
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
