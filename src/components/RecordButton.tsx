import { toast } from '../services/toast'
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'

interface RecordButtonProps {
  onRecordingComplete?: (file: File) => void
}

export function RecordButton({ }: RecordButtonProps) {
  const [isArming, setIsArming] = useState(false)
  const { setRecordingMode } = useAppStore()

  const startLiveRecord = () => {
    setIsArming(true)
    setRecordingMode(true)
    setTimeout(() => setIsArming(false), 1500)
  }

  return (
    <div style={{padding:'0 12px 12px'}}>
      <button
        onClick={startLiveRecord}
        disabled={isArming}
        style={{
          width:'100%',
          display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',
          padding:'10px',
          background:'rgba(239,68,68,0.08)',
          border:'1px solid rgba(239,68,68,0.2)',
          borderRadius:'10px',
          fontSize:'12px',
          color:'#fca5a5',
          cursor:'pointer',
          transition:'all 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
        开始录音（实时转录）
      </button>
    </div>
  )
}
