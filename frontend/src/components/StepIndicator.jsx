const STEPS = ['输入原著', '确认剧本', '配置音色', 'BGM · 音效', '生成音频']

export default function StepIndicator({ current }) {
  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => {
        const step   = i + 1
        const done   = step < current
        const active = step === current
        const isLast = i === STEPS.length - 1

        return (
          <div key={step} className={`flex items-center gap-2 ${isLast ? '' : 'flex-1'}`}>

            {/* ── 步骤主体 ── */}
            <div className="flex items-center gap-1.5 shrink-0">

              {/* 状态图标 */}
              {active ? (
                /* 亮点 + 光晕 */
                <span className="relative flex shrink-0" style={{ width: 10, height: 10 }}>
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                        style={{ background: '#E5007F' }} />
                  <span className="relative rounded-full"
                        style={{ width: 10, height: 10, background: '#E5007F',
                                 boxShadow: '0 0 10px rgba(229,0,127,0.75)' }} />
                </span>
              ) : done ? (
                /* 对勾 */
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="rgb(34,197,94)" strokeWidth={2.8}
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                /* 淡点 */
                <span className="rounded-full bg-th-xlo shrink-0 theme-transition"
                      style={{ width: 5, height: 5, opacity: 0.45 }} />
              )}

              {/* 标签文字 */}
              {active ? (
                <span className="font-semibold transition-all duration-300 whitespace-nowrap"
                      style={{
                        fontSize: 16,
                        background: 'linear-gradient(125deg,#FF70BF,#E5007F)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}>
                  {label}
                </span>
              ) : done ? (
                <span className="text-th-lo transition-all duration-300 whitespace-nowrap theme-transition"
                      style={{ fontSize: 15 }}>
                  {label}
                </span>
              ) : (
                <span className="text-th-xlo transition-all duration-300 whitespace-nowrap theme-transition"
                      style={{ fontSize: 15, opacity: 0.6 }}>
                  {label}
                </span>
              )}
            </div>

            {/* ── 连接线 ── */}
            {!isLast && (
              <div className="flex-1 theme-transition" style={{
                height: 1,
                background: done
                  ? 'linear-gradient(to right, rgba(34,197,94,0.35), rgba(34,197,94,0.15))'
                  : 'var(--border-lo)',
              }} />
            )}

          </div>
        )
      })}
    </div>
  )
}
