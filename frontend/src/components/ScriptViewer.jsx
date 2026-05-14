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
    <div className="h-full overflow-y-auto space-y-1 pr-1">
      {script.map((item, i) => {

        /* ── BGM ── */
        if (item.type === 'bgm') {
          const isStop = item.action === 'stop'
          if (isStop) return (
            <div key={i} className="px-3 py-1 text-xs text-th-xlo italic select-none">
              ▪ BGM 停止
            </div>
          )
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              text-[#FF3BA8] font-medium bg-[#E5007F]/[0.08]">
              <span className="shrink-0">🎵 BGM：</span>
              {editable ? (
                <input
                  className="flex-1 bg-transparent border-b border-[#E5007F]/30 outline-none
                    focus:border-[#FF3BA8] text-sm min-w-0 text-[#FF70BF]"
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
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              text-amber-400 bg-amber-500/[0.08] font-medium">
              <span className="shrink-0">🔊 音效：</span>
              {editable ? (
                <input
                  className="flex-1 bg-transparent border-b border-amber-500/30 outline-none
                    focus:border-amber-400 text-sm min-w-0 text-amber-300"
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
            <div key={i} className={`flex gap-3 py-2.5 ${editable ? 'items-start' : 'items-baseline'}`}>
              <span className={`shrink-0 font-semibold w-16 text-right text-sm leading-7
                ${isNarrator ? 'text-th-lo' : 'text-[#FF3BA8]'}`}>
                {item.speaker}：
              </span>
              {editable ? (
                <textarea
                  className="flex-1 text-th-hi leading-relaxed resize-none text-sm
                    border border-transparent rounded-lg px-2 py-1
                    hover:border-white/[0.1] focus:border-[#E5007F]/40 focus:outline-none
                    focus:ring-1 focus:ring-[#E5007F]/20 bg-transparent transition-colors"
                  value={item.text ?? ''}
                  onChange={e => update(i, { text: e.target.value })}
                  rows={Math.max(2, Math.ceil((item.text?.length ?? 0) / 40))}
                />
              ) : (
                <span className="text-th-hi leading-relaxed text-sm">{item.text}</span>
              )}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
