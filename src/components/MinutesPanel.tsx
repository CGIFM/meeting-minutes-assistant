import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAppStore } from '../stores/appStore'
import { Send, RefreshCw } from 'lucide-react'

interface MinutesPanelProps {
  onChat: (message: string) => void
}

export function MinutesPanel({ onChat }: MinutesPanelProps) {
  const { currentMeeting, isGenerating } = useAppStore()
  const [input, setInput] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="w-1/2 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">会议纪要</h2>
        {isGenerating && (
          <span className="text-[10px] text-blue-400 flex items-center gap-1.5 bg-blue-400/10 px-2 py-1 rounded-full">
            <RefreshCw size={9} className="animate-spin" /> 生成中
          </span>
        )}
      </div>

      <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {currentMeeting.minutes ? (
          <div className="prose prose-sm prose-invert max-w-none prose-headings:text-white/80 prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white/80 prose-td:text-white/50 prose-th:text-white/70">
            <ReactMarkdown>{currentMeeting.minutes}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              {isGenerating ? (
                <>
                  <div className="w-8 h-8 border-2 border-white/10 border-t-purple-400 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/30 text-sm">正在生成会议纪要...</p>
                </>
              ) : (
                <p className="text-white/20 text-sm">转录完成后将自动生成纪要</p>
              )}
            </div>
          </div>
        )}

        {currentMeeting.chatHistory.length > 0 && (
          <div className="border-t border-white/[0.06] pt-4 space-y-3">
            <div className="text-[10px] text-white/25 uppercase tracking-widest">对话</div>
            {currentMeeting.chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500/20 text-blue-100 border border-blue-400/20'
                    : 'bg-white/[0.04] text-white/60 border border-white/[0.06]'
                }`}>
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

      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入修改要求，如：请把行动项按优先级排序..."
            rows={2}
            className="flex-1 resize-none rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-400/40 focus:bg-white/[0.06] transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 disabled:opacity-30 disabled:hover:bg-blue-500/20 transition-all border border-blue-400/20"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-white/20 mt-2 ml-1">
          Shift+Enter 换行，Enter 发送
        </p>
      </div>
    </div>
  )
}
