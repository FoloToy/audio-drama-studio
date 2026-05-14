import { useMemo } from 'react'

// 全部 7 个阶段，按执行顺序排列
const STAGES = [
  { key: 'prompt',      icon: '🤖', label: '生成提示词',     service: 'DeepSeek / Claude' },
  { key: 'sfx_library', icon: '🔍', label: '查询音效素材库', service: 'AI 语义匹配' },
  { key: 'bgm_library', icon: '🔍', label: '查询BGM素材库',  service: 'AI 语义匹配' },
  { key: 'sfx',         icon: '🔊', label: '生成音效',       service: 'ElevenLabs' },
  { key: 'bgm',         icon: '🎵', label: '生成BGM',        service: 'MiniMax music-2.6' },
  { key: 'tts',         icon: '🎤', label: '合成台词语音',   service: '豆包 TTS 2.0' },
  { key: 'mix',         icon: '🎛️', label: '混音合成',      service: '' },
]

// 进度条组件
function ProgressBar({ cur, total, color = 'bg-indigo-400' }) {
  const pct = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0
  return (
    <div className="mt-2 space-y-0.5">
      <div className="flex justify-between text-xs text-indigo-500">
        <span>{cur} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// 单条目行
function ItemRow({ name, status }) {
  const isOk  = status === 'done' || status === 'skipped'
  const isErr = status === 'error'
  return (
    <div className="text-xs flex gap-1.5 items-center min-w-0">
      <span className={`shrink-0 font-bold ${isOk ? 'text-green-500' : isErr ? 'text-red-500' : 'text-indigo-400'}`}>
        {isOk ? '✓' : isErr ? '✗' : '…'}
      </span>
      <span className="text-gray-600 truncate">{name}</span>
      {status === 'skipped' && <span className="text-gray-400 shrink-0 ml-auto">已缓存</span>}
    </div>
  )
}

export default function ProgressTracker({ events, downloadUrl }) {
  // 从事件流中提取每个阶段的最新状态
  const st = useMemo(() => {
    const status   = {}   // stage → last status string
    const items    = {}   // stage → [{name, status}]
    const progress = {}   // stage → {cur, total}
    const msg      = {}   // stage → latest message string

    for (const ev of events) {
      const s = ev.stage
      if (!s || s === 'heartbeat') continue

      status[s] = ev.status

      if (ev.message) msg[s] = ev.message

      // progress / total 在 sfx/bgm/tts 的每条 item 事件里
      if (ev.progress !== undefined && ev.total !== undefined) {
        progress[s] = { cur: ev.progress, total: ev.total }
      }
      // 最终 done 事件有时用 success + total 表示完成数
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

        // 仅展示最近 8 条
        const recentItems  = items.slice(-8)
        const doneCount    = items.filter(i => i.status === 'done' || i.status === 'skipped').length
        const errorCount   = items.filter(i => i.status === 'error').length

        return (
          <div
            key={key}
            className={`rounded-lg border px-4 py-3 transition-all
              ${isPending ? 'border-gray-100 bg-white opacity-40' :
                isActive  ? 'border-indigo-300 bg-indigo-50' :
                isDone    ? 'border-green-200 bg-green-50' :
                isError   ? 'border-red-200 bg-red-50' :
                            'border-gray-200 bg-white'}`}
          >
            {/* 标题行 */}
            <div className="flex items-center gap-2">
              {isActive ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent
                  rounded-full animate-spin shrink-0" />
              ) : (
                <span className="text-sm shrink-0">{icon}</span>
              )}

              <span className={`font-medium text-sm flex-1
                ${isPending ? 'text-gray-400' :
                  isActive  ? 'text-indigo-700' :
                  isDone    ? 'text-green-700' :
                  isError   ? 'text-red-700' :
                              'text-gray-700'}`}>
                {label}
              </span>

              {/* 服务商标签 */}
              {service && (
                <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{service}</span>
              )}

              {/* 右侧状态徽章 */}
              {isDone && prog && (
                <span className="text-xs text-green-600 font-medium shrink-0 ml-1">
                  {doneCount}/{prog.total}
                  {errorCount > 0 && <span className="text-amber-500 ml-1">({errorCount}失败)</span>}
                </span>
              )}
              {isDone && !prog && !items.length && (
                <span className="text-xs text-green-500 shrink-0 ml-1">完成</span>
              )}
              {isError && (
                <span className="text-xs text-red-500 shrink-0 ml-1">失败</span>
              )}
            </div>

            {/* 进度条（活跃阶段且有进度数据时显示）*/}
            {isActive && prog && (
              <ProgressBar cur={prog.cur} total={prog.total} />
            )}

            {/* 完成阶段也保留进度条（显示最终 100%）*/}
            {isDone && prog && prog.total > 1 && (
              <ProgressBar cur={prog.cur} total={prog.total} color="bg-green-400" />
            )}

            {/* 活跃时的文字消息（无进度条时）*/}
            {isActive && msg && !prog && (
              <p className="text-xs text-indigo-600 mt-1 leading-relaxed">{msg}</p>
            )}

            {/* 完成时的摘要消息 */}
            {isDone && msg && (
              <p className="text-xs text-green-600 mt-1 leading-relaxed">{msg}</p>
            )}

            {/* 错误消息 */}
            {isError && msg && (
              <p className="text-xs text-red-600 mt-1 break-all leading-relaxed">{msg}</p>
            )}

            {/* 条目列表 */}
            {recentItems.length > 0 && (isActive || isDone) && (
              <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
                {recentItems.map((d, i) => (
                  <ItemRow key={i} name={d.name} status={d.status} />
                ))}
                {items.length > 8 && (
                  <p className="text-xs text-gray-400 mt-0.5">…共 {items.length} 项</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* 全局错误（stage="error"）*/}
      {st.status.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">❌ 生成失败</p>
          {st.msg.error && (
            <p className="text-xs text-red-600 mt-1 break-all leading-relaxed whitespace-pre-wrap">
              {st.msg.error}
            </p>
          )}
        </div>
      )}

      {/* 下载按钮 */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="block w-full text-center bg-green-600 hover:bg-green-700
            text-white font-medium py-3 rounded-xl transition-colors mt-2"
        >
          ⬇️ 下载音频剧 MP3
        </a>
      )}
    </div>
  )
}
