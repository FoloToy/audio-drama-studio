import { useEffect, useRef, useState } from 'react'

// ── 阶段定义 ─────────────────────────────────────────────────────────────────
const STAGES = [
  {
    id:        'connecting',
    label:     '连接 Claude',
    doing:     '正在建立连接…',
    done:      '连接成功',
  },
  {
    id:        'thinking',
    label:     '理解原著 · 构思结构',
    doing:     'Claude 正在思考剧本框架…',
    done:      '构思完毕，开始输出',
  },
  {
    id:        'streaming',
    label:     '逐句生成剧本',
    doing:     '正在输出台词、BGM 与音效标注…',
    done:      '剧本内容生成完毕',
  },
  {
    id:        'parsing',
    label:     '校验结构',
    doing:     '正在解析 JSON 结构…',
    done:      '校验完成，即将进入下一步',
  },
]

const ORDER = STAGES.map(s => s.id)

// ── 滚动省略号动画 ────────────────────────────────────────────────────────────
function AnimDots() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN(x => (x + 1) % 4), 400)
    return () => clearInterval(id)
  }, [])
  return <span className="tracking-widest">{'·'.repeat(n)}&nbsp;{'·'.repeat(3 - n)}</span>
}

// ── 单个阶段行 ────────────────────────────────────────────────────────────────
function StageRow({ stage, status, children }) {
  const isDone    = status === 'done'
  const isActive  = status === 'active'
  const isPending = status === 'pending'

  return (
    <div className={`flex items-start gap-3 py-2.5 transition-opacity duration-500
      ${isPending ? 'opacity-25' : 'opacity-100'}`}>

      {/* 状态图标 */}
      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0
        transition-colors duration-300
        ${isDone   ? 'bg-green-100'
        : isActive ? 'bg-indigo-100'
        :            'bg-gray-100'}`}>
        {isDone ? (
          <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : isActive ? (
          <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent
            rounded-full animate-spin block" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-gray-300 block" />
        )}
      </div>

      {/* 文字 */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-5
          ${isDone   ? 'text-green-700'
          : isActive ? 'text-indigo-700'
          :            'text-gray-400'}`}>
          {stage.label}
        </p>
        {(isActive || isDone) && (
          <p className={`text-xs mt-0.5
            ${isDone ? 'text-green-500' : 'text-indigo-400'}`}>
            {isDone ? stage.done : stage.doing}
          </p>
        )}
        {/* 子内容（如统计数据） */}
        {children && (isActive || isDone) && (
          <div className="mt-1.5">{children}</div>
        )}
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function RewriteProgress({ params, styleTitle, onDone, onCancel }) {
  const [phase,   setPhase]   = useState('connecting')
  const [text,    setText]    = useState('')
  const [error,   setError]   = useState('')
  const [elapsed, setElapsed] = useState(0)
  const boxRef   = useRef(null)
  const startRef = useRef(Date.now())

  // 计时器
  useEffect(() => {
    const id = setInterval(() =>
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // 流式请求
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        // 直连 Flask 5000，绕开 Vite proxy 的 chunk 缓冲
        const base = `http://${window.location.hostname}:5000`
        const res  = await fetch(`${base}/api/rewrite-script-stream`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(params),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let   buffer  = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let event
            try { event = JSON.parse(line.slice(6)) } catch { continue }

            if (event.type === 'thinking') {
              if (!cancelled) setPhase('thinking')
            } else if (event.type === 'token') {
              if (!cancelled) {
                setPhase('streaming')
                setText(t => t + event.text)
                requestAnimationFrame(() => {
                  if (boxRef.current)
                    boxRef.current.scrollTop = boxRef.current.scrollHeight
                })
              }
            } else if (event.type === 'done') {
              if (!cancelled) {
                setPhase('parsing')
                onDone(event.result)
              }
            } else if (event.type === 'error') {
              throw new Error(event.message)
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  // 从 partial JSON 快速统计
  const ttsCount = (text.match(/"type"\s*:\s*"tts"/g) || []).length
  const bgmCount = (text.match(/"action"\s*:\s*"start"/g) || []).length
  const sfxCount = (text.match(/"type"\s*:\s*"sfx"/g) || []).length

  const stageOf = id => {
    const cur = ORDER.indexOf(phase)
    const idx = ORDER.indexOf(id)
    if (idx < cur) return 'done'
    if (idx === cur) return 'active'
    return 'pending'
  }

  return (
    <div className="space-y-4">

      {/* 顶部标题 + 计时 */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
        <span className="text-sm font-medium text-gray-700 flex-1">
          Claude 正在以「{styleTitle}」改写剧本
        </span>
        <span className="text-xs text-gray-400 tabular-nums shrink-0">{elapsed}s</span>
      </div>

      {/* 阶段列表 */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 divide-y divide-gray-100">
        {STAGES.map(stage => (
          <StageRow key={stage.id} stage={stage} status={stageOf(stage.id)}>
            {/* streaming 阶段：实时计数 */}
            {stage.id === 'streaming' && (
              <div className="flex gap-4">
                <span className="text-xs font-medium text-indigo-600">{ttsCount} 条台词</span>
                <span className="text-xs font-medium text-purple-600">{bgmCount} 首BGM</span>
                <span className="text-xs font-medium text-amber-600">{sfxCount} 个音效</span>
              </div>
            )}
          </StageRow>
        ))}
      </div>

      {/* 实时输出框 —— 有内容就展示，无内容时占位提示 */}
      <div
        ref={boxRef}
        className="bg-gray-950 rounded-2xl px-4 py-3 h-56 overflow-y-auto
          font-mono text-[11px] leading-relaxed whitespace-pre-wrap
          text-emerald-300 border border-gray-800"
      >
        {text
          ? <>{text}<span className="inline-block w-[2px] h-[0.9em] bg-emerald-400 ml-[1px] align-middle animate-pulse" /></>
          : (
            <span className="text-gray-500">
              {phase === 'connecting'
                ? <>正在连接<AnimDots /></>
                : phase === 'thinking'
                ? <>模型思考中<AnimDots /></>
                : <>等待输出<AnimDots /></>}
            </span>
          )
        }
      </div>

      {/* 错误 / 取消 */}
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl break-all">{error}</p>
          <button onClick={onCancel}
            className="w-full border border-gray-200 text-gray-600 font-medium py-2.5
              rounded-xl hover:bg-gray-50 transition-colors">
            ← 返回重试
          </button>
        </div>
      ) : (
        <button onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          ← 取消，返回修改
        </button>
      )}
    </div>
  )
}
