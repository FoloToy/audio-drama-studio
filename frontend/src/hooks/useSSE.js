import { useEffect, useRef } from 'react'

export function useSSE(taskId, onMessage) {
  const esRef        = useRef(null)
  const onMessageRef = useRef(onMessage)
  const retryRef     = useRef(0)
  const timerRef     = useRef(null)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!taskId) return

    const MAX_RETRIES = 5

    function connect() {
      if (esRef.current) esRef.current.close()

      const es = new EventSource(`/api/progress/${taskId}`)
      esRef.current = es

      es.onmessage = (e) => {
        retryRef.current = 0  // 收到消息，重置重试计数
        try {
          const data = JSON.parse(e.data)
          if (data.stage === 'heartbeat') return  // 心跳包不传给上层
          onMessageRef.current(data)
          if (data.stage === 'done' || data.stage === 'error') {
            es.close()
          }
        } catch {}
      }

      es.onerror = () => {
        es.close()
        if (retryRef.current < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** retryRef.current, 30000)
          retryRef.current += 1
          timerRef.current = setTimeout(connect, delay)
        }
        // 超过最大重试次数：静默放弃，用户可刷新页面
      }
    }

    retryRef.current = 0
    connect()

    return () => {
      clearTimeout(timerRef.current)
      esRef.current?.close()
    }
  }, [taskId])
}
