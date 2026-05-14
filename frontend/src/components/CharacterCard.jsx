import { useRef, useState } from 'react'

const IMPORTANCE_COLOR = {
  '必须': 'bg-red-100 text-red-700',
  '主要': 'bg-indigo-100 text-indigo-700',
  '次要': 'bg-gray-100 text-gray-500',
}

export default function CharacterCard({ character, assignedVoice, onChangeVoice }) {
  const audioRef  = useRef(null)
  const [playing, setPlaying] = useState(false)

  function togglePreview(e) {
    e.stopPropagation()
    if (!assignedVoice?.has_preview) return
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
    <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
      {/* 角色信息 */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-800">{character.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
          ${IMPORTANCE_COLOR[character.importance] || 'bg-gray-100 text-gray-500'}`}>
          {character.importance}
        </span>
        <span className="text-xs text-gray-400 ml-auto">{character.lines_count} 条台词</span>
      </div>

      {/* 已选音色 */}
      {assignedVoice ? (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          {/* 试听按钮 */}
          <button
            onClick={togglePreview}
            disabled={!assignedVoice.has_preview}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors
              ${assignedVoice.has_preview
                ? playing
                  ? 'bg-indigo-500 text-white'
                  : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            title={assignedVoice.has_preview ? '试听音色' : '暂无试听音频'}
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

          {/* 音色名称 + 描述 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">{assignedVoice.name}</p>
            {assignedVoice.description && (
              <p className="text-xs text-gray-400 truncate">{assignedVoice.description}</p>
            )}
          </div>

          {/* 更改按钮 */}
          <button
            onClick={onChangeVoice}
            className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
          >
            更改
          </button>
        </div>
      ) : (
        <button
          onClick={onChangeVoice}
          className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg py-2 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          选择音色
        </button>
      )}

      {/* 隐藏 audio 元素 */}
      {assignedVoice?.has_preview && (
        <audio
          ref={audioRef}
          src={`/api/voices/${encodeURIComponent(assignedVoice.voice_id)}/preview`}
          onEnded={() => setPlaying(false)}
          preload="none"
        />
      )}
    </div>
  )
}
