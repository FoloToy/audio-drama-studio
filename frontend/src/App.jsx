import { useState, useEffect, useRef } from 'react'

// 始终使用浅色模式，清除可能残留的深色模式 class
document.documentElement.classList.remove('dark')
localStorage.removeItem('folotoy-theme')
import StepIndicator    from './components/StepIndicator'
import ScriptViewer     from './components/ScriptViewer'
import CharacterCard    from './components/CharacterCard'
import ProgressTracker  from './components/ProgressTracker'
import SettingsModal    from './components/SettingsModal'
import StyleEditorModal from './components/StyleEditorModal'
import RewriteProgress  from './components/RewriteProgress'
import LibraryModal     from './components/LibraryModal'
import VoicePickerModal from './components/VoicePickerModal'
import CloudCanvas      from './components/CloudCanvas'
import { useSSE }       from './hooks/useSSE'

// ─── 风格配置 ────────────────────────────────────────────────────────────────

const STYLES = [
  {
    id:     'sunjingxiu',
    emoji:  '🎙️',
    title:  '儿童广播剧',
    desc:   '拟声词丰富、互动感强，适合8-11岁小朋友收听',
    color:  'border-[#E5007F]/20 bg-[#E5007F]/[0.04]',
    active: 'border-[#E5007F]/50 bg-[#E5007F]/10 ring-1 ring-[#E5007F]/30',
  },
  {
    id:     'blog',
    emoji:  '📖',
    title:  '博客有声故事',
    desc:   '文学叙事风格，节奏舒缓，适合全年龄段收听',
    color:  'border-emerald-500/20 bg-emerald-500/[0.04]',
    active: 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30',
  },
  {
    id:     'custom',
    emoji:  '✏️',
    title:  '自定义风格',
    desc:   '粘贴你自己的改写指令，系统自动补全输出格式',
    color:  'border-amber-500/20 bg-amber-500/[0.04]',
    active: 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30',
  },
]

// ─── Step 1: 输入原著 ───────────────────────────────────────────────────────

function InputPage({ onNext }) {
  const [storyName,     setStoryName]     = useState('')
  const [episodeName,   setEpisodeName]   = useState('')
  const [rawText,       setRawText]       = useState('')
  const [style,         setStyle]         = useState('sunjingxiu')
  const [customPrompt,  setCustomPrompt]  = useState('')
  const [streaming,     setStreaming]     = useState(false)
  const [error,         setError]         = useState('')
  const [editingStyle,  setEditingStyle]  = useState(null)
  const [autoFilling,   setAutoFilling]   = useState(false)

  const handleAutoFill = async () => {
    if (!rawText.trim() || autoFilling) return
    setAutoFilling(true)
    setError('')
    try {
      const res  = await fetch('/api/suggest-names', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ raw_text: rawText }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      if (d.story_name)   setStoryName(d.story_name)
      if (d.episode_name) setEpisodeName(d.episode_name)
    } catch (e) {
      setError('AI 识别失败：' + e.message)
    } finally {
      setAutoFilling(false)
    }
  }

  const canSubmit = storyName.trim() && episodeName.trim() && rawText.trim()

  const handleSubmit = () => {
    if (!storyName.trim())   return setError('请填写故事名称')
    if (!episodeName.trim()) return setError('请填写集数名称')
    if (!rawText.trim())     return setError('请输入故事内容')
    if (style === 'custom' && !customPrompt.trim()) return setError('请填写自定义风格指令')
    setError('')
    setStreaming(true)
  }

  const streamParams = {
    story_name:    storyName,
    episode_name:  episodeName,
    raw_text:      rawText,
    style,
    custom_prompt: customPrompt,
  }

  const selectedStyle = STYLES.find(s => s.id === style)

  if (streaming) {
    return (
      <RewriteProgress
        params={streamParams}
        styleTitle={selectedStyle?.title ?? style}
        onDone={result => onNext({ storyName, episodeName, ...result })}
        onCancel={() => { setStreaming(false) }}
      />
    )
  }

  const inputCls = "w-full bg-th-surface border border-th-md text-th-hi placeholder:text-th-xlo rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#E5007F]/50 focus:border-[#E5007F]/40 transition-all theme-transition"

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-5">

      {/* 故事名称 + 集数名称 */}
      <div className="shrink-0 space-y-2">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-th-lo uppercase tracking-widest mb-2.5">故事名称</label>
            <input className={inputCls} value={storyName} onChange={e => setStoryName(e.target.value)} placeholder="如：三国演义" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-th-lo uppercase tracking-widest mb-2.5">集数名称</label>
            <input className={inputCls} value={episodeName} onChange={e => setEpisodeName(e.target.value)} placeholder="如：第一集：桃园三结义" />
          </div>
        </div>
        {/* AI 自动识别按钮 */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={!rawText.trim() || autoFilling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all btn-press disabled:opacity-30"
            style={{
              background: 'rgba(229,0,127,0.07)',
              border:     '1px solid rgba(229,0,127,0.20)',
              color:      'rgba(229,0,127,0.85)',
            }}
          >
            {autoFilling ? (
              <span className="w-3 h-3 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(229,0,127,0.25)', borderTopColor: 'rgba(229,0,127,0.85)' }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z"/>
              </svg>
            )}
            {autoFilling ? 'AI 识别中…' : 'AI 识别故事名称和集数'}
          </button>
        </div>
      </div>

      {/* textarea：自适应填充剩余高度 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-end mb-2">
          <span className="text-xs text-th-xlo">{rawText.length} 字</span>
        </div>
        <textarea
          className={`${inputCls} flex-1 min-h-[80px] resize-none leading-relaxed`}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          placeholder="输入故事..."
        />
      </div>

      {/* 风格选择 + 按钮：锁定在底部 */}
      <div className="shrink-0 space-y-5">
      {/* 风格选择 */}
      <div>
        <label className="block text-xs font-semibold text-th-lo uppercase tracking-widest mb-3.5">改写风格</label>
        <div className="grid grid-cols-3 gap-3">
          {STYLES.map(s => {
            const isSelected = style === s.id
            const canEdit    = isSelected && s.id !== 'custom'
            return (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all card-hover
                    ${isSelected ? s.active : `border-th-lo bg-th-surface hover:bg-th-surface hover:border-th-md opacity-60 hover:opacity-100`}`}
                >
                  <div className="text-2xl mb-2.5">{s.emoji}</div>
                  <div className="text-sm font-semibold text-th-hi">{s.title}</div>
                  <div className="text-xs text-th-lo mt-1 leading-snug">{s.desc}</div>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setEditingStyle(s.id) }}
                    title="编辑 Prompt"
                    className="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-th-md hover:text-white transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {style === 'custom' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-th-lo uppercase tracking-widest">自定义改写指令</label>
              <span className="text-[11px] text-th-xlo">{customPrompt.length} 字</span>
            </div>
            <textarea
              className="w-full bg-th-surface border border-amber-500/20 text-th-hi placeholder:text-th-xlo rounded-xl px-3.5 py-3 h-32 resize-none text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/30 transition-all theme-transition"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder={`例如：\n你是一位粤语有声书播音员，用地道粤语口语改写原著，保留方言语气词（"咁啱""呢""㗎"等），旁白生动，对话简短有力。`}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl">{error}</p>}

      {editingStyle && (
        <StyleEditorModal
          styleId={editingStyle}
          styleTitle={STYLES.find(s => s.id === editingStyle)?.title ?? editingStyle}
          onClose={() => setEditingStyle(null)}
        />
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-gradient-to-r from-[#E5007F] to-[#C4006B] hover:from-[#FF2E9F] hover:to-[#E5007F] disabled:from-th-surface disabled:to-th-surface disabled:text-th-xlo text-white font-semibold py-4 rounded-xl transition-all shadow-lg shadow-[#E5007F]/20 disabled:shadow-none btn-press font-cute text-lg"
      >
        开始改写剧本 — {selectedStyle?.title}
      </button>
      </div>{/* end shrink-0 bottom section */}
    </div>
  )
}

// ─── Step 2: 确认剧本和角色 ─────────────────────────────────────────────────

function ReviewPage({ data, onNext, onBack }) {
  const [script, setScript] = useState(data?.script ?? [])
  const characters = data?.characters ?? []
  const bgm_list   = data?.bgm_list   ?? []
  const sfx_list   = data?.sfx_list   ?? []

  const ttsCount = script.filter(i => i.type === 'tts').length
  const bgmCount = script.filter(i => i.type === 'bgm' && i.action === 'start').length
  const sfxCount = script.filter(i => i.type === 'sfx').length

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-5">

      {/* 标题行 */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-th-hi">改写后的剧本</h3>
          <p className="text-xs text-th-lo mt-1">{ttsCount} 条台词 · {bgmCount} 首 BGM · {sfxCount} 个音效 · 可直接点击台词修改</p>
        </div>
      </div>

      {/* 剧本区域：撑满剩余高度 */}
      <div className="flex-1 min-h-0 border border-th-lo rounded-2xl p-4 bg-th-surface theme-transition overflow-hidden">
        <ScriptViewer script={script} editable onChange={setScript} />
      </div>

      {/* 角色 */}
      <div className="shrink-0">
        <h3 className="text-xs font-semibold text-th-lo uppercase tracking-widest mb-3">
          识别到的角色 <span className="text-th-xlo font-normal normal-case">共 {characters.length} 个</span>
        </h3>
        <div className="flex flex-wrap gap-2.5">
          {characters.map(c => (
            <span key={c.name}
              className="px-4 py-1.5 rounded-full text-sm border border-th-md bg-th-surface text-th-md theme-transition">
              {c.name}
              <span className="text-th-lo ml-1.5">{c.lines_count}条</span>
            </span>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="shrink-0 flex gap-4">
        <button onClick={onBack}
          className="flex-1 border border-th-md text-th-md hover:text-th-hi hover:bg-th-surface font-medium py-3.5 rounded-xl transition-colors text-sm">
          ← 重新改写
        </button>
        <button onClick={() => onNext({ ...data, script })}
          className="flex-2 flex-grow bg-gradient-to-r from-[#E5007F] to-[#C4006B] hover:from-[#FF2E9F] hover:to-[#E5007F] text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-[#E5007F]/20 btn-press text-sm">
          确认，配置音色 →
        </button>
      </div>
    </div>
  )
}

// ─── Step 3: 配置音色 ────────────────────────────────────────────────────────

function VoicePage({ data, onNext, onBack }) {
  const characters = data?.characters ?? []

  // voiceMap: { 角色名: { voice_id, name, description, has_preview } }
  const [voiceMap,     setVoiceMap]     = useState({})
  const [assigning,    setAssigning]    = useState(false)
  const [assignDone,   setAssignDone]   = useState(false)
  const [assignError,  setAssignError]  = useState('')
  // 当前打开 VoicePickerModal 的角色名
  const [pickerFor,    setPickerFor]    = useState(null)
  // 完整音色列表（用于 name/description lookup）
  const [voiceList,    setVoiceList]    = useState([])

  const didAssign = useRef(false)

  // 初次进入：加载音色列表 + AI 自动分配
  useEffect(() => {
    if (didAssign.current) return
    didAssign.current = true
    doAutoAssign()
  }, [])

  /** 安全 fetch：确保拿到 JSON，否则抛出包含 HTTP 状态的错误 */
  async function safeFetchJson(url, options) {
    const res = await fetch(url, options)
    const ct  = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      throw new Error(`后端未响应（HTTP ${res.status}），请确认后端已启动并重新加载页面`)
    }
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
    return json
  }

  async function doAutoAssign() {
    setAssigning(true)
    setAssignError('')
    try {
      // 1. 加载音色库
      const list   = await safeFetchJson('/api/voices')
      const voices = Array.isArray(list) ? list : []
      setVoiceList(voices)

      if (voices.length === 0) {
        // 无音色库，直接进入手动选择
        setAssignDone(true)
        return
      }

      // 2. AI 自动匹配
      const assignJson = await safeFetchJson('/api/assign-voices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ characters }),
      })
      const rawMap = assignJson.voice_map || {}

      // 3. 将 voice_id 映射转成完整 voice 对象
      const voiceById = Object.fromEntries(voices.map(v => [v.voice_id, v]))
      const resolved  = {}
      for (const [charName, voiceId] of Object.entries(rawMap)) {
        if (voiceById[voiceId]) resolved[charName] = voiceById[voiceId]
      }
      setVoiceMap(resolved)
      setAssignDone(true)
    } catch (err) {
      setAssignError(err.message || 'AI 自动匹配失败，请手动选择音色')
      setAssignDone(true)
    } finally {
      setAssigning(false)
    }
  }

  // 更新音色后同步 voiceList（有可能添加了新音色）
  async function refreshVoiceList() {
    try {
      const data = await safeFetchJson('/api/voices')
      if (Array.isArray(data)) setVoiceList(data)
    } catch {}
  }

  const missing = characters.filter(c => !voiceMap[c.name])

  // 将 voiceMap (object of voice objects) → { name: voice_id } for downstream
  function buildVoiceIdMap() {
    return Object.fromEntries(
      Object.entries(voiceMap).map(([charName, v]) => [charName, v.voice_id])
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-th-hi mb-1">配置角色音色</h3>
        <p className="text-xs text-th-lo">
          AI 已根据音色描述自动匹配，可点击「更改」调整，音色 ID 由音色库统一管理。
        </p>
      </div>

      {assigning && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <div className="w-5 h-5 border-2 border-[#E5007F] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-th-md">AI 正在匹配音色…</span>
        </div>
      )}

      {assignDone && (
        <>
          {assignError && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-xl">
              {assignError}
            </p>
          )}
          {voiceList.length === 0 && (
            <div className="bg-blue-500/[0.07] border border-blue-500/20 px-4 py-3 rounded-xl text-xs text-blue-400">
              音色库为空，请在选择音色时点击「添加新音色」添加豆包 TTS 音色。
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {characters.map(c => (
              <CharacterCard key={c.name} character={c} assignedVoice={voiceMap[c.name] || null} onChangeVoice={() => setPickerFor(c.name)} />
            ))}
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-xl">
              还有 {missing.length} 个角色未配置音色：{missing.map(c => c.name).join('、')}
            </p>
          )}
        </>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onBack}
          className="flex-1 border border-th-md text-th-md hover:text-th-hi hover:bg-th-surface font-medium py-2.5 rounded-xl transition-colors">
          ← 返回
        </button>
        <button
          onClick={() => onNext({ ...data, voiceMap: buildVoiceIdMap() })}
          disabled={assigning || missing.length > 0}
          className="flex-2 flex-grow bg-gradient-to-r from-[#E5007F] to-[#C4006B] hover:from-[#FF2E9F] hover:to-[#E5007F] disabled:from-th-surface disabled:to-th-surface disabled:text-th-xlo text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-[#E5007F]/20 disabled:shadow-none btn-press">
          {assigning ? 'AI 匹配中…' : '下一步：生成 BGM/音效 →'}
        </button>
      </div>

      {/* 音色选择 Modal */}
      {pickerFor && (
        <VoicePickerModal
          characterName={pickerFor}
          currentVoiceId={voiceMap[pickerFor]?.voice_id || ''}
          onConfirm={voice => {
            setVoiceMap(prev => ({ ...prev, [pickerFor]: voice }))
            // 如果是新添加的音色，刷新 voiceList
            if (!voiceList.find(v => v.voice_id === voice.voice_id)) {
              refreshVoiceList()
            }
            setPickerFor(null)
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  )
}

// ─── Step 4: 生成 BGM / 音效 ──────────────────────────────────────────────────

const STATUS_LABEL = { idle: '待生成', generating: '生成中', done: '已生成', error: '失败' }
const STATUS_COLOR = {
  idle:       'bg-th-surface text-th-lo border-th-lo',
  generating: 'bg-[#E5007F]/10 text-[#FF3BA8] border-[#E5007F]/20 animate-pulse',
  done:       'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  error:      'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

function MediaCard({ name, item, onGenerate, onPromptChange }) {
  return (
    <div className="border border-th-lo rounded-xl p-3.5 bg-th-surface space-y-2.5 card-hover hover:border-th-hi theme-transition">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-th-hi text-sm flex-1 truncate">{name}</span>
        {item.isLibraryReuse && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0 font-medium flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            已从本地提取
          </span>
        )}
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 border ${STATUS_COLOR[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
        <button
          onClick={() => onGenerate(name, item.status === 'done')}
          disabled={item.status === 'generating'}
          className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg border transition-colors
            disabled:opacity-30 disabled:cursor-not-allowed
            border-th-md hover:border-[#E5007F]/30 hover:text-[#FF3BA8] text-th-lo"
        >
          {item.status === 'done' ? '重新生成' : item.status === 'generating' ? '生成中…' : '生成'}
        </button>
      </div>

      <textarea
        className="w-full text-[11px] border border-th-md rounded-lg px-3 py-2 h-16 resize-none
          bg-th-surface text-th-hi placeholder:text-th-xlo focus:outline-none focus:ring-1 focus:ring-[#E5007F]/30 leading-relaxed theme-transition"
        value={item.prompt}
        onChange={e => onPromptChange(name, e.target.value)}
        placeholder="英文提示词（可编辑后再生成）…"
      />

      {item.status === 'done' && item.previewUrl && (
        <audio controls src={item.previewUrl} className="w-full h-8 [color-scheme:dark]" style={{ height: '32px' }} />
      )}
      {item.status === 'error' && (
        <p className="text-[11px] text-rose-400">生成失败，请检查 API 配置后重试</p>
      )}
    </div>
  )
}

function MediaPage({ data, onNext, onBack }) {
  const { storyName, episodeName, sfx_list = [], bgm_list = [] } = data
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [sfxItems, setSfxItems] = useState({})
  const [bgmItems, setBgmItems] = useState({})
  // 服务器端库匹配路径，传给 Step5 避免重复 find_matches
  const [sfxPaths, setSfxPaths] = useState({})
  const [bgmPaths, setBgmPaths] = useState({})

  // auto-fetch prompts on mount；同时查询素材库 + 检查磁盘，避免刷新后丢失状态
  useEffect(() => {
    if (!sfx_list.length && !bgm_list.length) { setLoading(false); return }
    fetch('/api/media-prompts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ story_name: storyName, episode_name: episodeName, sfx_list, bgm_list }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        const ts = Date.now()
        const sfx = {}
        sfx_list.forEach(n => {
          const libraryUrl = d.sfx_library?.[n] || null
          const diskExists = !!d.sfx_status?.[n]
          sfx[n] = {
            prompt:         d.sfx_prompts?.[n] || '',
            status:         (libraryUrl || diskExists) ? 'done' : 'idle',
            previewUrl:     libraryUrl
                              ? `${libraryUrl}?t=${ts}`
                              : diskExists
                                ? `/api/preview/sfx/${encodeURIComponent(n)}?t=${ts}`
                                : null,
            isLibraryReuse: !!libraryUrl,
          }
        })
        setSfxItems(sfx)
        setSfxPaths(d.sfx_paths || {})

        const bgm = {}
        bgm_list.forEach(n => {
          const libraryUrl = d.bgm_library?.[n] || null
          const diskExists = !!d.bgm_status?.[n]
          bgm[n] = {
            prompt:         d.bgm_prompts?.[n] || '',
            status:         (libraryUrl || diskExists) ? 'done' : 'idle',
            previewUrl:     libraryUrl
                              ? `${libraryUrl}?t=${ts}`
                              : diskExists
                                ? `/api/preview/bgm/${encodeURIComponent(n)}?t=${ts}`
                                : null,
            isLibraryReuse: !!libraryUrl,
          }
        })
        setBgmItems(bgm)
        setBgmPaths(d.bgm_paths || {})
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const updSfx = (name, patch) => setSfxItems(p => ({ ...p, [name]: { ...p[name], ...patch } }))
  const updBgm = (name, patch) => setBgmItems(p => ({ ...p, [name]: { ...p[name], ...patch } }))

  const genSfx = async (name, force = false) => {
    updSfx(name, { status: 'generating' })
    try {
      const res = await fetch('/api/generate-single-sfx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, prompt: sfxItems[name].prompt, force }),
      })
      const d = await res.json()
      if (d.success) updSfx(name, { status: 'done', previewUrl: `${d.preview_url}?t=${Date.now()}` })
      else           updSfx(name, { status: 'error' })
    } catch { updSfx(name, { status: 'error' }) }
  }

  const genBgm = async (name, force = false) => {
    updBgm(name, { status: 'generating' })
    // MiniMax music-2.6 约需 250s；设置 330s 客户端超时，略小于代理侧 350s
    const ctrl      = new AbortController()
    const timerId   = setTimeout(() => ctrl.abort(), 330_000)
    try {
      const res = await fetch('/api/generate-single-bgm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, prompt: bgmItems[name].prompt, force }),
        signal:  ctrl.signal,
      })
      clearTimeout(timerId)
      const d = await res.json()
      if (d.success) updBgm(name, { status: 'done', previewUrl: `${d.preview_url}?t=${Date.now()}` })
      else           updBgm(name, { status: 'error' })
    } catch {
      clearTimeout(timerId)
      updBgm(name, { status: 'error' })
    }
  }

  const generateAll = async () => {
    // 音效：并行生成（ElevenLabs 约5秒/个）
    const sfxToGen = Object.keys(sfxItems).filter(n =>
      sfxItems[n].status === 'idle' || sfxItems[n].status === 'error'
    )
    sfxToGen.forEach(n => genSfx(n, false))

    // BGM：串行生成（MiniMax 约250秒/首，并发会叠加等待时间）
    const bgmToGen = Object.keys(bgmItems).filter(n =>
      bgmItems[n].status === 'idle' || bgmItems[n].status === 'error'
    )
    for (const n of bgmToGen) {
      await genBgm(n, false)
    }
  }

  const handleNext = () => {
    const sfxPrompts = {}
    const bgmPrompts = {}
    Object.entries(sfxItems).forEach(([n, v]) => { sfxPrompts[n] = v.prompt })
    Object.entries(bgmItems).forEach(([n, v]) => { bgmPrompts[n] = v.prompt })
    // sfxPaths/bgmPaths 让 Step5 跳过重复的库查询
    onNext({ ...data, sfxPrompts, bgmPrompts, sfxPaths, bgmPaths })
  }

  const hasItems      = sfx_list.length > 0 || bgm_list.length > 0
  const allDone       = !loading && hasItems &&
    Object.values(sfxItems).every(i => i.status === 'done') &&
    Object.values(bgmItems).every(i => i.status === 'done')
  const anyGenerating = Object.values(sfxItems).some(i => i.status === 'generating') ||
                        Object.values(bgmItems).some(i => i.status === 'generating')
  const anyIdle       = Object.values(sfxItems).some(i => i.status === 'idle' || i.status === 'error') ||
                        Object.values(bgmItems).some(i => i.status === 'idle' || i.status === 'error')

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="flex items-center gap-3 py-12 justify-center">
          <div className="w-5 h-5 border-2 border-[#E5007F] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-th-lo">正在生成提示词并查询素材库…</span>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl">{error}</p>
          <button onClick={onBack}
            className="border border-th-md text-th-md text-sm px-4 py-2 rounded-xl hover:bg-th-surface transition-colors">
            ← 返回
          </button>
        </div>
      ) : !hasItems ? (
        <div className="text-center py-10 text-th-lo text-sm">
          本集剧本中没有 BGM 和音效，可直接进入下一步
        </div>
      ) : (
        <>
          {/* ── 顶部操作行 ── */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-th-xlo leading-relaxed">
                {bgm_list.length > 0 && `${bgm_list.length} 首 BGM`}
                {bgm_list.length > 0 && sfx_list.length > 0 && ' · '}
                {sfx_list.length > 0 && `${sfx_list.length} 个音效`}
                {anyIdle && bgm_list.length > 0 && Object.values(bgmItems).some(i => i.status === 'idle' || i.status === 'error') && (
                  <>　·　BGM 每首约 4–5 分钟</>
                )}
              </p>
            </div>
            {anyIdle && (
              <button
                onClick={generateAll}
                disabled={anyGenerating}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all btn-press disabled:opacity-40"
                style={{
                  background: 'rgba(229,0,127,0.08)',
                  border:     '1px solid rgba(229,0,127,0.22)',
                  color:      'rgba(229,0,127,0.85)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L4.09 13H11L10 22L20.91 11H14L13 2Z" />
                </svg>
                一键生成全部
              </button>
            )}
          </div>

          {/* ── 生成中提示 ── */}
          {anyGenerating && bgm_list.length > 0 && Object.values(bgmItems).some(i => i.status === 'generating') && (
            <p className="text-[11px] text-amber-400/70 bg-amber-500/[0.06] border border-amber-500/12 px-3.5 py-2.5 rounded-xl leading-relaxed">
              BGM 串行生成中，约 {bgm_list.length * 4}–{bgm_list.length * 5} 分钟，请勿刷新页面
            </p>
          )}

          {bgm_list.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-[11px] font-semibold text-th-lo uppercase tracking-widest">BGM</h3>
              {bgm_list.map(n => (
                <MediaCard key={n} name={n} item={bgmItems[n] || { prompt: '', status: 'idle', previewUrl: null }}
                  onGenerate={(name, force) => genBgm(name, force)}
                  onPromptChange={(name, val) => updBgm(name, { prompt: val })} />
              ))}
            </div>
          )}

          {sfx_list.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-[11px] font-semibold text-th-lo uppercase tracking-widest">音效</h3>
              {sfx_list.map(n => (
                <MediaCard key={n} name={n} item={sfxItems[n] || { prompt: '', status: 'idle', previewUrl: null }}
                  onGenerate={(name, force) => genSfx(name, force)}
                  onPromptChange={(name, val) => updSfx(name, { prompt: val })} />
              ))}
            </div>
          )}

          {allDone && (
            <p className="text-xs text-emerald-400/80 bg-emerald-500/[0.08] border border-emerald-500/18 px-4 py-3 rounded-xl">
              全部生成完毕，可以试听后进入下一步
            </p>
          )}
        </>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onBack}
          className="flex-1 border border-th-md text-th-md hover:text-th-hi hover:bg-th-surface font-medium py-2.5 rounded-xl transition-colors">
          ← 返回
        </button>
        <button
          onClick={handleNext}
          disabled={!allDone}
          title={!allDone ? '请等待所有 BGM 和音效生成完毕后再继续' : ''}
          className={`flex-2 flex-grow font-semibold py-2.5 rounded-xl transition-all text-sm
            ${!allDone
              ? 'bg-th-surface text-th-xlo cursor-not-allowed border border-th-lo'
              : 'bg-gradient-to-r from-[#E5007F] to-[#C4006B] hover:from-[#FF2E9F] hover:to-[#E5007F] text-white shadow-lg shadow-[#E5007F]/20'}`}
        >
          {anyGenerating ? '生成中，请稍候…' : '下一步：生成音频剧'}
        </button>
      </div>
    </div>
  )
}

// ─── Step 5: 生成进度 + 下载 ─────────────────────────────────────────────────

function ProductionPage({ data, onBack }) {
  const storyName   = data?.storyName   ?? ''
  const episodeName = data?.episodeName ?? ''
  const script      = data?.script      ?? []
  const voiceMap    = data?.voiceMap    ?? {}
  const sfxPrompts  = data?.sfxPrompts  ?? null
  const bgmPrompts  = data?.bgmPrompts  ?? null
  const sfxPaths    = data?.sfxPaths    ?? {}
  const bgmPaths    = data?.bgmPaths    ?? {}
  const [taskId,      setTaskId]      = useState(null)
  const [events,      setEvents]      = useState([])
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [started,     setStarted]     = useState(false)
  const [error,       setError]       = useState('')

  const start = async () => {
    setStarted(true)
    setError('')
    try {
      const res = await fetch('/api/generate-audio', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          story_name:   storyName,
          episode_name: episodeName,
          script,
          voice_map:    voiceMap,
          sfx_prompts:  sfxPrompts,
          bgm_prompts:  bgmPrompts,
          sfx_paths:    sfxPaths,
          bgm_paths:    bgmPaths,
        }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setTaskId(d.task_id)
    } catch (e) {
      setError(e.message)
      setStarted(false)
    }
  }

  const onMessage = (msg) => {
    setEvents(prev => [...prev, msg])
    if (msg.download_url) setDownloadUrl(msg.download_url)
  }

  useSSE(taskId, onMessage)

  // 重置所有生成状态，回到"未开始"界面
  const restart = () => {
    setStarted(false)
    setTaskId(null)
    setEvents([])
    setDownloadUrl(null)
    setError('')
  }

  const isDone  = !!downloadUrl
  const hasFailed = events.some(e => e.stage === 'error')

  return (
    <div className="space-y-6">
      <div className="bg-th-surface border border-th-lo rounded-xl px-4 py-3 flex items-center gap-3 theme-transition">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-th-hi truncate">{storyName} · {episodeName}</p>
          <p className="text-[11px] text-th-lo mt-0.5">
            {script.filter(i => i.type === 'tts').length} 条台词 ·
            {script.filter(i => i.type === 'sfx').length} 个音效 ·
            {script.filter(i => i.type === 'bgm' && i.action === 'start').length} 首 BGM
          </p>
        </div>
      </div>

      {!started ? (
        <div className="space-y-3">
          <p className="text-th-lo text-sm text-center py-2">点击下方按钮开始自动生成，整个过程约需 5–15 分钟</p>
          <button onClick={start}
            className="w-full bg-gradient-to-r from-[#E5007F] to-[#C4006B] hover:from-[#FF2E9F] hover:to-[#E5007F] text-white font-semibold py-3.5 rounded-xl transition-all text-base shadow-xl shadow-[#E5007F]/25 btn-press font-cute">
            开始自动生成音频剧
          </button>
          <button onClick={onBack}
            className="w-full border border-th-lo text-th-lo text-sm py-2 rounded-xl hover:bg-th-surface transition-colors">
            ← 返回修改 BGM/音效
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ProgressTracker events={events} downloadUrl={downloadUrl} />

          {(isDone || hasFailed) && (
            <button onClick={restart}
              className="w-full flex items-center justify-center gap-2 border border-th-md text-th-md hover:text-th-hi hover:bg-th-surface text-sm font-medium py-2.5 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              重新生成
            </button>
          )}

          {!isDone && !hasFailed && (
            <button onClick={onBack}
              className="w-full border border-th-lo text-th-xlo text-xs py-2 rounded-xl hover:bg-th-surface transition-colors">
              ← 返回修改（后台任务继续运行）
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl">{error}</p>}
    </div>
  )
}

// ─── 主应用 ────────────────────────────────────────────────────────────────

export default function App() {
  const [step,          setStep]          = useState(1)
  const [stepData,      setStepData]      = useState({})
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [libraryOpen,   setLibraryOpen]   = useState(false)

  const goTo = (s, extra = {}) => {
    setStepData(prev => ({ ...prev, ...extra }))
    setStep(s)
  }

  return (
    <div className="h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>

      {/* ── 全屏云朵背景 ── */}
      <CloudCanvas className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }} />
      <div className="fixed inset-0 pointer-events-none" style={{
        zIndex: 1,
        background: 'rgba(252,246,250,0.82)',
      }} />

      <div className="relative h-full flex flex-col max-w-[980px] mx-auto px-8 py-6" style={{ zIndex: 2 }}>
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between mb-6 px-2 py-2">
          <div className="flex items-center gap-3">
            <div className="h-9 bg-white rounded-2xl px-3 flex items-center shadow-lg shrink-0"
                 style={{ boxShadow: '0 4px 20px rgba(229,0,127,0.22)' }}>
              <img src="/folotoy-logo.png" alt="FoloToy" className="h-5 w-auto" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setLibraryOpen(true)} title="素材库"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-th-lo hover:text-th-md hover:bg-th-surface border border-transparent hover:border-th-lo transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
              </svg>
            </button>
            <button onClick={() => setSettingsOpen(true)} title="API 设置"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-th-lo hover:text-th-md hover:bg-th-surface border border-transparent hover:border-th-lo transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          </div>
        </header>

        <div className="shrink-0 px-2 py-2 mb-4">
          <StepIndicator current={step} />
        </div>

        {/* ── FoloToy 英雄区：仅第 1 步展示 ── */}
        {step === 1 && (
          <div className="relative shrink-0 mb-4 py-6 animate-fade-in">

            {/* 品牌粉色光晕 */}
            <div className="absolute pointer-events-none" style={{
              left: '-5%', top: '0%', width: '55%', height: '100%',
              background: 'radial-gradient(ellipse at 35% 55%, rgba(229,0,127,0.11) 0%, transparent 65%)',
              filter: 'blur(28px)',
            }} />

            {/* 内容 */}
            <div className="relative">

              {/* 主标题 */}
              <h2 className="font-cute" style={{
                fontSize: 'clamp(28px, 4.2vw, 46px)',
                lineHeight: 1.25,
                fontWeight: 500,
                color: '#18060F',
              }}>
                把任何故事，<br />
                <span style={{
                  background: 'linear-gradient(125deg, #FF8EC8 0%, #E5007F 55%, #C4006B 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>变成孩子的声音世界</span>
              </h2>

            </div>
          </div>
        )}

        <div
          className="flex-1 min-h-0 flex flex-col rounded-2xl animate-fade-in-up overflow-y-auto"
          style={{
            background: 'var(--bg-card)',
            border:     '1px solid var(--border-lo)',
            boxShadow:  '0 8px 40px rgba(229,0,127,0.06)',
          }}
        >
          <div className="flex-1 min-h-0 flex flex-col p-8">
          {step === 1 && (
            <InputPage onNext={d => goTo(2, d)} />
          )}
          {step === 2 && (
            <ReviewPage
              data={stepData}
              onNext={d => goTo(3, d)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <VoicePage
              data={stepData}
              onNext={d => goTo(4, d)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <MediaPage
              data={stepData}
              onNext={d => goTo(5, d)}
              onBack={() => setStep(3)}
            />
          )}
          {step === 5 && (
            <ProductionPage data={stepData} onBack={() => setStep(4)} />
          )}
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {libraryOpen  && <LibraryModal  onClose={() => setLibraryOpen(false)}  />}
    </div>
  )
}
