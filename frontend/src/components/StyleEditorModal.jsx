import { useState, useEffect, useRef } from 'react'

/**
 * 风格 Prompt 编辑器弹窗
 * Props:
 *   styleId    - "sunjingxiu" | "blog"
 *   styleTitle - 显示名称
 *   onClose    - 关闭回调
 */
const C = {
  bg:         '#FEFCFD',
  surface:    '#F5EFF2',
  border:     'rgba(0,0,0,0.09)',
  borderIn:   'rgba(0,0,0,0.13)',
  textHi:     '#18060F',
  textMd:     '#4B2535',
  textLo:     '#7C526A',
  textXlo:    '#A07888',
}

export default function StyleEditorModal({ styleId, styleTitle, onClose }) {
  const [content,      setContent]      = useState('')
  const [original,     setOriginal]     = useState('')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saveOk,       setSaveOk]       = useState(false)
  const [error,        setError]        = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const textareaRef = useRef(null)

  const isDirty = content !== original

  useEffect(() => {
    fetch(`/api/styles/${styleId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setContent(d.content)
        setOriginal(d.content)
        setLoading(false)
        requestAnimationFrame(() => textareaRef.current?.focus())
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [styleId])

  const handleSave = async () => {
    setSaving(true); setError(''); setSaveOk(false)
    try {
      const res  = await fetch(`/api/styles/${styleId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOriginal(content)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => { setContent(original); setConfirmClose(false) }

  const tryClose = () => {
    if (isDirty) { setConfirmClose(true) } else { onClose() }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) tryClose() }}
    >
      <div
        className="w-full max-w-2xl mx-4 flex flex-col rounded-2xl animate-slide-up-modal"
        style={{
          maxHeight:  '90vh',
          background: C.bg,
          border:     `1px solid ${C.border}`,
          boxShadow:  '0 24px 60px rgba(0,0,0,0.28), 0 4px 16px rgba(229,0,127,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
             style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 className="text-sm font-bold font-cute" style={{ color: C.textHi }}>编辑风格 Prompt</h2>
            <p className="text-[11px] mt-0.5" style={{ color: C.textXlo }}>{styleTitle} · 修改后保存立即生效</p>
          </div>
          <button
            onClick={tryClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-black/[0.06]"
            style={{ color: C.textLo }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden px-6 py-4 flex flex-col min-h-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 border-2 border-[#E5007F] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => { setContent(e.target.value); setConfirmClose(false) }}
              className="flex-1 w-full rounded-xl px-4 py-3 text-xs font-mono leading-relaxed resize-none outline-none transition-all"
              style={{
                background: C.surface,
                border:     `1px solid ${C.borderIn}`,
                color:      C.textHi,
                caretColor: '#E5007F',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(229,0,127,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(229,0,127,0.10)' }}
              onBlur={e  => { e.target.style.borderColor = C.borderIn;               e.target.style.boxShadow = 'none' }}
              spellCheck={false}
            />
          )}
        </div>

        {/* Unsaved changes warning */}
        {confirmClose && (
          <div className="mx-6 mb-3 px-4 py-3 rounded-xl flex items-center justify-between gap-3"
               style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <p className="text-xs text-amber-600">有未保存的修改，确定丢弃？</p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setConfirmClose(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-amber-600 hover:bg-amber-50"
                style={{ border: '1px solid rgba(245,158,11,0.30)' }}
              >
                继续编辑
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
              >
                丢弃修改
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3 shrink-0"
             style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs" style={{ color: C.textXlo }}>{content.length} 字</span>
            {isDirty && !confirmClose && (
              <span className="text-xs text-amber-500">● 有未保存的修改</span>
            )}
            {saveOk && (
              <span className="text-xs text-emerald-600">✓ 已保存</span>
            )}
            {error && (
              <span className="text-xs text-rose-500">{error}</span>
            )}
          </div>

          <button
            onClick={handleReset}
            disabled={!isDirty || loading}
            className="px-4 py-2 text-xs rounded-xl transition-all btn-press disabled:opacity-30 hover:bg-black/[0.05]"
            style={{ color: C.textMd, border: `1px solid ${C.borderIn}` }}
          >
            撤销修改
          </button>
          <button
            onClick={tryClose}
            className="px-4 py-2 text-xs rounded-xl transition-all btn-press hover:bg-black/[0.05]"
            style={{ color: C.textMd, border: `1px solid ${C.borderIn}` }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !isDirty}
            className="px-5 py-2 text-xs font-semibold rounded-xl transition-all btn-press flex items-center gap-2"
            style={{
              background: saving || loading || !isDirty ? C.surface : 'linear-gradient(135deg,#E5007F,#C4006B)',
              color:      saving || loading || !isDirty ? C.textXlo  : '#fff',
              boxShadow:  saving || loading || !isDirty ? 'none'     : '0 4px 14px rgba(229,0,127,0.30)',
            }}
          >
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
