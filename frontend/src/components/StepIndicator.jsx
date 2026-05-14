const STEPS = ['输入原著', '确认剧本', '配置音色', '生成BGM/音效', '生成音频']

export default function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const step   = i + 1
        const done   = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
                ${done   ? 'bg-green-500 text-white' :
                  active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                           'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : step}
              </div>
              <span className={`mt-1 text-xs whitespace-nowrap
                ${active ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-16 h-0.5 mb-4 mx-1 transition-all
                ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
