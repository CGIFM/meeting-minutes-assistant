import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAppStore } from '../stores/appStore'

interface MinutesPanelProps {
  onChat: (message: string) => void
  onRegenerate?: () => void
}

export function MinutesPanel({ onChat, onRegenerate }: MinutesPanelProps) {
  const { currentMeeting, isGenerating } = useAppStore()
  const [input, setInput] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const minutesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [currentMeeting?.minutes, currentMeeting?.chatHistory])

  if (!currentMeeting) return null

  const handleSend = () => {
    if (!input.trim() || isGenerating) return
    onChat(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopyMinutes = () => {
    if (currentMeeting.minutes) {
      navigator.clipboard.writeText(currentMeeting.minutes)
    }
  }

  const handleExportMd = () => {
    if (!currentMeeting.minutes) return
    const blob = new Blob([currentMeeting.minutes], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentMeeting.filename.replace(/\.[^.]+$/, '')}_会议纪要.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const BASE_URL = `http://127.0.0.1:${(window as any).__BACKEND_PORT__ || 0}`

  const callExport = async (format: string) => {
    if (!currentMeeting.minutes) return
    try {
      const resp = await fetch(`${BASE_URL}/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: currentMeeting.filename,
          content: currentMeeting.minutes,
          minutes: currentMeeting.minutes,
          transcript: currentMeeting.transcript,
        }),
      })
      const ctype = resp.headers.get('content-type') || ''
      if (ctype.includes('application/json')) {
        const result = await resp.json()
        alert(result.message || (result.success ? '导出成功' : '导出失败'))
      } else {
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentMeeting.filename.replace(/\.[^.]+$/, '')}_会议纪要.${format === 'pdf' ? 'pdf' : 'docx'}`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e: any) {
      alert(`导出失败: ${e.message}`)
    }
  }

  const handleExportObsidian = () => callExport('obsidian')
  const handleExportPdf = () => callExport('pdf')
  const handleExportWord = () => callExport('word')

  const handleExportImage = async () => {
    if (!currentMeeting.minutes || !minutesRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(minutesRef.current, {
        backgroundColor: '#1a1a22',
        scale: 2,
        logging: false,
      })
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentMeeting.filename.replace(/\.[^.]+$/, '')}_会议纪要.png`
        a.click()
        URL.revokeObjectURL(url)
      })
    } catch (e: any) {
      alert(`图片导出失败: ${e.message}`)
    }
  }

  return (
    <div style={{width:'50%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <h2 style={{fontSize:'11px',fontWeight:600,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>会议纪要</h2>
          {isGenerating && (
            <span style={{fontSize:'10px',color:'#60a5fa',background:'rgba(96,165,250,0.1)',padding:'2px 8px',borderRadius:'99px',display:'flex',alignItems:'center',gap:'4px'}}>
              <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#60a5fa',animation:'pulse 1.5s infinite'}} />
              生成中
            </span>
          )}
        </div>
        {currentMeeting.minutes && (
          <div style={{display:'flex',gap:'4px',flexWrap:'wrap',justifyContent:'flex-end'}}>
            {onRegenerate && (
              <button onClick={onRegenerate} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
                重生成
              </button>
            )}
            <button onClick={handleExportObsidian} title="保存到 Obsidian 的会议纪要文件夹" style={{fontSize:'10px',color:'#a78bfa',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.25)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
              Obsidian
            </button>
            <button onClick={handleExportPdf} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
              PDF
            </button>
            <button onClick={handleExportWord} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
              Word
            </button>
            <button onClick={handleExportImage} title="导出为 PNG 图片" style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
              图片
            </button>
            <button onClick={handleExportMd} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
              .md
            </button>
            <button onClick={handleCopyMinutes} style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',padding:'4px 8px',cursor:'pointer'}}>
              复制
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={contentRef} style={{flex:1,overflowY:'auto',padding:'20px'}}>
        {currentMeeting.minutes ? (
          <div ref={minutesRef} className="prose prose-sm prose-invert max-w-none" style={{color:'rgba(255,255,255,0.7)',fontSize:'13px',lineHeight:1.8,padding:'8px'}}>
            <ReactMarkdown>{currentMeeting.minutes}</ReactMarkdown>
          </div>
        ) : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
            <div style={{textAlign:'center'}}>
              {isGenerating ? (
                <>
                  <div style={{width:'32px',height:'32px',border:'2px solid rgba(255,255,255,0.1)',borderTop:'2px solid #a78bfa',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 12px'}} />
                  <p style={{color:'rgba(255,255,255,0.3)',fontSize:'13px',margin:0}}>正在生成会议纪要...</p>
                </>
              ) : (
                <p style={{color:'rgba(255,255,255,0.2)',fontSize:'13px',margin:0}}>转录完成后将自动生成纪要</p>
              )}
            </div>
          </div>
        )}

        {/* Chat History */}
        {currentMeeting.chatHistory.length > 0 && (
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:'16px',marginTop:'16px'}}>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'12px'}}>对话</div>
            {currentMeeting.chatHistory.map((msg, i) => (
              <div key={i} style={{display:'flex',justifyContent:msg.role === 'user' ? 'flex-end' : 'flex-start',marginBottom:'10px'}}>
                <div style={{
                  maxWidth:'85%',
                  borderRadius:'14px',
                  padding:'10px 14px',
                  fontSize:'13px',
                  ...(msg.role === 'user'
                    ? {background:'rgba(96,165,250,0.15)',color:'#bfdbfe',border:'1px solid rgba(96,165,250,0.2)'}
                    : {background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.6)',border:'1px solid rgba(255,255,255,0.06)'}
                  )
                }}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div style={{padding:'14px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
        <div style={{display:'flex',gap:'8px',alignItems:'flex-end'}}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入修改要求，如：请把行动项按优先级排序..."
            rows={2}
            style={{flex:1,resize:'none',borderRadius:'12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',padding:'10px 14px',fontSize:'13px',color:'rgba(255,255,255,0.8)',outline:'none',fontFamily:'inherit'}}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            style={{padding:'10px',background: input.trim() && !isGenerating ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.04)',color: input.trim() && !isGenerating ? '#93c5fd' : 'rgba(255,255,255,0.2)',borderRadius:'12px',border:'1px solid rgba(96,165,250,0.2)',cursor: input.trim() && !isGenerating ? 'pointer' : 'default'}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </div>
        <p style={{fontSize:'10px',color:'rgba(255,255,255,0.2)',margin:'6px 0 0 4px'}}>
          💡 可不断追问修改纪要，如"按优先级排序行动项"、"改成要点列表"<br/>Shift+Enter 换行，Enter 发送
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      `}</style>
    </div>
  )
}
