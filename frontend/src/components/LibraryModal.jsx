import { useState, useEffect } from 'react'

function MusicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m9 19-7-7 7-7m5 14 7-7-7-7" />
    </svg>
  )
}

function SfxIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  )
}

function EmptyState({ type }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
        {type === 'bgm' ? (
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
          </svg>
        ) : (
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-gray-500">
        {type === 'bgm' ? 'BGM 库为空' : '音效库为空'}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        生成后会自动存入素材库，下次可以直接复用
      </p>
    </div>
  )
}

function AssetItem({ name, entry, type, onDelete }) {
  const [playing,    setPlaying]    = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [audio]  = useState(() => new Audio(`/api/preview/${type}/${encodeURIComponent(name)}`))

  useEffect(() => {
    audio.onended = () => setPlaying(false)
    return () => { audio.pause(); audio.onended = null }
  }, [audio])

  // 点其他地方取消确认态
  useEffect(() => {
    if (!confirming) return
    const cancel = () => setConfirming(false)
    document.addEventListener('click', cancel)
    return () => document.removeEventListener('click', cancel)
  }, [confirming])

  const toggle = () => {
    if (playing) {
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
    } else {
      audio.play().catch(() => {})
      setPlaying(true)
    }
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (confirming) {
      onDelete(name)
    } else {
      setConfirming(true)
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200 transition-all group">
      {/* Play button */}
      <button
        onClick={toggle}
        className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all
          ${playing
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
            : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
      >
        {playing ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7-.75a.75.75 0 0 0-.75.75v13.5c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V5.25a.75.75 0 0 0-.75-.75h-1.25Z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-4 h-4 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
          {entry.added && entry.added !== 'unknown' && (
            <span className="text-[10px] text-gray-400 shrink-0">{entry.added.slice(0, 10)}</span>
          )}
        </div>
        {entry.prompt ? (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{entry.prompt}</p>
        ) : (
          <p className="text-xs text-gray-300 mt-0.5 italic">无描述</p>
        )}
      </div>

      {/* Delete — 两步确认 */}
      {confirming ? (
        <button
          onClick={handleDeleteClick}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
            bg-red-500 text-white hover:bg-red-600 transition-all animate-pulse"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          确认删除
        </button>
      ) : (
        <button
          onClick={handleDeleteClick}
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
            text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all
            opacity-0 group-hover:opacity-100"
          title="从库中移除"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default function LibraryModal({ onClose }) {
  const [tab,     setTab]     = useState('bgm')
  const [library, setLibrary] = useState({ bgm: {}, sfx: {}, bgm_count: 0, sfx_count: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/library')
      .then(r => r.json())
      .then(d => { setLibrary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    setSyncing(true)
    await fetch('/api/library/sync', { method: 'POST' })
    load()
    setSyncing(false)
  }

  const handleDelete = async (type, name) => {
    await fetch(`/api/library/${type}/${encodeURIComponent(name)}`, { method: 'DELETE' })
    load()
  }

  const items = tab === 'bgm' ? library.bgm : library.sfx
  const entries = Object.entries(items)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col"
           style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">本地素材库</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              BGM {library.bgm_count} 首 · 音效 {library.sfx_count} 个
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              title="同步磁盘文件到库"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 shrink-0">
          {[
            { id: 'bgm', label: 'BGM', count: library.bgm_count, color: 'indigo' },
            { id: 'sfx', label: '音效', count: library.sfx_count, color: 'emerald' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab === t.id
                  ? t.id === 'bgm'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {t.id === 'bgm' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              )}
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal
                ${tab === t.id
                  ? t.id === 'bgm' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2 min-h-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState type={tab} />
          ) : (
            entries.map(([name, entry]) => (
              <AssetItem
                key={name}
                name={name}
                entry={entry}
                type={tab}
                onDelete={(n) => handleDelete(tab, n)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 shrink-0">
          <p className="text-xs text-gray-400 text-center">
            新生成的素材会自动入库 · 下次生成时 AI 会优先复用库中的素材
          </p>
        </div>
      </div>
    </div>
  )
}
