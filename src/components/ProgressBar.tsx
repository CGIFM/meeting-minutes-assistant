import { useAppStore } from '../stores/appStore'

export function ProgressBar() {
  const { isTranscribing, isGenerating, transcribeProgress } = useAppStore()

  const stage = isTranscribing ? '语音识别中' : isGenerating ? '生成纪要中' : ''
  const progress = isTranscribing ? transcribeProgress : undefined

  if (!stage) return null

  return (
    <div style={{height:'44px',background:'#0f0f12',borderTop:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',padding:'0 20px',gap:'12px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'11px',color:'rgba(255,255,255,0.5)',flexShrink:0}}>
        <div style={{width:'6px',height:'6px',background:'#60a5fa',borderRadius:'50%',animation:'pulse 1.5s infinite'}} />
        {stage}
      </div>

      <div style={{flex:1,height:'4px',background:'rgba(255,255,255,0.05)',borderRadius:'2px',overflow:'hidden'}}>
        {progress !== undefined ? (
          <div style={{height:'100%',background:'linear-gradient(90deg, #3b82f6, #8b5cf6)',borderRadius:'2px',transition:'width 0.5s ease-out',width:`${Math.round(progress * 100)}%`}} />
        ) : (
          <div style={{height:'100%',width:'33%',background:'linear-gradient(90deg, #3b82f6, #8b5cf6)',borderRadius:'2px',animation:'pulse 1.5s infinite'}} />
        )}
      </div>

      {progress !== undefined && (
        <span style={{fontSize:'10px',color:'rgba(255,255,255,0.3)',fontFamily:'monospace',flexShrink:0}}>
          {Math.round(progress * 100)}%
        </span>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
    </div>
  )
}
