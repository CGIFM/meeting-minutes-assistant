import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { getSettings, updateSettings, updateApiKey, getApiKeys, BACKEND_PORT } from '../services/api'

const PROVIDERS = [
  { id: 'claude', name: 'Claude (Anthropic)', placeholder: 'sk-ant-...', hasBaseUrl: false },
  { id: 'openai', name: 'OpenAI / 兼容API', placeholder: 'sk-...', hasBaseUrl: true },
  { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza...', hasBaseUrl: false },
  { id: 'ollama', name: 'Ollama (本地)', placeholder: '无需 Key', hasBaseUrl: true },
]

const BASE_URL = () => `http://127.0.0.1:${BACKEND_PORT()}`

export function SettingsModal() {
  const { setShowSettings, settings, setSettings } = useAppStore()
  const [tab, setTab] = useState<'llm' | 'asr' | 'prompt'>('llm')
  const [apiKeys, setApiKeys] = useState<Record<string, any>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({})
  const [hotwords, setHotwords] = useState(settings.hotwords)
  const [provider, setProvider] = useState(settings.default_provider)
  const [model, setModel] = useState(settings.default_model)
  const [prompt, setPrompt] = useState(settings.prompt_template)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({})
  const [testing, setTesting] = useState<string>('')
  const [loadingModels, setLoadingModels] = useState<string>('')
  const [ccAvailable, setCcAvailable] = useState(false)

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
      setCcAvailable(keys.claude_code_available || false)
      const urls: Record<string, string> = {}
      Object.entries(keys).forEach(([k, v]: [string, any]) => { if (v && v.base_url) urls[k] = v.base_url })
      setBaseUrlInputs(urls)
    } catch (e) {}
  }

  const handleImportClaudeCode = async () => {
    try {
      const resp = await fetch(`${BASE_URL()}/api/settings/import-claude-code-key`, { method: 'POST' })
      const result = await resp.json()
      if (result.success) {
        const keys = await getApiKeys()
        setApiKeys(keys)
      } else {
        alert(result.message)
      }
    } catch (e) {}
  }

  const handleSaveKey = async (providerId: string) => {
    const key = keyInputs[providerId] || ''
    const base_url = baseUrlInputs[providerId] || ''
    await updateApiKey(providerId, key, base_url)
    setKeyInputs({ ...keyInputs, [providerId]: '' })
    const keys = await getApiKeys()
    setApiKeys(keys)
  }

  const handleTestConnection = async (providerId: string) => {
    setTesting(providerId)
    try {
      const resp = await fetch(`${BASE_URL()}/api/settings/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          api_key: keyInputs[providerId] || '',
          base_url: baseUrlInputs[providerId] || '',
        }),
      })
      const result = await resp.json()
      setTestResults({ ...testResults, [providerId]: result })
    } catch (e) {
      setTestResults({ ...testResults, [providerId]: { success: false, message: '请求失败' } })
    }
    setTesting('')
  }

  const handleLoadModels = async (providerId: string) => {
    setLoadingModels(providerId)
    try {
      const resp = await fetch(`${BASE_URL()}/api/settings/list-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          api_key: keyInputs[providerId] || '',
          base_url: baseUrlInputs[providerId] || '',
        }),
      })
      const result = await resp.json()
      setModelLists({ ...modelLists, [providerId]: result.models || [] })
    } catch (e) {
      setModelLists({ ...modelLists, [providerId]: [] })
    }
    setLoadingModels('')
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

  const btnSmall: React.CSSProperties = {
    padding:'6px 12px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:'8px',color:'rgba(255,255,255,0.6)',fontSize:'10px',cursor:'pointer',whiteSpace:'nowrap'
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999}}>
      <div style={{background:'#1a1a22',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'16px',width:'620px',maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.5)'}}>
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
              <select value={provider} onChange={(e) => { setProvider(e.target.value); handleLoadModels(e.target.value) }} style={{...inputStyle,appearance:'auto'}}>
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <label style={{display:'block',fontSize:'11px',color:'rgba(255,255,255,0.5)',margin:'16px 0 6px'}}>默认模型</label>
              {modelLists[provider]?.length ? (
                <select value={model} onChange={(e) => setModel(e.target.value)} style={{...inputStyle,appearance:'auto'}}>
                  <option value="">自动（使用默认模型）</option>
                  {modelLists[provider].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <div style={{display:'flex',gap:'8px'}}>
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="留空使用默认模型" style={{...inputStyle,flex:1}} />
                  <button onClick={() => handleLoadModels(provider)} style={btnSmall}>
                    {loadingModels === provider ? '...' : '获取模型'}
                  </button>
                </div>
              )}
              {modelLists[provider]?.length > 0 && (
                <p style={{fontSize:'10px',color:'rgba(255,255,255,0.25)',margin:'4px 0 0'}}>
                  已获取 {modelLists[provider].length} 个模型
                </p>
              )}

              <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:'20px',paddingTop:'16px'}}>
                <h3 style={{fontSize:'11px',color:'rgba(255,255,255,0.5)',margin:'0 0 12px'}}>API 配置</h3>
                {PROVIDERS.map(p => (
                  <div key={p.id} style={{marginBottom:'18px',padding:'12px',background:'rgba(255,255,255,0.02)',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                      <label style={{fontSize:'11px',color:'rgba(255,255,255,0.6)',fontWeight:500}}>{p.name}</label>
                      <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                        {apiKeys[p.id]?.configured && (
                          <span style={{fontSize:'9px',color:'#34d399',background:'rgba(52,211,153,0.1)',padding:'2px 6px',borderRadius:'4px'}}>
                            {apiKeys[p.id].configured}
                          </span>
                        )}
                        {p.id === 'claude' && ccAvailable && (
                          <button onClick={handleImportClaudeCode} style={{...btnSmall,color:'#93c5fd',borderColor:'rgba(96,165,250,0.3)'}}>
                            导入 Claude Code Key
                          </button>
                        )}
                      </div>
                    </div>

                    {p.id !== 'ollama' && (
                      <div style={{display:'flex',gap:'6px',marginBottom:'6px'}}>
                        <input type="password" value={keyInputs[p.id]||''} onChange={(e) => setKeyInputs({...keyInputs,[p.id]:e.target.value})} placeholder={p.placeholder} style={{...inputStyle,flex:1,padding:'8px 12px'}} />
                      </div>
                    )}

                    {p.hasBaseUrl && (
                      <div style={{marginBottom:'6px'}}>
                        <input
                          type="text"
                          value={baseUrlInputs[p.id]||''}
                          onChange={(e) => setBaseUrlInputs({...baseUrlInputs,[p.id]:e.target.value})}
                          placeholder={p.id === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1（自定义地址）'}
                          style={{...inputStyle,padding:'8px 12px',fontSize:'11px'}}
                        />
                      </div>
                    )}

                    <div style={{display:'flex',gap:'6px'}}>
                      <button onClick={() => handleSaveKey(p.id)} style={btnSmall}>保存</button>
                      <button onClick={() => handleTestConnection(p.id)} style={btnSmall}>
                        {testing === p.id ? '测试中...' : '测试连接'}
                      </button>
                      <button onClick={() => handleLoadModels(p.id)} style={btnSmall}>
                        {loadingModels === p.id ? '...' : '获取模型'}
                      </button>
                      {testResults[p.id] && (
                        <span style={{fontSize:'10px',alignSelf:'center',color:testResults[p.id].success ? '#34d399' : '#f87171'}}>
                          {testResults[p.id].message}
                        </span>
                      )}
                    </div>

                    {modelLists[p.id]?.length > 0 && (
                      <div style={{marginTop:'8px',fontSize:'10px',color:'rgba(255,255,255,0.3)',maxHeight:'60px',overflowY:'auto'}}>
                        可用模型: {modelLists[p.id].slice(0,5).join(', ')}{modelLists[p.id].length > 5 ? ` 等${modelLists[p.id].length}个` : ''}
                      </div>
                    )}
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
