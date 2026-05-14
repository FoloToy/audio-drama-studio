/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── FoloToy 主题色令牌（CSS 变量驱动，自动跟随 light/dark）──
      backgroundColor: {
        'th-page':    'var(--bg-page)',
        'th-card':    'var(--bg-card)',
        'th-surface': 'var(--bg-surface)',
        'th-deep':    'var(--bg-deep)',
        'th-float':   'var(--bg-float)',
      },
      textColor: {
        'th-hi':  'var(--text-hi)',
        'th-md':  'var(--text-md)',
        'th-lo':  'var(--text-lo)',
        'th-xlo': 'var(--text-xlo)',
      },
      borderColor: {
        'th-lo': 'var(--border-lo)',
        'th-md': 'var(--border-md)',
        'th-hi': 'var(--border-hi)',
      },
    },
  },
  plugins: [],
}
