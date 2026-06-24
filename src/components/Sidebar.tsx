import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { Mic, Settings, FileAudio, Plus } from 'lucide-react'

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
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <aside className="w-60 bg-gray-900 text-white flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold">会议纪要助手</h1>
      </div>

      <div className="p-3 border-b border-gray-700 space-y-2">
        <button
          onClick={handleFileSelect}
          disabled={isTranscribing}
          className="w-full flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition"
        >
          <Plus size={16} />
          导入音频
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 text-xs text-gray-400 uppercase tracking-wider">历史记录</div>
        {meetings.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            暂无记录<br />拖入音频文件开始
          </div>
        ) : (
          meetings.map((meeting) => (
            <button
              key={meeting.id}
              onClick={() => setCurrentMeeting(meeting)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition ${
                currentMeeting?.id === meeting.id ? 'bg-gray-800 border-l-2 border-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <FileAudio size={14} className="text-gray-400 shrink-0" />
                <span className="truncate">{meeting.filename}</span>
              </div>
              {meeting.duration > 0 && (
                <div className="text-xs text-gray-500 mt-0.5 ml-5">
                  {formatDuration(meeting.duration)}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800 rounded-lg text-sm text-gray-300 transition"
        >
          <Settings size={16} />
          设置
        </button>
      </div>
    </aside>
  )
}
