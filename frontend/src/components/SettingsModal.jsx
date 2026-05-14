import { useState, useEffect } from 'react'

const C = {
  bg:         '#FEFCFD',
  surface:    '#F5EFF2',
  surfaceHov: '#EDE4E9',
  border:     'rgba(0,0,0,0.09)',
  borderIn:   'rgba(0,0,0,0.13)',
  textHi:     '#18060F',
  textMd:     '#4B2535',
  textLo:     '#7C526A',
  textXlo:    '#A07888',
}

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
    label:       'ElevenLabs API Key（音效）',
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
    setSaving(true); setError(''); setSaved(false)
    try {
      const res  = await fetch('/api/settings', {
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

  const toggleVisible = key => setVisible(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg mx-4 overflow-hidden rounded-2xl animate-slide-up-modal"
        style={{
          background: C.bg,
          border:     `1px solid ${C.border}`,
          boxShadow:  '0 24px 60px rgba(0,0,0,0.28), 0 4px 16px rgba(229,0,127,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 className="text-sm font-bold font-cute" style={{ color: C.textHi }}>API 设置</h2>
            <p className="text-[11px] mt-0.5" style={{ color: C.textXlo }}>配置保存到本地 .env 文件，立即生效无需重启</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-black/[0.06]"
            style={{ color: C.textLo }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#E5007F] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            FIELDS.map((field, idx) => {
              if (field.section) {
                return (
                  <div key={`section-${idx}`} className={idx > 0 ? 'pt-3' : ''}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest pb-2"
                       style={{ color: C.textLo, borderBottom: `1px solid ${C.border}` }}>
                      {field.section}
                    </p>
                  </div>
                )
              }
              const { key, label, placeholder, sensitive, hint } = field
              return (
                <div key={key} className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={{ color: C.textMd }}>{label}</label>
                  <div className="relative">
                    <input
                      type={sensitive && !visible[key] ? 'password' : 'text'}
                      value={values[key] ?? ''}
                      onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono transition-all outline-none"
                      style={{
                        background:  C.surface,
                        border:      `1px solid ${C.borderIn}`,
                        color:       C.textHi,
                        caretColor:  '#E5007F',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(229,0,127,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(229,0,127,0.10)' }}
                      onBlur={e  => { e.target.style.borderColor = C.borderIn;               e.target.style.boxShadow = 'none' }}
                    />
                    {sensitive && (
                      <button
                        type="button"
                        onClick={() => toggleVisible(key)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-sm"
                        style={{ color: C.textXlo }}
                        title={visible[key] ? '隐藏' : '显示'}
                      >
                        {visible[key] ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  {hint && <p className="text-[11px] leading-relaxed" style={{ color: C.textXlo }}>{hint}</p>}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderTop: `1px solid ${C.border}` }}>
          {error  && <p className="text-xs text-rose-500 flex-1">{error}</p>}
          {saved  && !error && <p className="text-xs text-emerald-600 flex-1">已保存并立即生效</p>}
          {!error && !saved && <span className="flex-1" />}
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-xl transition-all btn-press hover:bg-black/[0.06]"
            style={{ color: C.textMd, border: `1px solid ${C.borderIn}` }}
          >
            关闭
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 text-xs font-semibold text-white rounded-xl transition-all btn-press flex items-center gap-2"
            style={{
              background:  saving || loading ? C.surface : 'linear-gradient(135deg,#E5007F,#C4006B)',
              color:       saving || loading ? C.textXlo  : '#fff',
              boxShadow:   saving || loading ? 'none'     : '0 4px 14px rgba(229,0,127,0.30)',
            }}
          >
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
