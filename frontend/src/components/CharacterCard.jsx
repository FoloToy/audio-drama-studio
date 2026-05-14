import { useRef, useState } from 'react'

const IMPORTANCE_STYLE = {
  '必须': 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  '主要': 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  '次要': 'bg-white/5 text-slate-500 border border-white/[0.08]',
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
    <div className="bg-[#1A1A28] border border-white/[0.07] rounded-xl p-4 space-y-3 hover:border-white/[0.12] transition-colors">
      {/* 角色信息 */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-200 text-sm">{character.name}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium
          ${IMPORTANCE_STYLE[character.importance] || IMPORTANCE_STYLE['次要']}`}>
          {character.importance}
        </span>
        <span className="text-[11px] text-slate-600 ml-auto">{character.lines_count} 条</span>
      </div>

      {/* 已选音色 */}
      {assignedVoice ? (
        <div className="flex items-center gap-2.5 bg-[#0D0D15] rounded-lg px-3 py-2.5 border border-white/[0.05]">
          {/* 试听按钮 */}
          <button
            onClick={togglePreview}
            disabled={!assignedVoice.has_preview}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all
              ${assignedVoice.has_preview
                ? playing
                  ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                  : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20'
                : 'bg-white/[0.03] text-slate-700 cursor-not-allowed border border-white/[0.05]'
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
            <p className="text-xs font-semibold text-slate-300 truncate">{assignedVoice.name}</p>
            {assignedVoice.description && (
              <p className="text-[11px] text-slate-600 truncate mt-0.5">{assignedVoice.description}</p>
            )}
          </div>

          {/* 更改按钮 */}
          <button
            onClick={onChangeVoice}
            className="shrink-0 text-[11px] text-slate-500 hover:text-violet-400 font-medium px-2 py-1 rounded-md hover:bg-violet-500/10 transition-colors border border-white/[0.06] hover:border-violet-500/30"
          >
            更改
          </button>
        </div>
      ) : (
        <button
          onClick={onChangeVoice}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-600 border border-dashed border-white/[0.08] rounded-lg py-2.5 hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/[0.05] transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          选择音色
        </button>
      )}

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
