import { useEffect, useRef, useState } from 'react'

const STAGES = [
  { id: 'connecting', label: '连接 AI',          doing: '正在建立连接…',               done: '连接成功',           color: '#2563EB' },
  { id: 'thinking',   label: '理解原著 · 构思结构', doing: 'AI 正在思考剧本框架…',        done: '构思完毕，开始输出',   color: '#9333EA' },
  { id: 'streaming',  label: '逐句生成剧本',       doing: '正在输出台词、BGM 与音效标注…', done: '剧本内容生成完毕',    color: '#EA580C' },
  { id: 'parsing',    label: '校验结构',           doing: '正在解析 JSON 结构…',         done: '校验完成，即将进入下一步', color: '#E5007F' },
]
const ORDER = STAGES.map(s => s.id)

function AnimDots() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN(x => (x + 1) % 4), 400)
    return () => clearInterval(id)
  }, [])
  return <span className="tracking-widest opacity-60">{'·'.repeat(n)}&nbsp;{'·'.repeat(3 - n)}</span>
}

function StageRow({ stage, status, children }) {
  const isDone    = status === 'done'
  const isActive  = status === 'active'
  const isPending = status === 'pending'
  const c = stage.color

  // 透明版用于图标轨道
  const cFaint = c + '33'   // ~20% opacity hex

  return (
    <div className={`flex items-start gap-3 py-3 transition-all duration-500 ${isPending ? 'opacity-25' : 'opacity-100'}`}>

      {/* 状态图标 */}
      <div className="mt-0.5 shrink-0 flex items-center justify-center" style={{ width: 20, height: 20 }}>
        {isDone ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke={c} strokeWidth={2.5}
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : isActive ? (
          <span className="block rounded-full animate-spin"
                style={{ width: 14, height: 14,
                         border: `2px solid ${cFaint}`,
                         borderTopColor: c }} />
        ) : (
          <span className="block rounded-full" style={{ width: 5, height: 5, background: 'var(--border-md)' }} />
        )}
      </div>

      {/* 文字 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-5 theme-transition" style={{
          color: (isDone || isActive) ? c : 'var(--text-xlo)',
        }}>
          {stage.label}
        </p>

        {(isActive || isDone) && (
          <p className="text-xs font-medium mt-0.5 leading-relaxed" style={{ color: 'var(--text-lo)' }}>
            {isDone ? stage.done : <>{stage.doing}<AnimDots /></>}
          </p>
        )}

        {children && (isActive || isDone) && (
          <div className="mt-2">{children}</div>
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
    <div className="space-y-5">

      {/* ── 标题行 ── */}
      <div className="flex items-center gap-2.5">
        <span className="relative flex shrink-0" style={{ width: 8, height: 8 }}>
          <span className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'rgba(229,0,127,0.45)' }} />
          <span className="relative rounded-full"
                style={{ width: 8, height: 8, background: '#E5007F',
                         boxShadow: '0 0 6px rgba(229,0,127,0.55)' }} />
        </span>
        <span className="text-xs font-medium flex-1 theme-transition" style={{ color: 'var(--text-md)' }}>
          AI 正在以「{styleTitle}」改写剧本
        </span>
        <span className="text-xs tabular-nums font-mono theme-transition"
              style={{ color: 'var(--text-xlo)' }}>{elapsed}s</span>
      </div>

      {/* ── 阶段列表 ── */}
      <div className="rounded-xl overflow-hidden" style={{
        border: '1px solid var(--border-lo)',
        background: 'var(--bg-surface)',
      }}>
        <div className="divide-y" style={{ borderColor: 'var(--border-lo)' }}>
          {STAGES.map(stage => (
            <div key={stage.id} className="px-4 theme-transition">
              <StageRow stage={stage} status={stageOf(stage.id)}>
                {stage.id === 'streaming' && (ttsCount + bgmCount + sfxCount > 0) && (
                  <div className="flex gap-3">
                    <span className="text-[11px] tabular-nums"
                          style={{ color: 'rgba(229,0,127,0.80)' }}>
                      {ttsCount} 条台词
                    </span>
                    <span className="text-[11px] tabular-nums"
                          style={{ color: 'rgba(229,0,127,0.65)' }}>
                      {bgmCount} 首 BGM
                    </span>
                    <span className="text-[11px] tabular-nums"
                          style={{ color: 'rgba(160,110,50,0.90)' }}>
                      {sfxCount} 个音效
                    </span>
                  </div>
                )}
              </StageRow>
            </div>
          ))}
        </div>
      </div>

      {/* ── 终端输出框（始终深色，给 JSON 流一个专属氛围） ── */}
      <div
        ref={boxRef}
        className="rounded-xl px-4 py-3 h-52 overflow-y-auto font-mono text-sm font-bold
                   leading-relaxed whitespace-pre-wrap"
        style={{
          background: 'rgba(2,8,2,0.94)',
          border:     '1px solid rgba(57,255,20,0.15)',
          color:      '#39FF14',
          textShadow: '0 0 8px rgba(57,255,20,0.45)',
        }}
      >
        {text ? (
          <>
            {text}
            <span className="inline-block align-middle ml-px animate-pulse"
                  style={{ width: 2, height: '0.85em', background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
          </>
        ) : (
          <span style={{ color: 'rgba(57,255,20,0.30)' }}>
            {phase === 'connecting' ? <>正在连接<AnimDots /></>
           : phase === 'thinking'   ? <>模型思考中<AnimDots /></>
           :                          <>等待输出<AnimDots /></>}
          </span>
        )}
      </div>

      {/* ── 错误 / 取消 ── */}
      {error ? (
        <div className="space-y-3">
          <p className="text-xs text-rose-400 px-3 py-2 rounded-xl break-all"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </p>
          <button onClick={onCancel}
            className="w-full text-xs font-medium py-2.5 rounded-xl transition-all btn-press theme-transition"
            style={{ border: '1px solid var(--border-md)', color: 'var(--text-md)' }}>
            ← 返回重试
          </button>
        </div>
      ) : (
        <button onClick={onCancel}
          className="text-xs transition-colors theme-transition"
          style={{ color: 'var(--text-xlo)' }}
          onMouseEnter={e => e.target.style.color = 'var(--text-md)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-xlo)'}>
          ← 取消，返回修改
        </button>
      )}
    </div>
  )
}
