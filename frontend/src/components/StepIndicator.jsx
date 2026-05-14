const STEPS = ['输入原著', '确认剧本', '配置音色', '生成BGM/音效', '生成音频']

export default function StepIndicator({ current }) {
  return (
    <div className="flex items-center mb-8 theme-transition">
      {STEPS.map((label, i) => {
        const step   = i + 1
        const done   = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                ${done
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  : active
                    ? 'bg-[#E5007F] text-white ring-4 ring-[#E5007F]/20 shadow-lg shadow-[#E5007F]/30 animate-bounce-dot'
                    : 'bg-th-surface text-th-lo border border-th-md'
                }`}>
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : step}
              </div>
              <span className={`mt-1.5 text-[11px] whitespace-nowrap font-medium tracking-wide transition-colors duration-300
                ${done ? 'text-emerald-500' : active ? 'text-[#FF3BA8]' : 'text-th-xlo'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mb-4 transition-all duration-500
                ${done ? 'bg-emerald-500/40' : 'bg-th-surface'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
