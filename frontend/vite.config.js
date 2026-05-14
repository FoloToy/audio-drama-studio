import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // 禁止代理层压缩响应，避免 SSE 流式输出被 gzip buffer 卡住
        headers: { 'Accept-Encoding': 'identity' },
        // BGM 生成约需 250s（MiniMax music-2.6），需放宽代理超时
        proxyTimeout: 350_000,
        timeout:      350_000,
      }
    }
  }
})
