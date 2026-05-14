import { useEffect, useRef, useState } from 'react'

const STAGES = [
  { id: 'connecting', label: '连接 AI',          doing: '正在建立连接…',               done: '连接成功' },
  { id: 'thinking',   label: '理解原著 · 构思结构', doing: 'AI 正在思考剧本框架…',        done: '构思完毕，开始输出' },
  { id: 'streaming',  label: '逐句生成剧本',       doing: '正在输出台词、BGM 与音效标注…', done: '剧本内容生成完毕' },
  { id: 'parsing',    label: '校验结构',           doing: '正在解析 JSON 结构…',         done: '校验完成，即将进入下一步' },
]

const ORDER = STAGES.map(s => s.id)

function AnimDots() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN(x => (x + 1) % 4), 400)
    return () => clearInterval(id)
  }, [])
  return <span className="tracking-widest">{'·'.repeat(n)}&nbsp;{'·'.repeat(3 - n)}</span>
}

function StageRow({ stage, status, children }) {
  const isDone    = status === 'done'
  const isActive  = status === 'active'
  const isPending = status === 'pending'

  return (
    <div className={`flex items-start gap-3 py-2.5 transition-opacity duration-500
      ${isPending ? 'opacity-25' : 'opacity-100'}`}>

      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
        ${isDone   ? 'bg-emerald-500/15'
        : isActive ? 'bg-violet-500/15'
        :            'bg-white/[0.04]'}`}>
        {isDone ? (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : isActive ? (
          <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin block" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-white/20 block" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-5
          ${isDone   ? 'text-emerald-400'
          : isActive ? 'text-violet-300'
          :            'text-slate-600'}`}>
          {stage.label}
        </p>
        {(isActive || isDone) && (
          <p className={`text-[11px] mt-0.5
            ${isDone ? 'text-emerald-500/70' : 'text-violet-400/70'}`}>
            {isDone ? stage.done : stage.doing}
          </p>
        )}
        {children && (isActive || isDone) && (
          <div className="mt-1.5">{children}</div>
        )}
      </div>
    </div>
  )
}

export default function RewriteProgress({ params, styleTitle, onDone, onCancel }) {
  const [phase,   setPhase]   = useState('connecting')
  const [text,    setText]    = useState('')
  const [error,   setError]   = useState('')
  const [elapsed, setElapsed] = useState(0)
  const boxRef   = useRef(null)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const id = setInterval(() =>
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
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
                  if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
                })
              }
            } else if (event.type === 'done') {
              if (!cancelled) { setPhase('parsing'); onDone(event.result) }
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

      {/* Title + timer */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
        <span className="text-xs font-medium text-slate-300 flex-1">
          AI 正在以「{styleTitle}」改写剧本
        </span>
        <span className="text-xs text-slate-600 tabular-nums shrink-0">{elapsed}s</span>
      </div>

      {/* Stage list */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 divide-y divide-white/[0.05]">
        {STAGES.map(stage => (
          <StageRow key={stage.id} stage={stage} status={stageOf(stage.id)}>
            {stage.id === 'streaming' && (
              <div className="flex gap-4">
                <span className="text-[11px] font-medium text-violet-400">{ttsCount} 条台词</span>
                <span className="text-[11px] font-medium text-purple-400">{bgmCount} 首BGM</span>
                <span className="text-[11px] font-medium text-amber-400">{sfxCount} 个音效</span>
              </div>
            )}
          </StageRow>
        ))}
      </div>

      {/* Live output box */}
      <div
        ref={boxRef}
        className="bg-[#0D0D15] rounded-2xl px-4 py-3 h-56 overflow-y-auto
          font-mono text-[11px] leading-relaxed whitespace-pre-wrap
          text-emerald-400 border border-white/[0.06]"
      >
        {text
          ? <>{text}<span className="inline-block w-[2px] h-[0.9em] bg-emerald-400 ml-[1px] align-middle animate-pulse" /></>
          : (
            <span className="text-slate-600">
              {phase === 'connecting'
                ? <>正在连接<AnimDots /></>
                : phase === 'thinking'
                ? <>模型思考中<AnimDots /></>
                : <>等待输出<AnimDots /></>}
            </span>
          )
        }
      </div>

      {/* Error / cancel */}
      {error ? (
        <div className="space-y-3">
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl break-all">{error}</p>
          <button onClick={onCancel}
            className="w-full border border-white/[0.08] text-slate-400 font-medium py-2.5
              rounded-xl hover:bg-white/[0.04] hover:text-slate-200 transition-all btn-press text-xs">
            ← 返回重试
          </button>
        </div>
      ) : (
        <button onClick={onCancel}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
          ← 取消，返回修改
        </button>
      )}
    </div>
  )
}
