import { useState, useEffect } from 'react'

// section: 分组标题（可选）；否则为普通字段
const FIELDS = [
  { section: '🤖 AI 脚本生成' },
  {
    key:         'DEEPSEEK_API_KEY',
    label:       'DeepSeek API Key（推荐）',
    placeholder: 'sk-xxxxxxxxxxxxxxxx',
    sensitive:   true,
    hint:        'platform.deepseek.com → API Keys。填入后优先使用 DeepSeek，比 Claude 便宜很多。',
  },
  {
    key:         'DEEPSEEK_MODEL',
    label:       'DeepSeek 模型',
    placeholder: 'deepseek-chat',
    sensitive:   false,
    hint:        '可选：deepseek-v4-flash（快速）、deepseek-v4-pro（推理）、deepseek-chat / deepseek-reasoner（旧名，2026/07 弃用）',
  },
  { section: '🔷 Anthropic / Claude（备用）' },
  {
    key:         'ANTHROPIC_API_KEY',
    label:       'Anthropic API Key',
    placeholder: 'sk-ant-api03-...',
    sensitive:   true,
    hint:        'console.anthropic.com → API Keys。DeepSeek Key 为空时才会使用此项。',
  },
  {
    key:         'CLAUDE_API_BASE',
    label:       'OpenRouter API Key（可选）',
    placeholder: 'sk-or-v1-...  填入后自动走 OpenRouter',
    sensitive:   true,
    hint:        '填入 OpenRouter Key 即可，无需另填 Anthropic Key。留空则直连 Anthropic。',
  },
  {
    key:         'CLAUDE_MODEL',
    label:       'Claude 模型名称',
    placeholder: 'claude-sonnet-4-20250514',
    sensitive:   false,
    hint:        'Anthropic 直连示例：claude-sonnet-4-20250514　｜　OpenRouter 示例：anthropic/claude-sonnet-4-20250514',
  },
  { section: '🎵 BGM 生成' },
  {
    key:         'MINIMAX_API_KEY',
    label:       'MiniMax API Key（推荐）',
    placeholder: 'sk-api-...',
    sensitive:   true,
    hint:        'platform.minimaxi.com → API Keys。填入后优先使用 MiniMax 生成 BGM，否则回退到 Suno。',
  },
  {
    key:         'MINIMAX_GROUP_ID',
    label:       'MiniMax Group ID（可选）',
    placeholder: '1234567890',
    sensitive:   false,
    hint:        '部分 MiniMax 接口需要 Group ID，可在控制台账户信息中找到。',
  },
  {
    key:         'SUNO_API_URL',
    label:       'Suno API 地址（备用）',
    placeholder: 'http://localhost:3000',
    sensitive:   false,
    hint:        '本地部署的 suno-api 地址，MiniMax Key 为空时使用。',
  },
  { section: '🗣️ 配音 & 音效' },
  {
    key:         'DOUBAO_API_KEY',
    label:       '豆包 TTS API Key',
    placeholder: '火山引擎控制台获取',
    sensitive:   true,
    hint:        '火山引擎控制台 → 语音技术 → API Key',
  },
  {
    key:         'ELEVENLABS_API_KEY',
    label:       'ElevenLabs API Key（音效备用）',
    placeholder: 'elevenlabs.io → Settings → API Key',
    sensitive:   true,
    hint:        'MiniMax Key 为空时使用。elevenlabs.io → Profile → API Keys',
  },
]

export default function SettingsModal({ onClose }) {
  const [values,  setValues]  = useState({})
  const [visible, setVisible] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => { setValues(data); setLoading(false) })
      .catch(() => { setError('无法加载设置'); setLoading(false) })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleVisible = (key) =>
    setVisible(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">API 设置</h2>
            <p className="text-xs text-gray-400 mt-0.5">配置保存到本地 .env 文件，立即生效无需重启</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            FIELDS.map((field, idx) => {
              // 分组标题
              if (field.section) {
                return (
                  <div key={`section-${idx}`} className={`${idx > 0 ? 'pt-2' : ''}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b border-gray-100">
                      {field.section}
                    </p>
                  </div>
                )
              }
              const { key, label, placeholder, sensitive, hint } = field
              return (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      type={sensitive && !visible[key] ? 'password' : 'text'}
                      value={values[key] ?? ''}
                      onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm
                        focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                    />
                    {sensitive && (
                      <button
                        type="button"
                        onClick={() => toggleVisible(key)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors text-xs"
                        title={visible[key] ? '隐藏' : '显示'}
                      >
                        {visible[key] ? '🙈' : '👁️'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{hint}</p>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          {error && (
            <p className="text-xs text-red-500 flex-1">{error}</p>
          )}
          {saved && !error && (
            <p className="text-xs text-green-600 flex-1">✓ 设置已保存并立即生效</p>
          )}
          {!error && !saved && <span className="flex-1" />}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            关闭
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700
              disabled:bg-gray-200 disabled:text-gray-400 rounded-lg transition-colors flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
