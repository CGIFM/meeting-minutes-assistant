import { toast } from '../services/toast'
import { useState, useRef, useEffect } from 'react'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { useAppStore } from '../stores/appStore'
import { BACKEND_PORT } from '../services/api'

interface MinutesPanelProps {
  onChat: (message: string, options?: { attachTranscript?: boolean }) => void
  onRegenerate?: () => void
}

export function MinutesPanel({ onChat, onRegenerate }: MinutesPanelProps) {
  const { currentMeeting, isGenerating, saveStatus, flushSave } = useAppStore()
  const [input, setInput] = useState('')
  const [attachTranscript, setAttachTranscript] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const minutesRef = useRef<HTMLDivElement>(null)
  // 记录"是否贴在底部"——用户向上翻看时不再自动滚，回到底部则恢复
  const isAtBottomRef = useRef(true)

  // 监听滚动：离底部 < 60px 视为贴底
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      isAtBottomRef.current = distance < 60
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // 内容变化时：只有贴底才自动滚到最新；用户向上翻看时保持当前位置
  useEffect(() => {
    if (contentRef.current && isAtBottomRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [currentMeeting?.minutes, currentMeeting?.chatHistory])

  if (!currentMeeting) return null

  const handleSend = () => {
    if (!input.trim() || isGenerating) return
    onChat(input.trim(), { attachTranscript })
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

  const BASE_URL = `http://127.0.0.1:${BACKEND_PORT()}`

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
        toast(result.message || (result.success ? '导出成功' : '导出失败'), result.success ? 'success' : 'error')
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
      toast(`导出失败: ${e.message}`, 'error')
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
      toast(`图片导出失败: ${e.message}`, 'error')
    }
  }

  const handleSave = async () => {
    await flushSave()
    toast('已保存', 'success')
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
          {!isGenerating && saveStatus === 'saving' && (
            <span style={{fontSize:'10px',color:'#fbbf24',padding:'2px 6px'}}>保存中…</span>
          )}
          {!isGenerating && saveStatus === 'saved' && (
            <span style={{fontSize:'10px',color:'#34d399',padding:'2px 6px'}}>已保存</span>
          )}
        </div>
        <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
          <button
            onClick={handleSave}
            title="Ctrl/Cmd+S"
            style={{fontSize:'10px',color:'#93c5fd',background:'rgba(96,165,250,0.08)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:'6px',padding:'4px 10px',cursor:'pointer'}}
          >💾 保存</button>
          {currentMeeting.minutes ? (
            <>
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
            </>
          ) : (
            onRegenerate && (
              <button onClick={onRegenerate} style={{fontSize:'11px',color:'white',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',border:'none',borderRadius:'8px',padding:'6px 14px',cursor:'pointer',fontWeight:500}}>
                生成纪要
              </button>
            )
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} style={{flex:1,overflowY:'auto',padding:'20px'}}>
        {currentMeeting.minutes ? (
          <div ref={minutesRef} className="prose prose-sm prose-invert max-w-none" style={{color:'rgba(255,255,255,0.7)',fontSize:'13px',lineHeight:1.8,padding:'8px'}}>
            <ObsidianMarkdown content={currentMeeting.minutes} />
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
            {currentMeeting.chatHistory.map((msg, i) => {
              // 折叠显示：如果 user 消息含【我的修改要求】，只显示分隔符之后的部分（问题本身），并加 📎 标记
              const isAttached = msg.role === 'user' && msg.content.includes('【我的修改要求】')
              const displayContent = isAttached
                ? msg.content.split('【我的修改要求】').pop()!.trim()
                : msg.content
              return (
                <div key={i} style={{display:'flex',justifyContent:msg.role === 'user' ? 'flex-end' : 'flex-start',marginBottom:'10px'}}>
                  <div style={{
                    maxWidth:'85%',
                    borderRadius:'14px',
                    padding:'10px 14px',
                    fontSize:'13px',
                    userSelect:'text',
                    WebkitUserSelect:'text',
                    cursor:'text',
                    fontFamily:'-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Apple Color Emoji", "Segoe UI Emoji", Arial, sans-serif',
                    ...(msg.role === 'user'
                      ? {background:'rgba(96,165,250,0.15)',color:'#bfdbfe',border:'1px solid rgba(96,165,250,0.2)'}
                      : {background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.6)',border:'1px solid rgba(255,255,255,0.06)'}
                    )
                  }}>
                    {isAttached && (
                      <div style={{fontSize:'10px',color:'#93c5fd',marginBottom:'6px',display:'flex',alignItems:'center',gap:'4px',opacity:0.8}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        附带完整转录文档
                      </div>
                    )}
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ObsidianMarkdown content={displayContent} />
                      </div>
                    ) : displayContent}
                  </div>
                </div>
              )
            })}
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
            placeholder={attachTranscript ? "输入修改要求，本次将附带完整转录文档一起发送..." : "输入修改要求，如：请把行动项按优先级排序..."}
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
        <div style={{display:'flex',gap:'6px',marginTop:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <button
            onClick={() => setAttachTranscript(v => !v)}
            title="开启后，本次发送会把完整转录文档附带进去，AI 上下文就有了转录原文；之后即使关掉，AI 仍能在历史中看到这份转录"
            style={{
              fontSize:'10px',
              padding:'3px 10px',
              borderRadius:'99px',
              cursor:'pointer',
              display:'flex',alignItems:'center',gap:'4px',
              border: attachTranscript ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.08)',
              background: attachTranscript ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
              color: attachTranscript ? '#93c5fd' : 'rgba(255,255,255,0.45)',
              transition:'all 0.15s',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {attachTranscript
                ? <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/></>
                : <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8"/></>}
            </svg>
            {attachTranscript ? '已附带转录文档（本次发送生效）' : '附带转录文档'}
          </button>
          <span style={{fontSize:'10px',color:'rgba(255,255,255,0.2)'}}>Shift+Enter 换行 · Enter 发送</span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      `}</style>
    </div>
  )
}
