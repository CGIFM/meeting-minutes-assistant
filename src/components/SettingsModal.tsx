import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { getSettings, updateSettings, updateApiKey, getApiKeys } from '../services/api'

const PROVIDERS = [
  { id: 'claude', name: 'Claude (Anthropic)', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI / 兼容API', placeholder: 'sk-...' },
  { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza...' },
  { id: 'ollama', name: 'Ollama (本地)', placeholder: '无需 Key' },
]

export function SettingsModal() {
  const { setShowSettings, settings, setSettings } = useAppStore()
  const [tab, setTab] = useState<'llm' | 'asr' | 'prompt'>('llm')
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [hotwords, setHotwords] = useState(settings.hotwords)
  const [provider, setProvider] = useState(settings.default_provider)
  const [model, setModel] = useState(settings.default_model)
  const [prompt, setPrompt] = useState(settings.prompt_template)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    try {
      const s = await getSettings()
      setHotwords(s.hotwords)
      setProvider(s.default_provider)
      setModel(s.default_model)
      setPrompt(s.prompt_template)
      setSettings(s)
      const keys = await getApiKeys()
      setApiKeys(keys)
    } catch (e) {}
  }

  const handleSaveKey = async (providerId: string) => {
    const key = keyInputs[providerId]
    if (!key) return
    await updateApiKey(providerId, key)
    setKeyInputs({ ...keyInputs, [providerId]: '' })
    const keys = await getApiKeys()
    setApiKeys(keys)
  }

  const handleSave = async () => {
    await updateSettings({ hotwords, default_provider: provider, default_model: model, prompt_template: prompt })
    setSettings({ hotwords, default_provider: provider, default_model: model, prompt_template: prompt })
    setShowSettings(false)
  }

  const inputStyle: React.CSSProperties = {
    width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:'10px',padding:'10px 14px',fontSize:'12px',color:'rgba(255,255,255,0.8)',
    outline:'none',fontFamily:'inherit',boxSizing:'border-box'
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999}}>
      <div style={{background:'#1a1a22',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'16px',width:'580px',maxHeight:'75vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.5)'}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <h2 style={{fontSize:'15px',fontWeight:600,color:'rgba(255,255,255,0.9)',margin:0}}>设置</h2>
          <button onClick={() => setShowSettings(false)} style={{color:'rgba(255,255,255,0.3)',background:'none',border:'none',cursor:'pointer',fontSize:'18px'}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',padding:'0 24px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          {([['llm','LLM 设置'],['asr','语音识别'],['prompt','提示词']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)} style={{
              padding:'12px 16px',fontSize:'11px',fontWeight:500,border:'none',cursor:'pointer',
              borderBottom: tab===id ? '2px solid #60a5fa' : '2px solid transparent',
              color: tab===id ? '#93c5fd' : 'rgba(255,255,255,0.3)',background:'transparent'
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
          {tab === 'llm' && (
            <div>
              <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',marginBottom:'6px'}}>默认提供商</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{...inputStyle,appearance:'auto'}}>
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',margin:'16px 0 6px'}}>默认模型（可选）</label>
              <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="留空使用默认模型" style={inputStyle} />

              <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:'20px',paddingTop:'16px'}}>
                <h3 style={{fontSize:'11px',color:'rgba(255,255,255,0.5)',margin:'0 0 12px'}}>API Keys</h3>
                {PROVIDERS.filter(p => p.id !== 'ollama').map(p => (
                  <div key={p.id} style={{marginBottom:'14px'}}>
                    <label style={{display:'block',fontSize:'10px',color:'rgba(255,255,255,0.3)',marginBottom:'4px'}}>
                      {p.name} {apiKeys[p.id] && <span style={{color:'#34d399'}}>{apiKeys[p.id]}</span>}
                    </label>
                    <div style={{display:'flex',gap:'8px'}}>
                      <input type="password" value={keyInputs[p.id]||''} onChange={(e) => setKeyInputs({...keyInputs,[p.id]:e.target.value})} placeholder={p.placeholder} style={{...inputStyle,flex:1}} />
                      <button onClick={() => handleSaveKey(p.id)} style={{padding:'8px 14px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'8px',color:'rgba(255,255,255,0.6)',fontSize:'11px',cursor:'pointer'}}>保存</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'asr' && (
            <div>
              <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',marginBottom:'6px'}}>热词（每行一个）</label>
              <p style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',margin:'0 0 10px',lineHeight:1.6}}>
                添加容易被识别错误的专有名词（人名、公司名、技术术语等），ASR 引擎会优先识别。
              </p>
              <textarea value={hotwords} onChange={(e) => setHotwords(e.target.value)} rows={10} placeholder={"Claude\nKubernetes\n张三"} style={{...inputStyle,resize:'none',fontFamily:'monospace'}} />
            </div>
          )}

          {tab === 'prompt' && (
            <div>
              <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',marginBottom:'6px'}}>会议纪要提示词模板</label>
              <p style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',margin:'0 0 10px'}}>使用 {'{transcript}'} 作为转录文本占位符</p>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={14} style={{...inputStyle,resize:'none',fontFamily:'monospace',fontSize:'11px',lineHeight:'1.6'}} />
              <button onClick={() => setPrompt('')} style={{marginTop:'10px',fontSize:'11px',color:'#60a5fa',background:'none',border:'none',cursor:'pointer'}}>恢复默认提示词</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'16px 24px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'flex-end',gap:'10px'}}>
          <button onClick={() => setShowSettings(false)} style={{padding:'8px 18px',fontSize:'11px',color:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'8px',background:'transparent',cursor:'pointer'}}>取消</button>
          <button onClick={handleSave} style={{padding:'8px 18px',fontSize:'11px',color:'#93c5fd',background:'rgba(96,165,250,0.15)',border:'1px solid rgba(96,165,250,0.3)',borderRadius:'8px',cursor:'pointer'}}>保存设置</button>
        </div>
      </div>
    </div>
  )
}
