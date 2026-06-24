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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[640px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">设置</h2>
          <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b">
          {[
            { id: 'llm' as const, label: 'LLM 设置' },
            { id: 'asr' as const, label: 'ASR 设置' },
            { id: 'prompt' as const, label: '提示词' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'llm' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">默认提供商</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">默认模型（可选）</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="留空使用默认模型"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">API Keys</h3>
                {PROVIDERS.filter(p => p.id !== 'ollama').map((p) => (
                  <div key={p.id} className="mb-3">
                    <label className="block text-xs text-gray-500 mb-1">
                      {p.name} {apiKeys[p.id] && <span className="text-green-600">({apiKeys[p.id]})</span>}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={keyInputs[p.id] || ''}
                        onChange={(e) => setKeyInputs({ ...keyInputs, [p.id]: e.target.value })}
                        placeholder={p.placeholder}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => handleSaveKey(p.id)}
                        className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-900"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  热词（每行一个）
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  添加容易被识别错误的专有名词，如人名、公司名、技术术语等。ASR 引擎会优先识别这些词。
                </p>
                <textarea
                  value={hotwords}
                  onChange={(e) => setHotwords(e.target.value)}
                  rows={8}
                  placeholder={"Claude\nKubernetes\n张三\n李四\n..."}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {tab === 'prompt' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  会议纪要提示词模板
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  使用 {'{transcript}'} 作为转录文本的占位符。
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={16}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
                />
              </div>
              <button
                onClick={() => setPrompt('')}
                className="text-sm text-blue-600 hover:underline"
              >
                恢复默认提示词
              </button>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}
