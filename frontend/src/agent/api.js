// Agent 平台 API 客户端 + SSE 任务运行器

const BASE = '/api'

async function req(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, opts)
  const txt = await res.text()
  let data = {}
  try { data = txt ? JSON.parse(txt) : {} } catch { data = { raw: txt } }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

export const api = {
  // projects
  listProjects: (q = {}) => req('GET', `/projects?status=${q.status || ''}&keyword=${encodeURIComponent(q.keyword || '')}`),
  createProject: (d) => req('POST', '/projects', d),
  getProject: (id) => req('GET', `/projects/${id}`),
  updateProject: (id, d) => req('PATCH', `/projects/${id}`, d),
  deleteProject: (id) => req('DELETE', `/projects/${id}`),
  // source
  saveSource: (id, d) => req('POST', `/projects/${id}/source`, d),
  uploadSourceFile: async (id, file, extra = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v))
    const res = await fetch(`${BASE}/projects/${id}/source-file`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error('上传失败')
    return res.json()
  },
  // outline / scripts
  getOutline: (id) => req('GET', `/projects/${id}/outline`),
  saveOutline: (id, episodes) => req('PUT', `/projects/${id}/outline`, { episodes }),
  approveOutline: (id) => req('POST', `/projects/${id}/outline/approve`),
  getScript: (eid) => req('GET', `/episodes/${eid}/script`),
  saveScript: (eid, blocks, replace = false) => req('PUT', `/episodes/${eid}/script`, { blocks, replace }),
  rewriteBlock: (bid, d) => req('POST', `/script-blocks/${bid}/rewrite`, d),
  approveScript: (eid) => req('POST', `/episodes/${eid}/script/approve`),
  // safety
  safetyRewrite: (d) => req('POST', '/safety/rewrite', d),
  resolveFinding: (fid) => req('POST', `/safety/findings/${fid}/resolve`),
  // characters / voices
  listCharacters: (id) => req('GET', `/projects/${id}/characters`),
  updateCharacter: (cid, d) => req('PATCH', `/characters/${cid}`, d),
  lockCharacter: (cid) => req('POST', `/characters/${cid}/lock`),
  listVoices: () => req('GET', '/agent/voices'),
  getBindings: (id) => req('GET', `/projects/${id}/voice-bindings`),
  setBindings: (id, bindings) => req('POST', `/projects/${id}/voice-bindings`, { bindings }),
  confirmVoices: (id) => req('POST', `/projects/${id}/voices/confirm`),
  // audio / exports
  getAudio: (eid) => req('GET', `/episodes/${eid}/audio`),
  listExports: (id) => req('GET', `/projects/${id}/exports`),
  // tasks
  createTask: (d) => req('POST', '/agent-tasks', d),
  getTask: (tid) => req('GET', `/agent-tasks/${tid}`),
  // outline ops
  addEpisode: (pid) => req('POST', `/projects/${pid}/outline/episode`),
  deleteEpisode: (eid) => req('DELETE', `/episodes/${eid}`),
  patchEpisode: (eid, d) => req('PATCH', `/episodes/${eid}`, d),
  regenerateBlock: (eid, bid) => req('POST', `/episodes/${eid}/blocks/${bid}/regenerate`),
  // admin: voices
  adminVoices: () => req('GET', '/admin/voices'),
  adminSaveVoice: (v) => req('POST', '/admin/voices', v),
  adminPatchVoice: (vid, d) => req('PATCH', `/admin/voices/${vid}`, d),
  adminDeleteVoice: (vid) => req('DELETE', `/admin/voices/${vid}`),
  // admin: styles
  adminStyles: () => req('GET', '/admin/styles'),
  adminSaveStyle: (s) => req('POST', '/admin/styles', s),
  adminDeleteStyle: (sid) => req('DELETE', `/admin/styles/${sid}`),
  // admin: safety rules
  adminRules: () => req('GET', '/admin/safety-rules'),
  adminSaveRule: (r) => req('POST', '/admin/safety-rules', r),
  adminDeleteRule: (rid) => req('DELETE', `/admin/safety-rules/${rid}`),
  // materials / tasks / settings
  materials: () => req('GET', '/materials'),
  adminTasks: () => req('GET', '/admin/tasks'),
  getSettings: () => req('GET', '/settings'),
  saveSettings: (d) => req('POST', '/settings', d),
  // providers (D-2)
  getProviders: () => req('GET', '/providers'),
  setProviderDefaults: (d) => req('POST', '/providers/defaults', d),
  // publish (D-1)
  publishRecords: (pid) => req('GET', `/projects/${pid}/publish-records`),
  // 账号 / 项目操作 / 资源
  login: (email, name) => req('POST', '/login', { email, name }),
  duplicateProject: (pid) => req('POST', `/projects/${pid}/duplicate`),
  myResources: () => req('GET', '/my-resources'),
  cancelTask: (tid) => req('POST', `/agent-tasks/${tid}/cancel`),
}

// 运行一个 Agent 任务并通过 SSE 跟踪进度。
// onProgress({progress, message}) 回调；返回 Promise，解析为 result。
export function runTask({ task_type, project_id, episode_id, input }, onProgress) {
  return new Promise(async (resolve, reject) => {
    let task
    try {
      task = await api.createTask({ task_type, project_id, episode_id, input })
    } catch (e) { return reject(e) }
    const tid = task.task_id
    const es = new EventSource(`${BASE}/agent-tasks/${tid}/stream`)
    es.onmessage = (ev) => {
      let d = {}
      try { d = JSON.parse(ev.data) } catch { return }
      if (d.type === 'heartbeat') return
      if (typeof d.progress === 'number' || d.message) {
        onProgress && onProgress({ progress: d.progress, message: d.message })
      }
      if (d.type === 'succeeded' || d.type === 'done') {
        es.close()
        resolve(d.result || {})
      } else if (d.type === 'failed' || d.type === 'error') {
        es.close()
        reject(new Error(d.error?.message || '任务失败'))
      } else if (d.type === 'cancelled') {
        es.close()
        reject(new Error('任务已取消'))
      }
    }
    es.onerror = () => {
      // SSE 断开后轮询兜底
      es.close()
      const poll = setInterval(async () => {
        try {
          const t = await api.getTask(tid)
          onProgress && onProgress({ progress: t.progress, message: t.message })
          if (t.status === 'succeeded') { clearInterval(poll); resolve(t.result || {}) }
          else if (t.status === 'failed') { clearInterval(poll); reject(new Error(t.error?.message || '任务失败')) }
          else if (t.status === 'cancelled') { clearInterval(poll); reject(new Error('已取消')) }
        } catch (e) { /* keep polling */ }
      }, 1500)
    }
  })
}
