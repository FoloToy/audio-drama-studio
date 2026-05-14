/**
 * ScriptViewer — 剧本查看 / 编辑组件
 * editable=false  只读展示
 * editable=true   每条 TTS 台词可直接编辑，BGM/SFX 名称可编辑
 * onChange(newScript) 在 editable 模式下回调
 */
export default function ScriptViewer({ script, editable = false, onChange }) {
  if (!script?.length) return null

  const update = (i, patch) => {
    if (!onChange) return
    onChange(script.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  }

  return (
    <div className="text-sm space-y-0.5 max-h-[28rem] overflow-y-auto pr-1">
      {script.map((item, i) => {

        /* ── BGM ── */
        if (item.type === 'bgm') {
          const isStop = item.action === 'stop'
          if (isStop) return (
            <div key={i} className="px-2 py-0.5 text-xs text-slate-600 italic select-none">
              ▪ BGM 停止
            </div>
          )
          return (
            <div key={i} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
              text-violet-400 font-medium bg-violet-500/[0.08]">
              <span className="shrink-0">🎵 BGM：</span>
              {editable ? (
                <input
                  className="flex-1 bg-transparent border-b border-violet-500/30 outline-none
                    focus:border-violet-400 text-xs min-w-0 text-violet-300"
                  value={item.name ?? ''}
                  onChange={e => update(i, { name: e.target.value })}
                />
              ) : (
                <span>{item.name}</span>
              )}
            </div>
          )
        }

        /* ── SFX ── */
        if (item.type === 'sfx') {
          return (
            <div key={i} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
              text-amber-400 bg-amber-500/[0.08] font-medium">
              <span className="shrink-0">🔊 音效：</span>
              {editable ? (
                <input
                  className="flex-1 bg-transparent border-b border-amber-500/30 outline-none
                    focus:border-amber-400 text-xs min-w-0 text-amber-300"
                  value={item.name ?? ''}
                  onChange={e => update(i, { name: e.target.value })}
                />
              ) : (
                <span>{item.name}</span>
              )}
            </div>
          )
        }

        /* ── TTS ── */
        if (item.type === 'tts') {
          const isNarrator = item.speaker === '旁白'
          return (
            <div key={i} className={`flex gap-2 py-0.5 ${editable ? 'items-start' : 'items-baseline'}`}>
              <span className={`shrink-0 font-medium w-14 text-right text-xs leading-6
                ${isNarrator ? 'text-slate-500' : 'text-violet-400'}`}>
                {item.speaker}：
              </span>
              {editable ? (
                <textarea
                  className="flex-1 text-slate-300 leading-relaxed resize-none text-xs
                    border border-transparent rounded px-1.5 py-0.5
                    hover:border-white/[0.1] focus:border-violet-500/40 focus:outline-none
                    focus:ring-1 focus:ring-violet-500/20 bg-transparent transition-colors"
                  value={item.text ?? ''}
                  onChange={e => update(i, { text: e.target.value })}
                  rows={Math.max(2, Math.ceil((item.text?.length ?? 0) / 36))}
                />
              ) : (
                <span className="text-slate-400 leading-relaxed">{item.text}</span>
              )}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
