import { useCallback, useState } from 'react'
import { Upload } from 'lucide-react'

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
      className={`flex-1 flex items-center justify-center cursor-pointer transition-all ${
        isDragging
          ? 'bg-blue-50 border-4 border-dashed border-blue-400'
          : 'bg-gray-50 border-4 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-100'
      }`}
    >
      <div className="text-center">
        <Upload size={48} className={`mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="text-lg font-medium text-gray-700">
          {isDragging ? '松开即可开始处理' : '拖入音频文件'}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          支持 MP3、WAV、M4A、MP4、FLAC、OGG 等格式
        </p>
        <p className="text-sm text-gray-500">
          支持 60 分钟以上长录音
        </p>
        <p className="text-xs text-gray-400 mt-4">
          或点击此处选择文件
        </p>
      </div>
    </div>
  )
}
