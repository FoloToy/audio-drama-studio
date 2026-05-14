import { useState, useEffect, useRef } from 'react'

/**
 * 风格 Prompt 编辑器弹窗
 * Props:
 *   styleId    - "sunjingxiu" | "blog"
 *   styleTitle - 显示名称
 *   onClose    - 关闭回调
 */
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) tryClose() }}
    >
      <div className="bg-th-card border border-th-md rounded-2xl shadow-2xl shadow-black/60 w-full max-w-2xl mx-4 flex flex-col theme-transition animate-slide-up-modal"
           style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-th-lo shrink-0">
          <div>
            <h2 className="text-sm font-bold text-th-hi font-cute">编辑风格 Prompt</h2>
            <p className="text-[11px] text-th-xlo mt-0.5">{styleTitle} · 修改后保存立即生效</p>
          </div>
          <button
            onClick={tryClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-th-xlo
              hover:text-th-md hover:bg-th-surface transition-all"
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
              className="flex-1 w-full bg-th-deep border border-th-lo rounded-xl px-4 py-3
                text-xs font-mono leading-relaxed text-th-md placeholder:text-th-xlo resize-none
                focus:outline-none focus:ring-1 focus:ring-[#E5007F]/50 focus:border-[#E5007F]/40
                transition-all"
              spellCheck={false}
            />
          )}
        </div>

        {/* Unsaved changes warning */}
        {confirmClose && (
          <div className="mx-6 mb-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl
            flex items-center justify-between gap-3">
            <p className="text-xs text-amber-400">有未保存的修改，确定丢弃？</p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setConfirmClose(false)}
                className="px-3 py-1.5 text-xs font-medium text-amber-400 border border-amber-500/30
                  rounded-lg hover:bg-amber-500/10 transition-colors"
              >
                继续编辑
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500/80
                  hover:bg-amber-500 rounded-lg transition-colors"
              >
                丢弃修改
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-th-lo flex items-center gap-3 shrink-0">
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-th-xlo">{content.length} 字</span>
            {isDirty && !confirmClose && (
              <span className="text-xs text-amber-500">● 有未保存的修改</span>
            )}
            {saveOk && (
              <span className="text-xs text-emerald-400">✓ 已保存</span>
            )}
            {error && (
              <span className="text-xs text-rose-400">{error}</span>
            )}
          </div>

          <button
            onClick={handleReset}
            disabled={!isDirty || loading}
            className="px-4 py-2 text-xs text-th-md border border-th-md rounded-xl
              hover:bg-th-surface hover:text-th-hi disabled:opacity-30 transition-all btn-press"
          >
            撤销修改
          </button>
          <button
            onClick={tryClose}
            className="px-4 py-2 text-xs text-th-md border border-th-md rounded-xl
              hover:bg-th-surface hover:text-th-hi transition-all btn-press"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !isDirty}
            className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#E5007F] to-[#C4006B]
              hover:from-[#FF2E9F] hover:to-[#E5007F]
              disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-th-xlo
              rounded-xl transition-all shadow-lg shadow-[#E5007F]/20 disabled:shadow-none btn-press flex items-center gap-2"
          >
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
