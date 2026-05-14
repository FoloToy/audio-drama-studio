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
  const [confirmClose, setConfirmClose] = useState(false)  // 未保存时的关闭确认条
  const textareaRef = useRef(null)

  const isDirty = content !== original

  // 加载 prompt 内容
  useEffect(() => {
    fetch(`/api/styles/${styleId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setContent(d.content)
        setOriginal(d.content)
        setLoading(false)
        // 加载完成后聚焦 textarea
        requestAnimationFrame(() => textareaRef.current?.focus())
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [styleId])

  // 保存
  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaveOk(false)
    try {
      const res  = await fetch(`/api/styles/${styleId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOriginal(content)   // 标记为已保存
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // 重置为原始内容
  const handleReset = () => {
    setContent(original)
    setConfirmClose(false)
  }

  // 尝试关闭：有未保存修改则先确认
  const tryClose = () => {
    if (isDirty) {
      setConfirmClose(true)
    } else {
      onClose()
    }
  }

  // 点击遮罩关闭
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) tryClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col"
           style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">编辑风格 Prompt</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {styleTitle} · 修改后保存立即生效
            </p>
          </div>
          <button
            onClick={tryClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
              hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden px-6 py-4 flex flex-col min-h-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => { setContent(e.target.value); setConfirmClose(false) }}
              className="flex-1 w-full border border-gray-200 rounded-xl px-4 py-3
                text-sm font-mono leading-relaxed resize-none
                focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200
                transition-colors"
              spellCheck={false}
            />
          )}
        </div>

        {/* 关闭确认条（有未保存修改时出现） */}
        {confirmClose && (
          <div className="mx-6 mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl
            flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800">有未保存的修改，确定丢弃？</p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setConfirmClose(false)}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300
                  rounded-lg hover:bg-amber-100 transition-colors"
              >
                继续编辑
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500
                  hover:bg-amber-600 rounded-lg transition-colors"
              >
                丢弃修改
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          {/* 字数 + 错误/成功提示 */}
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-gray-400">{content.length} 字</span>
            {isDirty && !confirmClose && (
              <span className="text-xs text-amber-600">● 有未保存的修改</span>
            )}
            {saveOk && (
              <span className="text-xs text-green-600">✓ 已保存</span>
            )}
            {error && (
              <span className="text-xs text-red-500">{error}</span>
            )}
          </div>

          <button
            onClick={handleReset}
            disabled={!isDirty || loading}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg
              hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            撤销修改
          </button>
          <button
            onClick={tryClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg
              hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !isDirty}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600
              hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400
              rounded-lg transition-colors flex items-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
