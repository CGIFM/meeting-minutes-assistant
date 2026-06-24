import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { getSettings, updateSettings, updateApiKey, getApiKeys } from '../services/api'
import { X } from 'lucide-react'

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

  useEffect(() => {
    loadSettings()
  }, [])

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
    } catch (e) {
      console.error('加载设置失败:', e)
    }
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
    await updateSettings({
      hotwords,
      default_provider: provider,
      default_model: model,
      prompt_template: prompt,
    })
    setSettings({ hotwords, default_provider: provider, default_model: model, prompt_template: prompt })
    setShowSettings(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a1a22] border border-white/[0.08] rounded-2xl shadow-2xl w-[600px] max-h-[75vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white/90">设置</h2>
          <button onClick={() => setShowSettings(false)} className="text-white/30 hover:text-white/60 transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-white/[0.06] px-5">
          {[
            { id: 'llm' as const, label: 'LLM 设置' },
            { id: 'asr' as const, label: '语音识别' },
            { id: 'prompt' as const, label: '提示词' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                tab === t.id
                  ? 'border-blue-400 text-blue-300'
                  : 'border-transparent text-white/30 hover:text-white/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'llm' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">默认提供商</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-blue-400/40"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">默认模型（可选）</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="留空使用默认模型"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-400/40"
                />
              </div>

              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-xs font-medium text-white/50 mb-4">API Keys</h3>
                {PROVIDERS.filter(p => p.id !== 'ollama').map((p) => (
                  <div key={p.id} className="mb-4">
                    <label className="block text-[11px] text-white/30 mb-1.5">
                      {p.name}
                      {apiKeys[p.id] && <span className="text-emerald-400/80 ml-2">{apiKeys[p.id]}</span>}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={keyInputs[p.id] || ''}
                        onChange={(e) => setKeyInputs({ ...keyInputs, [p.id]: e.target.value })}
                        placeholder={p.placeholder}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-blue-400/40"
                      />
                      <button
                        onClick={() => handleSaveKey(p.id)}
                        className="px-4 py-2 bg-white/[0.06] border border-white/[0.08] text-white/60 text-xs rounded-xl hover:bg-white/[0.1] hover:text-white/80 transition"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'asr' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">
                  热词（每行一个）
                </label>
                <p className="text-[11px] text-white/25 mb-3 leading-relaxed">
                  添加容易被识别错误的专有名词，如人名、公司名、技术术语等。<br />
                  ASR 引擎会优先识别这些词。
                </p>
                <textarea
                  value={hotwords}
                  onChange={(e) => setHotwords(e.target.value)}
                  rows={10}
                  placeholder={"Claude\nKubernetes\n张三\n李四"}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 font-mono placeholder:text-white/15 focus:outline-none focus:border-blue-400/40 resize-none"
                />
              </div>
            </div>
          )}

          {tab === 'prompt' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">
                  会议纪要提示词模板
                </label>
                <p className="text-[11px] text-white/25 mb-3">
                  使用 {'{transcript}'} 作为转录文本的占位符
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={14}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white/70 font-mono leading-relaxed placeholder:text-white/15 focus:outline-none focus:border-blue-400/40 resize-none"
                />
              </div>
              <button
                onClick={() => setPrompt('')}
                className="text-xs text-blue-400/70 hover:text-blue-300 transition"
              >
                恢复默认提示词
              </button>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/[0.06] flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-5 py-2.5 text-xs text-white/50 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 text-xs bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-xl hover:bg-blue-500/30 transition"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}
