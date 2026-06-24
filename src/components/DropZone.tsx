import { useCallback, useState } from 'react'

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
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        margin: '16px',
        borderRadius: '16px',
        border: isDragging ? '2px dashed rgba(96,165,250,0.5)' : '2px dashed rgba(255,255,255,0.06)',
        background: isDragging ? 'rgba(96,165,250,0.05)' : 'transparent',
        transition: 'all 0.3s',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isDragging ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isDragging ? '#60a5fa' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <p style={{ fontSize: '15px', fontWeight: 500, color: isDragging ? '#93c5fd' : 'rgba(255,255,255,0.6)', margin: '0 0 8px' }}>
          {isDragging ? '松开即可开始处理' : '拖入音频文件'}
        </p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.8, margin: 0 }}>
          支持 MP3、WAV、M4A、MP4、FLAC、OGG 等格式<br />
          支持 60 分钟以上长录音
        </p>
        <div style={{ marginTop: '24px' }}>
          <span style={{
            padding: '8px 16px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px', color: 'rgba(255,255,255,0.4)',
          }}>
            或点击选择文件
          </span>
        </div>
      </div>
    </div>
  )
}
