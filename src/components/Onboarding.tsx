import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { getApiKeys } from '../services/api'

interface OnboardingProps {
  onOpenSettings: () => void
  onDismiss: () => void
}

export function Onboarding({ onOpenSettings, onDismiss }: OnboardingProps) {
  const [hasClaudeKey, setHasClaudeKey] = useState(false)
  const [ccAvailable, setCcAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    check()
  }, [])

  const check = async () => {
    try {
      const keys = await getApiKeys()
      setHasClaudeKey(!!keys.claude?.configured)
      setCcAvailable(!!keys.claude_code_available)
    } catch {}
    setLoading(false)
  }

  if (loading) return null

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:997}}>
      <div style={{background:'#1a1a22',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'20px',width:'480px',padding:'36px 32px',textAlign:'center',boxShadow:'0 30px 60px rgba(0,0,0,0.6)'}}>
        {/* Logo */}
        <div style={{width:'56px',height:'56px',borderRadius:'16px',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',margin:'0 auto 20px',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </div>

        <h2 style={{fontSize:'20px',fontWeight:600,color:'white',margin:'0 0 10px'}}>欢迎使用会议纪要助手</h2>
        <p style={{fontSize:'13px',color:'rgba(255,255,255,0.5)',lineHeight:1.7,margin:'0 0 24px'}}>
          拖入录音文件即可自动转录<br/>然后用 AI 生成专业的会议纪要
        </p>

        {/* Steps */}
        <div style={{textAlign:'left',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'12px',padding:'16px',marginBottom:'24px'}}>
          <div style={{display:'flex',gap:'10px',alignItems:'flex-start',marginBottom:'12px'}}>
            <div style={{width:'20px',height:'20px',borderRadius:'50%',background:hasClaudeKey?'rgba(52,211,153,0.2)':'rgba(96,165,250,0.2)',color:hasClaudeKey?'#34d399':'#60a5fa',fontSize:'11px',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {hasClaudeKey ? '✓' : '1'}
            </div>
            <div>
              <div style={{fontSize:'12px',color:hasClaudeKey?'rgba(52,211,153,0.8)':'rgba(255,255,255,0.8)'}}>配置 LLM API Key</div>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,0.35)',marginTop:'2px'}}>
                {hasClaudeKey ? '已配置' : ccAvailable ? '点击导入 CC switch 的 Claude Key' : '需要先配置才能生成纪要'}
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
            <div style={{width:'20px',height:'20px',borderRadius:'50%',background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.3)',fontSize:'11px',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0'}}>2</div>
            <div>
              <div style={{fontSize:'12px',color:'rgba(255,255,255,0.7)'}}>拖入音频文件</div>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,0.35)',marginTop:'2px'}}>支持 MP3/WAV/M4A 等，60 分钟以上长音频</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={onDismiss} style={{flex:1,padding:'12px',fontSize:'12px',color:'rgba(255,255,255,0.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',background:'transparent',cursor:'pointer'}}>
            稍后配置
          </button>
          <button onClick={onOpenSettings} style={{flex:1,padding:'12px',fontSize:'12px',color:'white',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',border:'none',borderRadius:'10px',cursor:'pointer',fontWeight:500}}>
            前往设置
          </button>
        </div>
      </div>
    </div>
  )
}
