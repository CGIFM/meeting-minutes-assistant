import { useState, useEffect } from 'react'

interface AsrModelDialogProps {
  filename: string
  onConfirm: (modelId: string) => void
  onCancel: () => void
}

const BASE_URL = () => `http://127.0.0.1:${window.location.port || (window as any).__BACKEND_PORT__}`

export function AsrModelDialog({ filename, onConfirm, onCancel }: AsrModelDialogProps) {
  const [models, setModels] = useState<{id: string; name: string}[]>([
    { id: 'sensevoice', name: 'SenseVoice (推荐·中文优化)' },
    { id: 'paraformer', name: 'Paraformer-large (高精度)' },
  ])
  const [selected, setSelected] = useState('sensevoice')

  useEffect(() => {
    fetch(`${BASE_URL()}/api/asr-models`)
      .then(r => r.json())
      .then(data => { if (data.models?.length) setModels(data.models) })
      .catch(() => {})
  }, [])

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:998}}>
      <div style={{background:'#1a1a22',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'16px',width:'460px',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.5)'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <h2 style={{fontSize:'15px',fontWeight:600,color:'rgba(255,255,255,0.9)',margin:0}}>选择转录模型</h2>
          <p style={{fontSize:'11px',color:'rgba(255,255,255,0.35)',margin:'6px 0 0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{filename}</p>
        </div>

        <div style={{padding:'20px 24px'}}>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                style={{
                  padding:'14px 16px',borderRadius:'10px',cursor:'pointer',textAlign:'left',
                  border: selected === m.id ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  background: selected === m.id ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)',
                  display:'flex',alignItems:'center',gap:'10px',
                }}
              >
                <div style={{
                  width:'16px',height:'16px',borderRadius:'50%',flexShrink:0,
                  border: selected === m.id ? '5px solid #60a5fa' : '2px solid rgba(255,255,255,0.2)',
                }} />
                <span style={{fontSize:'12px',color: selected === m.id ? '#93c5fd' : 'rgba(255,255,255,0.7)'}}>{m.name}</span>
              </button>
            ))}
          </div>
          <p style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',margin:'14px 0 0',lineHeight:1.6}}>
            💡 SenseVoice 中文识别最快最准；Paraformer 精度更高但较慢。首次切换模型需下载（约 1-2GB）。
          </p>
        </div>

        <div style={{padding:'16px 24px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'flex-end',gap:'10px'}}>
          <button onClick={onCancel} style={{padding:'8px 18px',fontSize:'11px',color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'8px',background:'transparent',cursor:'pointer'}}>
            取消
          </button>
          <button onClick={() => onConfirm(selected)} style={{padding:'8px 20px',fontSize:'12px',color:'white',background:'linear-gradient(135deg, #3b82f6, #8b5cf6)',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:500}}>
            开始转录
          </button>
        </div>
      </div>
    </div>
  )
}
