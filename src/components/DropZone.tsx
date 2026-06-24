import { useCallback, useState } from 'react'
import { Upload, FileAudio } from 'lucide-react'

interface DropZoneProps {
  onFileDrop: (file: File) => void
}

export function DropZone({ onFileDrop }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileDrop(file)
  }, [onFileDrop])

  const handleClick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,video/mp4'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) onFileDrop(file)
    }
    input.click()
  }, [onFileDrop])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`flex-1 flex items-center justify-center cursor-pointer transition-all duration-300 rounded-2xl m-4 ${
        isDragging
          ? 'bg-blue-500/10 border-2 border-dashed border-blue-400/50'
          : 'border-2 border-dashed border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
      }`}
    >
      <div className="text-center">
        <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center transition-all ${
          isDragging ? 'bg-blue-500/20' : 'bg-white/[0.04]'
        }`}>
          {isDragging ? (
            <FileAudio size={28} className="text-blue-400" />
          ) : (
            <Upload size={28} className="text-white/20" />
          )}
        </div>
        <p className={`text-base font-medium mb-2 ${isDragging ? 'text-blue-300' : 'text-white/60'}`}>
          {isDragging ? '松开即可开始处理' : '拖入音频文件'}
        </p>
        <p className="text-xs text-white/25 leading-relaxed">
          支持 MP3、WAV、M4A、MP4、FLAC、OGG 等格式<br />
          支持 60 分钟以上长录音
        </p>
        <div className="mt-6">
          <span className="px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.08] transition-all">
            或点击选择文件
          </span>
        </div>
      </div>
    </div>
  )
}
