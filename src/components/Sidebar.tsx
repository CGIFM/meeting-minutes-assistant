import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { Settings, FileAudio, Plus, Mic } from 'lucide-react'

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

  const formatDuration = (seconds: number) => {
    if (!seconds) return ''
    const m = Math.floor(seconds / 60)
    return `${m} 分钟`
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <aside className="w-56 flex flex-col h-full bg-[#0f0f12] border-r border-white/5">
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Mic size={14} className="text-white" />
          </div>
          <h1 className="text-sm font-semibold text-white/90">会议纪要助手</h1>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={handleFileSelect}
          disabled={isTranscribing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white/[0.07] hover:bg-white/[0.12] disabled:opacity-40 rounded-xl text-sm text-white/80 transition-all duration-200 border border-white/[0.06]"
        >
          <Plus size={15} />
          导入音频
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="px-2 py-2 text-[10px] text-white/30 uppercase tracking-widest font-medium">
          历史记录
        </div>
        {meetings.length === 0 ? (
          <div className="px-3 py-10 text-center text-white/20 text-xs leading-relaxed">
            暂无记录<br />拖入音频文件开始
          </div>
        ) : (
          <div className="space-y-0.5">
            {meetings.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => setCurrentMeeting(meeting)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  currentMeeting?.id === meeting.id
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileAudio size={13} className="shrink-0 opacity-60" />
                  <span className="truncate text-xs">{meeting.filename}</span>
                </div>
                <div className="text-[10px] opacity-40 mt-1 ml-5">
                  {formatDate(meeting.created_at)}
                  {meeting.duration > 0 && ` · ${formatDuration(meeting.duration)}`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-white/5">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] rounded-lg text-xs text-white/40 hover:text-white/60 transition-all"
        >
          <Settings size={14} />
          设置
        </button>
      </div>
    </aside>
  )
}
