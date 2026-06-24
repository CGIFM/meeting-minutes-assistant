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
  const chatEndRef = useRef<HTMLDivElement>(null)
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
    <div className="w-1/2 flex flex-col overflow-hidden bg-white">
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">会议纪要</h2>
        {isGenerating && (
          <span className="text-xs text-blue-500 flex items-center gap-1 mt-0.5">
            <RefreshCw size={10} className="animate-spin" /> 生成中...
          </span>
        )}
      </div>

      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentMeeting.minutes ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{currentMeeting.minutes}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            {isGenerating ? '正在生成会议纪要...' : '转录完成后将自动生成纪要'}
          </div>
        )}

        {currentMeeting.chatHistory.length > 0 && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="text-xs text-gray-400 uppercase">对话记录</div>
            {currentMeeting.chatHistory.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block max-w-[85%] rounded-lg px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入修改要求，如：请把行动项按优先级排序..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition self-end"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Shift+Enter 换行，Enter 发送。支持多轮对话修改纪要。
        </p>
      </div>
    </div>
  )
}
