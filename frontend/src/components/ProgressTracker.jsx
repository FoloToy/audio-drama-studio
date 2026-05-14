import { useMemo } from 'react'

const STAGES = [
  { key: 'prompt',      icon: '🤖', label: '生成提示词',     service: 'DeepSeek / Claude' },
  { key: 'sfx_library', icon: '🔍', label: '查询音效素材库', service: 'AI 语义匹配' },
  { key: 'bgm_library', icon: '🔍', label: '查询BGM素材库',  service: 'AI 语义匹配' },
  { key: 'sfx',         icon: '🔊', label: '生成音效',       service: 'ElevenLabs' },
  { key: 'bgm',         icon: '🎵', label: '生成BGM',        service: 'MiniMax music-2.6' },
  { key: 'tts',         icon: '🎤', label: '合成台词语音',   service: '豆包 TTS 2.0' },
  { key: 'mix',         icon: '🎛️', label: '混音合成',      service: '' },
]

function ProgressBar({ cur, total, done = false }) {
  const pct = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0
  return (
    <div className="mt-2 space-y-0.5">
      <div className="flex justify-between text-[11px]">
        <span className={done ? 'text-emerald-500' : 'text-violet-400'}>{cur} / {total}</span>
        <span className={done ? 'text-emerald-500' : 'text-violet-400'}>{pct}%</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ItemRow({ name, status }) {
  const isOk  = status === 'done' || status === 'skipped'
  const isErr = status === 'error'
  return (
    <div className="text-[11px] flex gap-1.5 items-center min-w-0">
      <span className={`shrink-0 font-bold ${isOk ? 'text-emerald-400' : isErr ? 'text-rose-400' : 'text-violet-400'}`}>
        {isOk ? '✓' : isErr ? '✗' : '…'}
      </span>
      <span className="text-slate-500 truncate">{name}</span>
      {status === 'skipped' && <span className="text-slate-600 shrink-0 ml-auto">已缓存</span>}
    </div>
  )
}

export default function ProgressTracker({ events, downloadUrl }) {
  const st = useMemo(() => {
    const status   = {}
    const items    = {}
    const progress = {}
    const msg      = {}

    for (const ev of events) {
      const s = ev.stage
      if (!s || s === 'heartbeat') continue
      status[s] = ev.status
      if (ev.message) msg[s] = ev.message
      if (ev.progress !== undefined && ev.total !== undefined) {
        progress[s] = { cur: ev.progress, total: ev.total }
      }
      if (ev.success !== undefined && ev.total !== undefined && !progress[s]) {
        progress[s] = { cur: ev.success, total: ev.total }
      }
      if (ev.item) {
        if (!items[s]) items[s] = []
        items[s].push({ name: ev.item, status: ev.status })
      }
    }
    return { status, items, progress, msg }
  }, [events])

  return (
    <div className="space-y-2">
      {STAGES.map(({ key, icon, label, service }) => {
        const status  = st.status[key]
        const items   = st.items[key]   || []
        const prog    = st.progress[key]
        const msg     = st.msg[key]

        const isActive  = ['generating', 'start', 'progress', 'matching'].includes(status)
        const isDone    = status === 'done' || status === 'skipped'
        const isError   = status === 'error'
        const isPending = !status

        const recentItems = items.slice(-8)
        const doneCount   = items.filter(i => i.status === 'done' || i.status === 'skipped').length
        const errorCount  = items.filter(i => i.status === 'error').length

        return (
          <div
            key={key}
            className={`rounded-xl border px-4 py-3 transition-all
              ${isPending ? 'border-white/[0.04] bg-white/[0.01] opacity-35' :
                isActive  ? 'border-violet-500/25 bg-violet-500/[0.06]' :
                isDone    ? 'border-emerald-500/20 bg-emerald-500/[0.05]' :
                isError   ? 'border-rose-500/20 bg-rose-500/[0.06]' :
                            'border-white/[0.06] bg-white/[0.02]'}`}
          >
            {/* Title row */}
            <div className="flex items-center gap-2">
              {isActive ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent
                  rounded-full animate-spin shrink-0" />
              ) : (
                <span className="text-sm shrink-0">{icon}</span>
              )}

              <span className={`font-medium text-xs flex-1
                ${isPending ? 'text-slate-700' :
                  isActive  ? 'text-violet-300' :
                  isDone    ? 'text-emerald-400' :
                  isError   ? 'text-rose-400' :
                              'text-slate-400'}`}>
                {label}
              </span>

              {service && (
                <span className="text-[11px] text-slate-700 shrink-0 hidden sm:inline">{service}</span>
              )}

              {isDone && prog && (
                <span className="text-[11px] text-emerald-500 font-medium shrink-0 ml-1">
                  {doneCount}/{prog.total}
                  {errorCount > 0 && <span className="text-amber-400 ml-1">({errorCount}失败)</span>}
                </span>
              )}
              {isDone && !prog && !items.length && (
                <span className="text-[11px] text-emerald-500 shrink-0 ml-1">完成</span>
              )}
              {isError && (
                <span className="text-[11px] text-rose-400 shrink-0 ml-1">失败</span>
              )}
            </div>

            {isActive && prog && <ProgressBar cur={prog.cur} total={prog.total} />}
            {isDone && prog && prog.total > 1 && <ProgressBar cur={prog.cur} total={prog.total} done />}

            {isActive && msg && !prog && (
              <p className="text-[11px] text-violet-400/80 mt-1 leading-relaxed">{msg}</p>
            )}
            {isDone && msg && (
              <p className="text-[11px] text-emerald-500/70 mt-1 leading-relaxed">{msg}</p>
            )}
            {isError && msg && (
              <p className="text-[11px] text-rose-400 mt-1 break-all leading-relaxed">{msg}</p>
            )}

            {recentItems.length > 0 && (isActive || isDone) && (
              <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
                {recentItems.map((d, i) => (
                  <ItemRow key={i} name={d.name} status={d.status} />
                ))}
                {items.length > 8 && (
                  <p className="text-[11px] text-slate-600 mt-0.5">…共 {items.length} 项</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Global error */}
      {st.status.error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
          <p className="text-xs font-medium text-rose-400">❌ 生成失败</p>
          {st.msg.error && (
            <p className="text-[11px] text-rose-400/70 mt-1 break-all leading-relaxed whitespace-pre-wrap">
              {st.msg.error}
            </p>
          )}
        </div>
      )}

      {/* Download button */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="block w-full text-center bg-gradient-to-r from-emerald-600 to-teal-600
            hover:from-emerald-500 hover:to-teal-500
            text-white text-sm font-semibold py-3 rounded-xl transition-all
            shadow-lg shadow-emerald-500/20 btn-press mt-2"
        >
          ⬇️ 下载音频剧 MP3
        </a>
      )}
    </div>
  )
}
