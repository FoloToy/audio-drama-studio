import { useState, useRef, useEffect } from 'react'

function VoiceRow({ voice, isSelected, onSelect }) {
  const audioRef   = useRef(null)
  const [playing, setPlaying] = useState(false)

  function togglePreview(e) {
    e.stopPropagation()
    if (!voice.has_preview) return
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
    } else {
      audio.play().catch(() => {})
      setPlaying(true)
    }
  }

  return (
    <div
      onClick={() => onSelect(voice)}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
        ${isSelected
          ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
        }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 text-sm">{voice.name}</span>
          {isSelected && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-medium shrink-0 border border-violet-500/20">
              已选
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-600 truncate mt-0.5">{voice.description || '暂无描述'}</p>
      </div>

      {voice.has_preview ? (
        <button
          onClick={togglePreview}
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all
            ${playing
              ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
              : 'bg-white/[0.06] text-slate-400 hover:bg-violet-500/10 hover:text-violet-400'
            }`}
          title="试听"
        >
          {playing ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          )}
        </button>
      ) : (
        <span className="shrink-0 w-7 h-7 rounded-full bg-white/[0.03] flex items-center justify-center" title="暂无试听">
          <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
        </span>
      )}

      <div className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all
        ${isSelected ? 'border-violet-500 bg-violet-500' : 'border-white/20'}`}>
        {isSelected && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {voice.has_preview && (
        <audio
          ref={audioRef}
          src={`/api/voices/${encodeURIComponent(voice.voice_id)}/preview`}
          onEnded={() => setPlaying(false)}
          preload="none"
        />
      )}
    </div>
  )
}


function AddVoiceForm({ onAdded, onCancel }) {
  const [voiceId,     setVoiceId]     = useState('')
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [audioFile,   setAudioFile]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const fileRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!voiceId.trim() || !name.trim()) { setError('音色 ID 和名称不能为空'); return }
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('voice_id',    voiceId.trim())
      fd.append('name',        name.trim())
      fd.append('description', description.trim())
      if (audioFile) fd.append('audio', audioFile)
      const res  = await fetch('/api/voices', { method: 'POST', body: fd })
      const ct   = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) throw new Error('后端未响应，请重启后端服务')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '添加失败')
      onAdded(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full text-xs bg-[#0D0D15] border border-white/[0.07] text-slate-300 placeholder:text-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/30 transition-all"

  return (
    <form onSubmit={handleSubmit} className="border border-violet-500/20 bg-violet-500/[0.04] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-violet-400 uppercase tracking-widest">添加新音色</h4>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-600 mb-1 block">音色 ID <span className="text-rose-400">*</span></label>
          <input type="text" value={voiceId} onChange={e => setVoiceId(e.target.value)}
            placeholder="zh_female_xxx_bigtts" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] text-slate-600 mb-1 block">音色名称 <span className="text-rose-400">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="如：旁白（温柔女声）" className={inputCls} />
        </div>
      </div>

      <div>
        <label className="text-[11px] text-slate-600 mb-1 block">音色描述</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="如：温柔清晰的女声，适合旁白和讲故事" className={inputCls} />
      </div>

      <div>
        <label className="text-[11px] text-slate-600 mb-1 block">试听音频（可选）</label>
        <div
          className="flex items-center gap-2 border border-dashed border-white/[0.08] rounded-lg px-3 py-2.5 cursor-pointer hover:border-violet-500/30 hover:bg-violet-500/[0.04] transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-4 h-4 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
          <span className="text-[11px] text-slate-600 flex-1 truncate">
            {audioFile ? audioFile.name : '点击上传 MP3 / WAV 预览音频'}
          </span>
          {audioFile && (
            <button type="button" onClick={e => { e.stopPropagation(); setAudioFile(null) }}
              className="text-slate-600 hover:text-rose-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden"
          onChange={e => setAudioFile(e.target.files?.[0] || null)} />
      </div>

      {error && <p className="text-[11px] text-rose-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 text-xs border border-white/[0.08] text-slate-500 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
          取消
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 text-xs bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 disabled:text-violet-600 text-white py-1.5 rounded-lg transition-colors font-semibold">
          {saving ? '保存中…' : '保存音色'}
        </button>
      </div>
    </form>
  )
}


export default function VoicePickerModal({ characterName, currentVoiceId, onConfirm, onClose }) {
  const [voices,      setVoices]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selectedId,  setSelectedId]  = useState(currentVoiceId || '')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => { loadVoices() }, [])

  async function loadVoices() {
    setLoading(true)
    try {
      const res = await fetch('/api/voices')
      const ct  = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) throw new Error('后端未响应')
      const data = await res.json()
      setVoices(Array.isArray(data) ? data : [])
    } catch {
      setVoices([])
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(voice, e) {
    e.stopPropagation()
    if (!confirm(`确定删除音色「${voice.name}」？`)) return
    await fetch(`/api/voices/${encodeURIComponent(voice.voice_id)}`, { method: 'DELETE' })
    setVoices(vs => vs.filter(v => v.voice_id !== voice.voice_id))
    if (selectedId === voice.voice_id) setSelectedId('')
  }

  function handleAdded(newVoice) {
    setVoices(vs => {
      const idx = vs.findIndex(v => v.voice_id === newVoice.voice_id)
      const entry = { ...newVoice, has_preview: !!newVoice.preview_file }
      if (idx >= 0) { const u = [...vs]; u[idx] = entry; return u }
      return [...vs, entry]
    })
    setSelectedId(newVoice.voice_id)
    setShowAddForm(false)
  }

  const selectedVoice = voices.find(v => v.voice_id === selectedId)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#13131A] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">选择音色</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">
              为「<span className="text-violet-400 font-semibold">{characterName}</span>」选择音色
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          ) : voices.length === 0 && !showAddForm ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">音色库为空</p>
              <p className="text-xs text-slate-700 mt-1">请先添加音色</p>
            </div>
          ) : (
            voices.map(voice => (
              <div key={voice.voice_id} className="relative group">
                <VoiceRow voice={voice} isSelected={selectedId === voice.voice_id} onSelect={v => setSelectedId(v.voice_id)} />
                <button
                  onClick={e => handleDelete(voice, e)}
                  className="absolute top-2.5 right-10 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  title="删除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
          {showAddForm && <AddVoiceForm onAdded={handleAdded} onCancel={() => setShowAddForm(false)} />}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06] space-y-3">
          {!showAddForm && (
            <button onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 border border-dashed border-white/[0.08] hover:border-violet-500/30 hover:bg-violet-500/[0.04] rounded-xl py-2 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              添加新音色
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] text-sm font-medium py-2 rounded-xl transition-colors">
              取消
            </button>
            <button
              onClick={() => { if (selectedVoice) onConfirm(selectedVoice) }}
              disabled={!selectedId}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:bg-white/[0.05] disabled:text-slate-700 text-white text-sm font-semibold py-2 rounded-xl transition-all shadow-lg shadow-violet-500/20 disabled:shadow-none">
              {selectedId ? '确认选择' : '请先选择'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
