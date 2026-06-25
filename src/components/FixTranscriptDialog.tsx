import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { BACKEND_PORT } from '../services/api'

interface FixTranscriptDialogProps {
  segmentCount: number
  onConfirm: (options: { provider: string; model: string; userRequest: string }) => void
  onCancel: () => void
}

const PROVIDERS = [
  { id: 'claude', name: 'Claude' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'ollama', name: 'Ollama' },
]

const BASE_URL = () => `http://127.0.0.1:${BACKEND_PORT()}`

export function FixTranscriptDialog({ segmentCount, onConfirm, onCancel }: FixTranscriptDialogProps) {
  const { settings } = useAppStore()
  const [provider, setProvider] = useState(settings.default_provider || 'claude')
  const [model, setModel] = useState(settings.default_model || '')
  const [userRequest, setUserRequest] = useState('')
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    loadModels(provider)
  }, [provider])

  const loadModels = async (p: string) => {
    try {
      const resp = await fetch(`${BASE_URL()}/api/settings/list-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p }),
      })
      const data = await resp.json()
      setModels(data.models || [])
    } catch { setModels([]) }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:998}}>
      <div style={{background:'#1a1a22',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'16px',width:'540px',maxHeight:'82vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.5)'}}>
        {/* Header */}
        <div style={{padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <h2 style={{fontSize:'15px',fontWeight:600,color:'rgba(255,255,255,0.9)',margin:0}}>AI 修正转录</h2>
          <p style={{fontSize:'11px',color:'rgba(255,255,255,0.35)',margin:'6px 0 0'}}>
            共 {segmentCount} 段 · 时间戳和说话人会保留，仅修改文本内容
          </p>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
          {/* Provider */}
          <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',marginBottom:'6px'}}>选择 LLM</label>
          <div style={{display:'flex',gap:'6px',marginBottom:'16px',flexWrap:'wrap'}}>
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                style={{
                  padding:'6px 14px',borderRadius:'8px',fontSize:'11px',cursor:'pointer',
                  border: provider === p.id ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  background: provider === p.id ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                  color: provider === p.id ? '#93c5fd' : 'rgba(255,255,255,0.5)',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Model */}
          <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',marginBottom:'6px'}}>模型</label>
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'10px 14px',fontSize:'12px',color:'rgba(255,255,255,0.8)',outline:'none',appearance:'auto',marginBottom:'16px',boxSizing:'border-box'}}
            >
              <option value="">默认模型</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="留空使用默认模型"
              style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'10px 14px',fontSize:'12px',color:'rgba(255,255,255,0.8)',outline:'none',marginBottom:'16px',boxSizing:'border-box'}}
            />
          )}

          {/* 修正要求 */}
          <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',marginBottom:'6px'}}>
            修正要求（可选）
          </label>
          <p style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',margin:'0 0 8px'}}>
            留空则进行初步修正（纠错 + 措辞优化 + 热词纠正）；也可以指定具体替换规则
          </p>
          <textarea
            value={userRequest}
            onChange={(e) => setUserRequest(e.target.value)}
            placeholder={`例如：\n· 把"飞达"全部换成"科大讯飞"\n· 把"识别错误"改成正确的技术术语\n· 修正同音字错误，比如"在理"应为"在里"`}
            rows={5}
            style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'10px 14px',fontSize:'12px',color:'rgba(255,255,255,0.8)',outline:'none',resize:'none',fontFamily:'inherit',boxSizing:'border-box',lineHeight:1.6}}
          />
        </div>

        {/* Footer */}
        <div style={{padding:'16px 24px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'flex-end',gap:'10px'}}>
          <button onClick={onCancel} style={{padding:'8px 18px',fontSize:'11px',color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'8px',background:'transparent',cursor:'pointer'}}>
            取消
          </button>
          <button
            onClick={() => onConfirm({ provider, model, userRequest })}
            style={{padding:'8px 20px',fontSize:'12px',color:'white',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:500}}
          >
            开始修正
          </button>
        </div>
      </div>
    </div>
  )
}
