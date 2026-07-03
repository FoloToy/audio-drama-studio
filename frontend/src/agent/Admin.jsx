import React, { useState, useEffect, useCallback } from 'react'
import { api } from './api'

// 复用设计令牌（与 AgentApp 一致）
const C = {
  page: '#F5F6FA', card: '#FFFFFF', border: '#ECECF2', borderMd: '#DCDCE6',
  primary: '#5A5FE0', primaryDeep: '#4B4FD6', primarySoft: '#EEEEFC', primaryBorder: '#C9CAF6',
  text: '#1C1C28', textMd: '#5B5B6E', textLo: '#9A9AAE',
  ok: '#16A34A', okSoft: '#E7F6ED', warn: '#EA580C', danger: '#E11D48', dangerSoft: '#FCE7EC', blue: '#3B6FE0',
}
const shadow = '0 1px 3px rgba(20,20,40,.05)'
const inp = { width: '100%', padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.borderMd}`, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', background: '#fff', color: C.text }
function Card({ children, style, pad = 18 }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: pad, boxShadow: shadow, ...style }}>{children}</div> }
function Btn({ children, onClick, variant = 'primary', disabled, style, size = 'md' }) {
  const v = { primary: { background: C.primary, color: '#fff', border: `1px solid ${C.primary}` }, deep: { background: C.primaryDeep, color: '#fff', border: `1px solid ${C.primaryDeep}` }, ghost: { background: '#fff', color: C.text, border: `1px solid ${C.borderMd}` }, soft: { background: '#fff', color: C.primary, border: `1px solid ${C.primaryBorder}` }, danger: { background: '#fff', color: C.danger, border: `1px solid ${C.dangerSoft}` } }[variant]
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ borderRadius: 9, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, padding: size === 'sm' ? '6px 12px' : '9px 16px', fontSize: size === 'sm' ? 12.5 : 13.5, ...v, ...style }}>{children}</button>
}
function Field({ label, children, style }) { return <div style={{ marginBottom: 14, ...style }}><div style={{ fontSize: 12, fontWeight: 600, color: C.textMd, marginBottom: 6 }}>{label}</div>{children}</div> }
function Toggle({ on, set }) { return <div onClick={() => set(!on)} style={{ width: 38, height: 22, borderRadius: 11, background: on ? C.primary : C.borderMd, position: 'relative', cursor: 'pointer', transition: 'all .2s', display: 'inline-block' }}><div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'all .2s' }} /></div> }
const LICENSE = { system_authorized: '系统授权', user_authorized: '用户授权', brand_owned: '品牌自有', not_commercial: '不可商用', unauthorized: '未授权' }
const RISK = { low: ['低', C.ok, C.okSoft], medium: ['中', C.warn, '#FEF3E2'], high: ['高', C.danger, C.dangerSoft], blocked: ['禁止', '#B91C1C', '#FEE2E2'] }

function PageShell({ title, sub, extra, children }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '26px 34px', background: C.page }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div><div style={{ fontSize: 23, fontWeight: 800, color: C.text }}>{title}</div>{sub && <div style={{ fontSize: 13, color: C.textLo, marginTop: 4 }}>{sub}</div>}</div>
        {extra}
      </div>
      {children}
    </div>
  )
}
function Modal({ title, onClose, children, width = 520 }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width, maxHeight: '88vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}><div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>{title}</div><span onClick={onClose} style={{ cursor: 'pointer', color: C.textLo, fontSize: 20 }}>✕</span></div>
      {children}
    </div>
  </div>
}

// ═══════════════ 声音库管理 ═══════════════
function VoicesAdmin() {
  const [voices, setVoices] = useState([]); const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.adminVoices().then(d => setVoices(d.voices || [])), [])
  useEffect(() => { load() }, [load])
  const blank = { voice_id: '', name: '', gender_feel: 'female', age_feel: 'adult', tone: '', license_status: 'system_authorized', commercial_use: true, enabled: true, sample_url: '', provider: 'doubao' }
  const save = async () => { if (!edit.voice_id || !edit.name) return alert('声音 ID 和名称必填'); await api.adminSaveVoice(edit); setEdit(null); load() }
  const th = { textAlign: 'left', fontSize: 12, fontWeight: 700, color: C.textMd, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  const td = { fontSize: 13, color: C.text, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  const PROV = { doubao: '豆包', minimax: 'MiniMax', elevenlabs: 'ElevenLabs' }
  return (
    <PageShell title="声音库管理" sub="管理可用于项目配音的声音（多 TTS 供应商：豆包 / MiniMax / ElevenLabs）" extra={<Btn onClick={() => setEdit(blank)}>＋ 新增声音</Btn>}>
      <Card pad={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>名称 / ID</th><th style={th}>供应商</th><th style={th}>性别</th><th style={th}>年龄感</th><th style={th}>音色描述</th><th style={th}>授权</th><th style={th}>可商用</th><th style={th}>启用</th><th style={th}>操作</th></tr></thead>
          <tbody>
            {voices.map(v => (
              <tr key={v.voice_id}>
                <td style={td}><div style={{ fontWeight: 700 }}>{v.name}</div><div style={{ fontSize: 11, color: C.textLo }}>{v.voice_id}</div></td>
                <td style={td}><span style={{ background: C.primarySoft, color: C.primary, fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{PROV[v.provider] || v.provider || '豆包'}</span></td>
                <td style={td}>{{ male: '男', female: '女', neutral: '中性' }[v.gender_feel]}</td>
                <td style={td}>{{ childlike: '童声', young: '青年', adult: '成人', elder: '年长' }[v.age_feel]}</td>
                <td style={{ ...td, maxWidth: 260, color: C.textMd }}>{v.tone}</td>
                <td style={td}>{LICENSE[v.license_status]}</td>
                <td style={td}>{v.commercial_use ? '✅' : '—'}</td>
                <td style={td}><Toggle on={v.enabled} set={async on => { await api.adminPatchVoice(v.voice_id, { enabled: on }); load() }} /></td>
                <td style={td}><span onClick={() => setEdit(v)} style={{ color: C.primary, cursor: 'pointer', marginRight: 12 }}>编辑</span><span onClick={async () => { if (confirm('删除该声音？')) { await api.adminDeleteVoice(v.voice_id); load() } }} style={{ color: C.danger, cursor: 'pointer' }}>删除</span></td>
              </tr>))}
          </tbody>
        </table>
      </Card>
      {edit && <Modal title={edit.voice_id && voices.find(v => v.voice_id === edit.voice_id) ? '编辑声音' : '新增声音'} onClose={() => setEdit(null)}>
        <Field label="TTS 供应商"><select value={edit.provider || 'doubao'} onChange={e => setEdit({ ...edit, provider: e.target.value })} style={inp}>
          <option value="doubao">豆包 seed-tts-2.0</option><option value="minimax">MiniMax speech</option><option value="elevenlabs">ElevenLabs</option></select></Field>
        <Field label="声音 ID *（该供应商的音色 ID）"><input value={edit.voice_id} onChange={e => setEdit({ ...edit, voice_id: e.target.value })} style={inp} /></Field>
        <Field label="名称 *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={inp} /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="性别感" style={{ flex: 1 }}><select value={edit.gender_feel} onChange={e => setEdit({ ...edit, gender_feel: e.target.value })} style={inp}><option value="female">女</option><option value="male">男</option><option value="neutral">中性</option></select></Field>
          <Field label="年龄感" style={{ flex: 1 }}><select value={edit.age_feel} onChange={e => setEdit({ ...edit, age_feel: e.target.value })} style={inp}><option value="childlike">童声</option><option value="young">青年</option><option value="adult">成人</option><option value="elder">年长</option></select></Field>
        </div>
        <Field label="音色描述"><input value={edit.tone} onChange={e => setEdit({ ...edit, tone: e.target.value })} style={inp} /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="授权状态" style={{ flex: 1 }}><select value={edit.license_status} onChange={e => setEdit({ ...edit, license_status: e.target.value })} style={inp}>{Object.entries(LICENSE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="可商用" style={{ width: 100 }}><div style={{ paddingTop: 6 }}><Toggle on={edit.commercial_use} set={v => setEdit({ ...edit, commercial_use: v })} /></div></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}><Btn variant="ghost" onClick={() => setEdit(null)}>取消</Btn><Btn onClick={save}>保存</Btn></div>
      </Modal>}
    </PageShell>
  )
}

// ═══════════════ 风格模板管理 ═══════════════
function StylesAdmin() {
  const [styles, setStyles] = useState([]); const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.adminStyles().then(d => setStyles(d.styles || [])), [])
  useEffect(() => { load() }, [load])
  const blank = { style_id: '', name: '', description: '', suitable_age: '5-12', language_feat: '', pace_feat: '', narration_ratio: '中', dialogue_ratio: '中', sample: '', enabled: true }
  const save = async () => { if (!edit.name) return alert('名称必填'); await api.adminSaveStyle(edit); setEdit(null); load() }
  return (
    <PageShell title="风格模板管理" sub="管理剧本生成时可选的讲述风格" extra={<Btn onClick={() => setEdit(blank)}>＋ 新增风格</Btn>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
        {styles.map(s => (
          <Card key={s.style_id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{s.name}</div>
              <Toggle on={s.enabled} set={async on => { await api.adminSaveStyle({ ...s, enabled: on }); load() }} />
            </div>
            <div style={{ fontSize: 13, color: C.textMd, margin: '8px 0', minHeight: 38 }}>{s.description}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: C.textLo, marginBottom: 10 }}>
              <span>适合 {s.suitable_age} 岁</span>{s.pace_feat && <span>· 节奏{s.pace_feat}</span>}{s.narration_ratio && <span>· 旁白{s.narration_ratio}</span>}
            </div>
            <div style={{ display: 'flex', gap: 12 }}><span onClick={() => setEdit(s)} style={{ color: C.primary, cursor: 'pointer', fontSize: 13 }}>编辑</span><span onClick={async () => { if (confirm('删除该风格？')) { await api.adminDeleteStyle(s.style_id); load() } }} style={{ color: C.danger, cursor: 'pointer', fontSize: 13 }}>删除</span></div>
          </Card>))}
      </div>
      {edit && <Modal title={edit.style_id ? '编辑风格' : '新增风格'} onClose={() => setEdit(null)}>
        <Field label="风格名称 *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={inp} /></Field>
        <Field label="风格描述"><textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={{ ...inp, height: 60, resize: 'vertical' }} /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="适合年龄段" style={{ flex: 1 }}><input value={edit.suitable_age} onChange={e => setEdit({ ...edit, suitable_age: e.target.value })} style={inp} /></Field>
          <Field label="节奏特点" style={{ flex: 1 }}><input value={edit.pace_feat} onChange={e => setEdit({ ...edit, pace_feat: e.target.value })} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="旁白比例" style={{ flex: 1 }}><input value={edit.narration_ratio} onChange={e => setEdit({ ...edit, narration_ratio: e.target.value })} style={inp} /></Field>
          <Field label="对话比例" style={{ flex: 1 }}><input value={edit.dialogue_ratio} onChange={e => setEdit({ ...edit, dialogue_ratio: e.target.value })} style={inp} /></Field>
        </div>
        <Field label="示例片段"><textarea value={edit.sample} onChange={e => setEdit({ ...edit, sample: e.target.value })} style={{ ...inp, height: 50, resize: 'vertical' }} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}><Btn variant="ghost" onClick={() => setEdit(null)}>取消</Btn><Btn onClick={save}>保存</Btn></div>
      </Modal>}
    </PageShell>
  )
}

// ═══════════════ 安全规则管理 ═══════════════
function SafetyAdmin() {
  const [rules, setRules] = useState([]); const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.adminRules().then(d => setRules(d.rules || [])), [])
  useEffect(() => { load() }, [load])
  const blank = { rule_id: '', name: '', risk_type: 'violence', suitable_age: '3-12', risk_level: 'high', description: '', sample_text: '', suggestion: '', enabled: true }
  const save = async () => { if (!edit.name) return alert('名称必填'); await api.adminSaveRule(edit); setEdit(null); load() }
  const th = { textAlign: 'left', fontSize: 12, fontWeight: 700, color: C.textMd, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  const td = { fontSize: 13, color: C.text, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' }
  return (
    <PageShell title="儿童安全规则管理" sub="管理内容安全审核规则，供安全审核 Agent 参考" extra={<Btn onClick={() => setEdit(blank)}>＋ 新增规则</Btn>}>
      <Card pad={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>规则</th><th style={th}>风险类型</th><th style={th}>年龄</th><th style={th}>等级</th><th style={th}>建议改写</th><th style={th}>启用</th><th style={th}>操作</th></tr></thead>
          <tbody>
            {rules.map(r => { const [rl, rc, rb] = RISK[r.risk_level] || RISK.medium; return (
              <tr key={r.rule_id}>
                <td style={td}><div style={{ fontWeight: 700 }}>{r.name}</div><div style={{ fontSize: 11, color: C.textLo, maxWidth: 200 }}>{r.description}</div></td>
                <td style={td}>{r.risk_type}</td><td style={td}>{r.suitable_age}</td>
                <td style={td}><span style={{ background: rb, color: rc, fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{rl}</span></td>
                <td style={{ ...td, maxWidth: 220, color: C.textMd }}>{r.suggestion}</td>
                <td style={td}><Toggle on={r.enabled} set={async on => { await api.adminSaveRule({ ...r, enabled: on }); load() }} /></td>
                <td style={td}><span onClick={() => setEdit(r)} style={{ color: C.primary, cursor: 'pointer', marginRight: 10 }}>编辑</span><span onClick={async () => { if (confirm('删除该规则？')) { await api.adminDeleteRule(r.rule_id); load() } }} style={{ color: C.danger, cursor: 'pointer' }}>删除</span></td>
              </tr>) })}
          </tbody>
        </table>
      </Card>
      {edit && <Modal title={edit.rule_id ? '编辑规则' : '新增规则'} onClose={() => setEdit(null)}>
        <Field label="规则名称 *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={inp} /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="风险类型" style={{ flex: 1 }}><select value={edit.risk_type} onChange={e => setEdit({ ...edit, risk_type: e.target.value })} style={inp}>{['violence', 'horror', 'adult_content', 'sexual_content', 'discrimination', 'insult', 'bad_language', 'dangerous_behavior', 'negative_values', 'superstition', 'death_expression', 'historical_inappropriate'].map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="风险等级" style={{ flex: 1 }}><select value={edit.risk_level} onChange={e => setEdit({ ...edit, risk_level: e.target.value })} style={inp}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="blocked">禁止</option></select></Field>
        </div>
        <Field label="适用年龄段"><input value={edit.suitable_age} onChange={e => setEdit({ ...edit, suitable_age: e.target.value })} style={inp} /></Field>
        <Field label="规则说明"><textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={{ ...inp, height: 50, resize: 'vertical' }} /></Field>
        <Field label="示例文本"><input value={edit.sample_text} onChange={e => setEdit({ ...edit, sample_text: e.target.value })} style={inp} /></Field>
        <Field label="建议改写方式"><input value={edit.suggestion} onChange={e => setEdit({ ...edit, suggestion: e.target.value })} style={inp} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}><Btn variant="ghost" onClick={() => setEdit(null)}>取消</Btn><Btn onClick={save}>保存</Btn></div>
      </Modal>}
    </PageShell>
  )
}

// ═══════════════ 任务中心 ═══════════════
const TASK_LABEL = { parse_source: '素材解析', generate_outline: '故事拆集', generate_script: '剧本生成', safety_review: '安全审核', identify_characters: '角色识别', recommend_voices: '声音匹配', generate_audio: '音频生成', remix_episode: '重新混音', export_project: '导出' }
const TSTATUS = { pending: ['等待中', C.textLo, C.page], running: ['生成中', C.blue, '#EAF0FE'], succeeded: ['成功', C.ok, C.okSoft], failed: ['失败', C.danger, C.dangerSoft], cancelled: ['已取消', C.textLo, C.page] }
function TasksCenter() {
  const [tasks, setTasks] = useState([])
  const load = useCallback(() => api.adminTasks().then(d => setTasks(d.tasks || [])), [])
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])
  const th = { textAlign: 'left', fontSize: 12, fontWeight: 700, color: C.textMd, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  const td = { fontSize: 13, color: C.text, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  return (
    <PageShell title="任务中心" sub="所有 Agent 任务的执行状态（每 3 秒刷新）" extra={<Btn variant="ghost" onClick={load}>刷新</Btn>}>
      <Card pad={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>任务类型</th><th style={th}>状态</th><th style={th}>进度</th><th style={th}>消息</th><th style={th}>时间</th><th style={th}>操作</th></tr></thead>
          <tbody>
            {tasks.length === 0 ? <tr><td style={{ ...td, color: C.textLo }} colSpan={6}>暂无任务</td></tr> :
              tasks.map(t => { const [tl, tc, tb] = TSTATUS[t.status] || TSTATUS.pending; return (
                <tr key={t.task_id}>
                  <td style={td}>{TASK_LABEL[t.task_type] || t.task_type}</td>
                  <td style={td}><span style={{ background: tb, color: tc, fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{tl}</span></td>
                  <td style={td}><div style={{ width: 90, height: 6, background: C.page, borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${t.progress || 0}%`, background: C.primary }} /></div></td>
                  <td style={{ ...td, color: C.textMd, maxWidth: 320 }}>{t.message || '—'}</td>
                  <td style={{ ...td, color: C.textLo }}>{(t.updated_at || '').slice(5, 16).replace('T', ' ')}</td>
                  <td style={td}>{['pending', 'running'].includes(t.status) &&
                    <span onClick={async () => { await api.cancelTask(t.task_id); load() }} style={{ color: C.danger, cursor: 'pointer', fontSize: 12 }}>取消</span>}</td>
                </tr>) })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  )
}

// ═══════════════ 我的资源（跨项目生成资产）═══════════════
function MyResources() {
  const [res, setRes] = useState(null)
  useEffect(() => { api.myResources().then(setRes).catch(() => setRes({})) }, [])
  const sec = { fontSize: 15, fontWeight: 800, color: C.text, margin: '20px 0 10px' }
  if (!res) return <PageShell title="我的资源"><div style={{ color: C.textLo }}>加载中…</div></PageShell>
  const { images = [], finals = [], exports = [], publishes = [] } = res
  return (
    <PageShell title="我的资源" sub="平台为你生成的全部资产：图片（头像/封面）、成片音频、导出与发布记录">
      <div style={sec}>🎨 生成图片（{images.length}）</div>
      {images.length === 0 ? <Card><span style={{ color: C.textLo, fontSize: 13 }}>还没有生成图片。在工作台点「🎨 生成封面」或角色列表的头像即可生成。</span></Card> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 12 }}>
          {images.map(im => (
            <a key={im.url} href={im.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
              <img src={im.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12, border: `1px solid ${C.border}` }} />
            </a>))}
        </div>}
      <div style={sec}>🎧 成片音频（{finals.length}）</div>
      {finals.length === 0 ? <Card><span style={{ color: C.textLo, fontSize: 13 }}>还没有成片。完成音频生成后在此汇总。</span></Card> :
        finals.map(f => (
          <Card key={f.audio_id} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{f.project_title} · 第{f.episode_number}集 {f.episode_title}</div>
              <div style={{ fontSize: 11.5, color: C.textLo }}>{(f.created_at || '').slice(0, 16).replace('T', ' ')}</div>
            </div>
            <audio controls src={f.file_url} style={{ height: 34, maxWidth: 320 }} />
            <a href={f.file_url} download style={{ color: C.primary, fontSize: 12.5, textDecoration: 'none' }}>⬇ 下载</a>
          </Card>))}
      <div style={sec}>📦 导出记录（{exports.length}）　📡 发布记录（{publishes.length}）</div>
      <Card pad={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[...exports.map(x => ({ k: 'x' + x.export_id, icon: '📦', t: `${x.project_title || ''} · ${x.file_name}`, s: `${((x.file_size || 0) / 1048576).toFixed(1)}MB`, at: x.created_at, ok: true })),
              ...publishes.map(r => ({ k: 'p' + r.publish_id, icon: '📡', t: `${r.project_title || ''} · ${r.episode_title || ''} → 设备内容库`, s: r.status === 'succeeded' ? '成功' : `失败：${(r.message || '').slice(0, 30)}`, at: r.created_at, ok: r.status === 'succeeded' }))]
              .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
              .map(row => (
                <tr key={row.k}>
                  <td style={{ fontSize: 13, color: C.text, padding: '9px 14px', borderBottom: `1px solid ${C.border}` }}>{row.icon} {row.t}</td>
                  <td style={{ fontSize: 12, color: row.ok ? C.textMd : C.danger, padding: '9px 14px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>{row.s}</td>
                  <td style={{ fontSize: 11.5, color: C.textLo, padding: '9px 14px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{(row.at || '').slice(5, 16).replace('T', ' ')}</td>
                </tr>))}
            {exports.length + publishes.length === 0 && <tr><td style={{ padding: 14, color: C.textLo, fontSize: 13 }}>暂无导出 / 发布记录</td></tr>}
          </tbody>
        </table>
      </Card>
    </PageShell>
  )
}

// ═══════════════ 素材库 ═══════════════
function MaterialLibrary() {
  const [items, setItems] = useState([])
  useEffect(() => { api.materials().then(d => setItems(d.materials || [])) }, [])
  const th = { textAlign: 'left', fontSize: 12, fontWeight: 700, color: C.textMd, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  const td = { fontSize: 13, color: C.text, padding: '10px 12px', borderBottom: `1px solid ${C.border}` }
  const MODE = { whole: '整本', chapters: '指定章节', custom_text: '自定义' }
  return (
    <PageShell title="素材库" sub="已导入的原著素材">
      <Card pad={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>素材标题</th><th style={th}>所属项目</th><th style={th}>范围</th><th style={th}>字数</th><th style={th}>导入时间</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td style={{ ...td, color: C.textLo }} colSpan={5}>暂无素材，新建项目并输入原著后自动入库</td></tr> :
              items.map(m => (
                <tr key={m.source_id}>
                  <td style={{ ...td, fontWeight: 600 }}>{m.title || '未命名'}</td>
                  <td style={td}>{m.project_title || '—'}</td>
                  <td style={td}>{MODE[m.selection_mode] || m.selection_mode}{m.chapter_range ? `（${m.chapter_range}）` : ''}</td>
                  <td style={td}>{m.word_count}</td>
                  <td style={{ ...td, color: C.textLo }}>{(m.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                </tr>))}
          </tbody>
        </table>
      </Card>
    </PageShell>
  )
}

// ═══════════════ 系统设置（多供应商，D-2/D-3/D-1） ═══════════════
const CAP_LABEL = { llm: '文本生成 LLM', tts: '语音合成 TTS', music: '音乐 BGM', sfx: '音效 SFX', image: '图片生成' }
// 每个供应商板块：标题 + 该板块的 key 字段
const PROVIDER_SECTIONS = [
  { cap: 'llm', title: 'DeepSeek', fields: [['DEEPSEEK_API_KEY', 'API Key', 'platform.deepseek.com'], ['DEEPSEEK_MODEL', '模型', '如 deepseek-chat']] },
  { cap: 'llm', title: 'OpenAI 兼容（GPT / Qwen / Moonshot 等）', fields: [['OPENAI_API_KEY', 'API Key', ''], ['OPENAI_BASE_URL', 'Base URL', '改此接入任意 OpenAI 兼容服务'], ['OPENAI_MODEL', '模型', '如 gpt-4o-mini / qwen-plus']] },
  { cap: 'llm', title: 'Anthropic Claude', fields: [['ANTHROPIC_API_KEY', 'API Key', 'console.anthropic.com'], ['CLAUDE_API_BASE', 'Base / OpenRouter Key', '填 sk-or-v1 走 OpenRouter'], ['CLAUDE_MODEL', '模型', '']] },
  { cap: 'tts', title: '豆包 seed-tts-2.0', fields: [['DOUBAO_API_KEY', 'API Key', '火山引擎 → 语音技术']] },
  { cap: 'tts', title: 'MiniMax（TTS + 音乐 + 音效共用）', fields: [['MINIMAX_API_KEY', 'API Key', 'platform.minimaxi.com'], ['MINIMAX_GROUP_ID', 'Group ID', '可留空']] },
  { cap: 'tts', title: 'ElevenLabs（TTS + 音效共用）', fields: [['ELEVENLABS_API_KEY', 'API Key', 'elevenlabs.io']] },
  { cap: 'music', title: 'Suno（本地代理，备用）', fields: [['SUNO_API_URL', '代理地址', '需自建 suno-api']] },
  { cap: 'image', title: '火山方舟 Seedream', fields: [['ARK_API_KEY', 'API Key', 'console.volcengine.com/ark'], ['ARK_IMAGE_MODEL', '模型', '']] },
  { cap: 'image', title: 'OpenAI 兼容图片', fields: [['OPENAI_IMAGE_MODEL', '图片模型', '如 gpt-image-1 / dall-e-3（Key 复用上方 OpenAI）']] },
  { cap: 'publish', title: '设备内容库（发布通道）', fields: [['DEVICE_LIBRARY_API_URL', '上传 API 地址', '由硬件侧提供'], ['DEVICE_LIBRARY_API_KEY', '鉴权 Key', 'Bearer Token']] },
]
function SettingsPage() {
  const [vals, setVals] = useState({}); const [saved, setSaved] = useState(false); const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState(null)
  const loadProviders = () => api.getProviders().then(setProviders)
  useEffect(() => { api.getSettings().then(d => setVals(d || {})).finally(() => setLoading(false)); loadProviders() }, [])
  const save = async () => { await api.saveSettings(vals); await loadProviders(); setSaved(true); setTimeout(() => setSaved(false), 2500) }
  const setDefault = async (cap, pid) => { await api.setProviderDefaults({ [cap]: pid }).then(setProviders) }
  const groups = ['llm', 'tts', 'music', 'image', 'publish']
  const GROUP_TITLE = { llm: '① 文本生成（LLM）', tts: '② 语音 / 音乐 / 音效', music: '', image: '③ 图片生成（头像 / 封面）', publish: '④ 发布通道' }
  return (
    <PageShell title="系统设置" sub="配置多家供应商的 API Key，并选择每种能力的默认引擎（保存后热更新，写回 backend/.env）">
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, maxWidth: 700 }}>
          {loading ? <div style={{ color: C.textLo }}>加载中…</div> : groups.map(g => {
            const secs = PROVIDER_SECTIONS.filter(s => s.cap === g)
            if (!secs.length) return null
            return (
              <div key={g}>
                {GROUP_TITLE[g] && <div style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: '18px 0 10px' }}>{GROUP_TITLE[g]}</div>}
                {secs.map(sec => (
                  <Card key={sec.title} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 12 }}>{sec.title}</div>
                    {sec.fields.map(([k, label, hint]) => (
                      <Field key={k} label={<span>{label} {hint && <span style={{ color: C.textLo, fontWeight: 400 }}>— {hint}</span>}</span>}>
                        <input value={vals[k] || ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} placeholder="未设置" style={inp}
                          type={k.includes('KEY') && k !== 'OPENAI_IMAGE_MODEL' ? 'password' : 'text'} />
                      </Field>))}
                  </Card>))}
              </div>)
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Btn onClick={save}>保存全部设置</Btn>
            {saved && <span style={{ color: C.ok, fontSize: 13 }}>✓ 已保存并热更新</span>}
          </div>
          <div style={{ fontSize: 12, color: C.textLo, marginTop: 14, lineHeight: 1.7 }}>
            也可直接编辑 <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 4 }}>backend/.env</code>。全部留空时平台仍可运行（demo 模式，AI 产出为占位内容）。
          </div>
        </div>
        {/* 右侧：默认引擎 */}
        <Card style={{ width: 300, position: 'sticky', top: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, marginBottom: 6 }}>默认生成引擎</div>
          <div style={{ fontSize: 12, color: C.textLo, marginBottom: 14 }}>每种能力的全局默认供应商；项目内可单独覆盖。</div>
          {providers && Object.keys(CAP_LABEL).map(cap => {
            const info = providers[cap]; if (!info) return null
            return (
              <Field key={cap} label={CAP_LABEL[cap]}>
                <select value={info.default || ''} onChange={e => setDefault(cap, e.target.value)} style={inp}>
                  <option value="">自动（{(info.providers.find(p => p.id === info.effective) || {}).name || info.effective}）</option>
                  {info.providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.configured ? ' ✓' : '（未配置）'}</option>))}
                </select>
              </Field>)
          })}
          <div style={{ fontSize: 11.5, color: C.textLo, lineHeight: 1.6 }}>✓ = Key 已配置。「自动」优先使用已配置的供应商。</div>
        </Card>
      </div>
    </PageShell>
  )
}

// ═══════════════ 登录（mock） ═══════════════
export function Login({ onLogin }) {
  const [email, setEmail] = useState('creator@example.com'); const [pw, setPw] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const doLogin = async () => {
    try {
      const u = await api.login(email.trim())
      onLogin(u)   // {user_id, email, name, role}
    } catch (e) { setErrMsg(e.message || '登录失败') }
  }
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg,${C.primary}18,#F5F6FA)`, fontFamily: '-apple-system,"PingFang SC",sans-serif' }}>
      <Card style={{ width: 380, padding: 34 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg,${C.primary},#8E7BFF)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><rect x="3" y="9" width="2.4" height="6" rx="1.2" /><rect x="7.5" y="5" width="2.4" height="14" rx="1.2" /><rect x="12" y="8" width="2.4" height="8" rx="1.2" /><rect x="16.5" y="3" width="2.4" height="18" rx="1.2" /><rect x="21" y="10" width="2.4" height="4" rx="1.2" /></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>音频短剧创作 Agent</div>
        </div>
        <div style={{ fontSize: 13, color: C.textLo, marginBottom: 22 }}>登录以继续创作儿童音频短剧</div>
        <Field label="邮箱"><input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} style={inp} /></Field>
        <Field label="密码"><input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="开发阶段任意密码" style={inp} /></Field>
        {errMsg && <div style={{ color: C.danger, fontSize: 12.5, marginBottom: 8 }}>{errMsg}</div>}
        <Btn onClick={doLogin} style={{ width: '100%', marginTop: 6, padding: '11px' }}>登录</Btn>
        <div style={{ textAlign: 'center', fontSize: 12, color: C.textLo, marginTop: 12 }}>开发环境 · 邮箱即账号，密码不校验；首次登录自动注册</div>
      </Card>
    </div>
  )
}

// ═══════════════ 路由分发 ═══════════════
export default function AdminPage({ page }) {
  switch (page) {
    case 'voices': return <VoicesAdmin />
    case 'styles': return <StylesAdmin />
    case 'safety': return <SafetyAdmin />
    case 'tasks': return <TasksCenter />
    case 'materials': return <MaterialLibrary />
    case 'resources': return <MyResources />
    case 'settings': return <SettingsPage />
    default: return <MaterialLibrary />
  }
}
