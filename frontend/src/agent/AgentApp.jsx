import React, { useState, useEffect, useCallback } from 'react'
import { api, runTask } from './api'
import AdminPage, { Login } from './Admin'

// ═══════════════ 设计令牌（精确对齐 04_UI.png） ═══════════════
const C = {
  page: '#F5F6FA', card: '#FFFFFF', border: '#ECECF2', borderMd: '#DCDCE6',
  primary: '#5A5FE0', primaryDeep: '#4B4FD6', primarySoft: '#EEEEFC', primaryBorder: '#C9CAF6',
  text: '#1C1C28', textMd: '#5B5B6E', textLo2: '#9A9AAE',
  ok: '#16A34A', okSoft: '#E7F6ED', warn: '#EA580C', danger: '#E11D48', dangerSoft: '#FCE7EC',
  blue: '#3B6FE0', tabActiveBg: '#EEEEFC',
}
const STEPS = ['素材与设定', '脚本生成', '脚本审阅', '角色与声音', '生成与发布']
const AGES = [
  { id: '3-5', label: '3-5岁', sub: '学前期', emoji: '🍼' },
  { id: '5-8', label: '5-8岁', sub: '低年级', emoji: '🧒' },
  { id: '8-12', label: '8-12岁', sub: '高年级', emoji: '🎒' },
]
const STYLES = [
  { id: 'sunjingxiu', name: '孙敬修风格', desc: '亲切生动，口语化讲述', long: '语言亲切生动，富有讲述感，适合儿童收听，节奏明快，突出故事趣味性。' },
  { id: 'classic_children_radio', name: '经典儿童广播故事风', desc: '标准广播剧质感', long: '标准广播剧质感，旁白清晰，角色分明，音效丰富。' },
  { id: 'bedtime', name: '睡前陪伴风', desc: '低刺激、温柔、慢节奏', long: '低刺激、温柔、慢节奏，帮助孩子放松入睡。' },
  { id: 'adventure_comedy', name: '冒险喜剧风', desc: '活泼、幽默、有张力', long: '活泼幽默、节奏明快、充满冒险张力。' },
  { id: 'guoxue', name: '国学启蒙风', desc: '典雅、有文化韵味', long: '典雅从容，富有文化韵味，寓教于乐。' },
  { id: 'gentle_healing', name: '温柔治愈风', desc: '温暖、抚慰、正向', long: '温暖抚慰、情绪正向，传递善意与勇气。' },
]
const STATUS_LABEL = {
  draft: '草稿', source_parsed: '已解析', outline_review: '待确认大纲', outline_approved: '大纲已确认',
  script_review: '脚本审阅', script_approved: '剧本已审核', voice_binding: '待选择声音',
  voice_confirmed: '声音已确认', audio_generating: '音频生成中', completed: '已完成', exported: '已导出', failed: '生成失败',
}
const ROLE_LABEL = { main_character: '主角', supporting: '配角', narrator: '旁白', animal: '动物', elder: '长者' }
// 说话人配色（对齐设计稿）
const SPEAKER_MAP = { '旁白': '#3B6FE0', '唐僧': '#B4703C', '孙悟空': '#1E93A6', '少女': '#D6489B', '白骨精': '#D6489B', '刘备': '#B4703C', '关羽': '#1E93A6', '张飞': '#D6489B' }
const HASH_COLORS = ['#3B6FE0', '#B4703C', '#1E93A6', '#D6489B', '#7C3AED', '#059669', '#CA8A04']
const colorFor = (name) => {
  if (!name) return '#5B5B6E'
  for (const k in SPEAKER_MAP) if (name.includes(k)) return SPEAKER_MAP[k]
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % HASH_COLORS.length
  return HASH_COLORS[h]
}
const GRADS = ['linear-gradient(135deg,#3a3a5c,#6b5b95)', 'linear-gradient(135deg,#7a4b3a,#b07a5b)', 'linear-gradient(135deg,#2d5a4a,#5b9578)', 'linear-gradient(135deg,#5a3a5a,#95739a)']
const gradFor = (id) => { let h = 0; for (const c of id || '') h = (h + c.charCodeAt(0)) % GRADS.length; return GRADS[h] }

// ═══════════════ 基础组件 ═══════════════
const shadow = '0 1px 3px rgba(20,20,40,.05)'
function Card({ children, style, pad = 18 }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: pad, boxShadow: shadow, ...style }}>{children}</div>
}
function Btn({ children, onClick, variant = 'primary', disabled, style, size = 'md' }) {
  const v = {
    primary: { background: C.primary, color: '#fff', border: `1px solid ${C.primary}` },
    deep: { background: C.primaryDeep, color: '#fff', border: `1px solid ${C.primaryDeep}` },
    ghost: { background: '#fff', color: C.text, border: `1px solid ${C.borderMd}` },
    soft: { background: '#fff', color: C.primary, border: `1px solid ${C.primaryBorder}` },
    danger: { background: '#fff', color: C.danger, border: `1px solid ${C.dangerSoft}` },
  }[variant]
  return <button onClick={disabled ? undefined : onClick} disabled={disabled}
    style={{ borderRadius: 9, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .15s',
      opacity: disabled ? 0.5 : 1, padding: size === 'sm' ? '6px 12px' : '9px 16px', fontSize: size === 'sm' ? 12.5 : 13.5, ...v, ...style }}>{children}</button>
}
function Ico({ d, size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
}
const ICONS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></>,
  sound: <><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M16 9a4 4 0 010 6" /></>,
  folder: <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></>,
  tpl: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  task: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  safety: <><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
  edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
  refresh: <><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></>,
}
function RiskTag({ level }) {
  const m = { low: [C.okSoft, C.ok, '低风险'], medium: ['#FEF3E2', C.warn, '中风险'], high: [C.dangerSoft, C.danger, '高风险'], blocked: ['#FEE2E2', '#B91C1C', '禁止'] }
  const [bg, fg, t] = m[level] || m.low
  return <span style={{ background: bg, color: fg, fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{t}</span>
}
function Avatar({ name, size = 34, url }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', flexShrink: 0 }} />
  const col = colorFor(name)
  return <div style={{ width: size, height: size, borderRadius: size / 2, background: col + '22', color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>{(name || '?')[0]}</div>
}
function PlayBtn({ url, color = C.ok }) {
  return <div onClick={() => url && new Audio(url).play().catch(() => {})}
    style={{ width: 24, height: 24, borderRadius: 12, color: url ? color : C.textLo2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: url ? 'pointer' : 'default', fontSize: 11 }}>▶</div>
}
const inp = { width: '100%', padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.borderMd}`, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', background: '#fff', color: C.text }

// ═══════════════ 侧栏 ═══════════════
function Sidebar({ recent, onNew, onNav, onOpen, active, user, onLogout, onHelp }) {
  const nav = [['grid', '项目中心', 'center'], ['box', '素材库', 'materials'], ['sound', '声音库', 'voices'], ['folder', '我的资源', 'resources'], ['tpl', '模板中心', 'styles'], ['task', '任务中心', 'tasks']]
  const foot = [['safety', '安全规则', 'safety'], ['gear', '系统设置', 'settings'], ['help', '帮助中心', 'HELP']]
  return (
    <div style={{ width: 226, background: '#fff', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh' }}>
      <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg,${C.primary},#8E7BFF)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><rect x="3" y="9" width="2.4" height="6" rx="1.2" /><rect x="7.5" y="5" width="2.4" height="14" rx="1.2" /><rect x="12" y="8" width="2.4" height="8" rx="1.2" /><rect x="16.5" y="3" width="2.4" height="18" rx="1.2" /><rect x="21" y="10" width="2.4" height="4" rx="1.2" /></svg>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: C.text, lineHeight: 1.15 }}>音频短剧创作</div>
          <div style={{ fontSize: 11, color: C.textLo2, display: 'flex', gap: 4, alignItems: 'center' }}>Agent <span style={{ background: C.primarySoft, color: C.primary, padding: '0 5px', borderRadius: 4, fontSize: 10 }}>Beta</span></div>
        </div>
      </div>
      <div style={{ padding: '4px 14px 8px' }}><Btn onClick={onNew} style={{ width: '100%', padding: '10px' }}>＋ 新建项目</Btn></div>
      <div style={{ padding: '8px 12px' }}>
        {nav.map(([ic, n, v]) => {
          const on = active === v
          return <div key={n} onClick={() => onNav(v)}
            style={{ padding: '9px 12px', borderRadius: 9, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              color: on ? C.primary : C.textMd, background: on ? C.primarySoft : 'transparent', fontWeight: on ? 700 : 500, marginBottom: 2 }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = C.page }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
            <Ico d={ICONS[ic]} /> {n}</div>
        })}
      </div>
      <div style={{ padding: '10px 18px 6px', fontSize: 12, color: C.textLo2, fontWeight: 600 }}>最近项目</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {recent.slice(0, 6).map(p => (
          <div key={p.project_id} onClick={() => onOpen(p.project_id)} style={{ padding: '8px', borderRadius: 9, cursor: 'pointer', marginBottom: 3, display: 'flex', gap: 10, alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.background = C.page} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: gradFor(p.project_id), flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
              <div style={{ fontSize: 10.5, color: C.textLo2 }}>更新于 {(p.updated_at || '').slice(0, 10)}</div>
            </div>
          </div>))}
        {recent.length > 0 && <div onClick={() => onNav('center')} style={{ textAlign: 'center', color: C.primary, fontSize: 12.5, padding: '8px', cursor: 'pointer', fontWeight: 600 }}>查看全部</div>}
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {foot.map(([ic, n, v]) => {
          const on = active === v
          return <div key={n} onClick={() => v === 'HELP' ? onHelp() : onNav(v)} style={{ padding: '8px 12px', borderRadius: 9, fontSize: 12.5, color: on ? C.primary : C.textMd, background: on ? C.primarySoft : 'transparent', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: on ? 700 : 500 }}><Ico d={ICONS[ic]} size={15} />{n}</div>
        })}
      </div>
      {/* 当前用户 + 退出登录 */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: 'linear-gradient(135deg,#F0A0C0,#A088E8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(user?.name || 'U')[0].toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || '未登录'}{user?.role === 'admin' && <span style={{ fontSize: 10, color: C.primary, marginLeft: 4 }}>管理员</span>}</div>
          <div style={{ fontSize: 10.5, color: C.textLo2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email || ''}</div>
        </div>
        <div onClick={onLogout} title="退出登录" style={{ cursor: 'pointer', color: C.textMd, padding: 4, display: 'flex' }}>
          <Ico d={<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>} size={16} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════ 帮助弹窗 ═══════════════
function HelpModal({ onClose }) {
  const steps = [
    ['① 素材与设定', '新建项目 → 上传/粘贴原著 → 选目标受众、风格、集数 → 生成脚本'],
    ['② 脚本生成 / ③ 审阅', '按集查看 AI 剧本，逐句编辑、局部重写、安全审核，确认每一集'],
    ['④ 角色与声音', 'AI 识别角色并推荐声音（豆包/MiniMax/ElevenLabs 可混用），可生成角色头像'],
    ['⑤ 生成与发布', '生成 TTS+音效+BGM 混音成片，试听后导出 MP3 或发布到设备内容库'],
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>使用指南</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: C.textLo2, fontSize: 20 }}>✕</span>
        </div>
        {steps.map(([t, d]) => (
          <div key={t} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 13, color: C.textMd, lineHeight: 1.7 }}>{d}</div>
          </div>))}
        <div style={{ background: C.page, borderRadius: 10, padding: 14, fontSize: 12.5, color: C.textMd, lineHeight: 1.8 }}>
          🔑 首次使用请到 <b>系统设置</b> 配置各供应商 API Key（LLM / TTS / 音乐 / 音效 / 图片），并选择默认生成引擎。未配置时平台以 demo 模式运行（AI 产出为占位内容）。
        </div>
      </div>
    </div>
  )
}

// ═══════════════ 项目中心 ═══════════════
function ProjectCenter({ onOpen, onNew, refresh }) {
  const [projects, setProjects] = useState([]); const [kw, setKw] = useState(''); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { setLoading(true); try { const d = await api.listProjects({ keyword: kw }); setProjects(d.projects || []) } finally { setLoading(false) } }, [kw])
  useEffect(() => { load() }, [load, refresh])
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '26px 34px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 23, fontWeight: 800, color: C.text }}>项目中心</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索项目…" style={{ ...inp, width: 220 }} />
          <Btn onClick={onNew}>＋ 新建项目</Btn>
        </div>
      </div>
      {loading ? <div style={{ color: C.textLo2 }}>加载中…</div> : projects.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ color: C.textMd, marginBottom: 16 }}>还没有音频短剧项目。创建第一个项目，开始生成儿童音频故事。</div>
          <Btn onClick={onNew}>新建项目</Btn>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 18 }}>
          {projects.map(p => (
            <Card key={p.project_id} style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
              <div onClick={() => onOpen(p.project_id)}>
                {p.cover && p.cover.startsWith('/api/')
                  ? <img src={p.cover} alt="" style={{ height: 96, width: '100%', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ height: 96, background: gradFor(p.project_id) }} />}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{p.title}</div>
                    <span style={{ fontSize: 11, background: C.primarySoft, color: C.primary, padding: '3px 9px', borderRadius: 7, fontWeight: 600, whiteSpace: 'nowrap' }}>{STATUS_LABEL[p.status] || p.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: C.textLo2, marginTop: 6 }}>
                    <span>🎯 {p.target_age}岁</span><span>📚 {p.episode_count}集</span><span>🎨 {(STYLES.find(s => s.id === p.style) || {}).name || p.style}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.textLo2 }}>更新于 {(p.updated_at || '').slice(0, 10)}</span>
                <span style={{ display: 'flex', gap: 12 }}>
                  <span onClick={async e => { e.stopPropagation(); await api.duplicateProject(p.project_id); load() }} style={{ fontSize: 12, color: C.primary, cursor: 'pointer' }}>复制</span>
                  <span onClick={async e => { e.stopPropagation(); if (confirm('删除该项目？')) { await api.deleteProject(p.project_id); load() } }} style={{ fontSize: 12, color: C.danger, cursor: 'pointer' }}>删除</span>
                </span>
              </div>
            </Card>))}
        </div>)}
    </div>
  )
}

// ═══════════════ 新建项目 ═══════════════
function Field({ label, children, style }) {
  return <div style={{ marginBottom: 14, ...style }}><div style={{ fontSize: 12, fontWeight: 600, color: C.textMd, marginBottom: 6 }}>{label}</div>{children}</div>
}
function NewProjectModal({ user, onClose, onCreated }) {
  const [f, setF] = useState({ title: '', description: '', project_type: 'adaptation', target_age: '8-12', episode_count: 3, episode_duration_minutes: 8, style: 'sunjingxiu', format: 'narrator_plus_roles', faithfulness: 'medium' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const create = async () => { if (!f.title.trim()) return alert('请填写项目名称'); const p = await api.createProject({ ...f, created_by: user?.user_id || 'user_001' }); onCreated(p.project_id) }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxHeight: '86vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 18 }}>新建项目</div>
        <Field label="项目名称 *"><input value={f.title} onChange={e => set('title', e.target.value)} placeholder="如：西游记·孙悟空三打白骨精" style={inp} /></Field>
        <Field label="项目简介"><input value={f.description} onChange={e => set('description', e.target.value)} placeholder="可选" style={inp} /></Field>
        <Field label="项目类型"><select value={f.project_type} onChange={e => set('project_type', e.target.value)} style={inp}>
          <option value="adaptation">原著改编</option><option value="single_story">单篇故事改编</option><option value="original_theme">主题原创</option><option value="knowledge">知识科普</option></select></Field>
        <Field label="目标受众"><div style={{ display: 'flex', gap: 10 }}>{AGES.map(a => (
          <div key={a.id} onClick={() => set('target_age', a.id)} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${f.target_age === a.id ? C.primary : C.border}`, background: f.target_age === a.id ? C.primarySoft : '#fff' }}>
            <div style={{ fontSize: 22 }}>{a.emoji}</div><div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.label}</div><div style={{ fontSize: 11, color: C.textLo2 }}>{a.sub}</div></div>))}</div></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="计划集数" style={{ flex: 1 }}><input type="number" min="1" max="30" value={f.episode_count} onChange={e => set('episode_count', +e.target.value)} style={inp} /></Field>
          <Field label="单集时长(分钟)" style={{ flex: 1 }}><input type="number" min="3" max="20" value={f.episode_duration_minutes} onChange={e => set('episode_duration_minutes', +e.target.value)} style={inp} /></Field>
        </div>
        <Field label="故事风格"><select value={f.style} onChange={e => set('style', e.target.value)} style={inp}>{STYLES.map(s => <option key={s.id} value={s.id}>{s.name} — {s.desc}</option>)}</select></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <Btn variant="ghost" onClick={onClose}>取消</Btn><Btn onClick={create}>创建项目并进入</Btn>
        </div>
      </div>
    </div>
  )
}

// ═══════════════ 工作台（单屏四区仪表盘） ═══════════════
function Workbench({ projectId, onHome, onNav, user, onLogout }) {
  const [project, setProject] = useState(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(null)
  const [activeEp, setActiveEp] = useState(0)
  const [voices, setVoices] = useState([])
  const [blocks, setBlocks] = useState([])
  const [toast, setToast] = useState('')
  const [produce, setProduce] = useState(false)
  const [showBell, setShowBell] = useState(false)
  const [showUser, setShowUser] = useState(false)
  const [notif, setNotif] = useState([])
  const loadNotif = useCallback(() => { api.adminTasks().then(d => setNotif((d.tasks || []).slice(0, 8))).catch(() => {}) }, [])
  useEffect(() => { loadNotif() }, [loadNotif, busy])

  const reload = useCallback(async () => { const p = await api.getProject(projectId); setProject(p); return p }, [projectId])
  useEffect(() => { reload() }, [reload])
  useEffect(() => { api.listVoices().then(d => setVoices(d.voices || [])) }, [])
  const flash = m => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const episodes = project?.episodes || []
  const ep = episodes[activeEp]
  useEffect(() => { if (ep) api.getScript(ep.episode_id).then(d => setBlocks(d.blocks || [])) }, [ep?.episode_id, project?.updated_at])

  // status → 高亮步骤
  useEffect(() => {
    if (!project) return
    const m = { draft: 0, source_parsed: 1, outline_review: 1, outline_approved: 1, script_review: 2, script_approved: 3, voice_binding: 3, voice_confirmed: 4, completed: 4, exported: 4 }
    if (m[project.status] !== undefined) setStep(m[project.status])
  }, [project?.status])

  const track = (label) => async (fn) => {
    setBusy({ progress: 0, message: label })
    try { await fn(p => setBusy(p)) } catch (e) { flash('❌ ' + e.message) } finally { setBusy(null); await reload() }
  }
  if (!project) return <div style={{ flex: 1, padding: 40, color: C.textLo2 }}>加载项目…</div>
  const pct = { draft: 5, source_parsed: 20, outline_review: 30, outline_approved: 40, script_review: 55, script_approved: 70, voice_binding: 75, voice_confirmed: 85, completed: 100, exported: 100 }[project.status] || 10
  const stepHint = { 0: '填写素材与设定后，生成分集脚本', 1: 'AI 已生成脚本，可查看与重新生成', 2: '完成脚本确认后，可进入声音选择', 3: '为每个角色绑定声音', 4: '生成音频并导出' }[step]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: C.page, position: 'relative' }}>
      {/* 顶部栏 */}
      <div style={{ height: 60, background: '#fff', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10, flexShrink: 0 }}>
        <span onClick={onHome} style={{ fontSize: 14, color: C.textLo2, cursor: 'pointer' }}>项目中心</span>
        <span style={{ color: C.textLo2 }}>/</span>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: C.text }}>{project.title}</span>
        <span onClick={async () => { const t = prompt('项目名称', project.title); if (t && t.trim() && t !== project.title) { await api.updateProject(project.project_id, { title: t.trim() }); await reload(); flash('✓ 已重命名') } }}
          title="重命名项目" style={{ color: C.textLo2, display: 'flex', cursor: 'pointer' }}><Ico d={ICONS.edit} size={15} /></span>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={() => track('生成故事封面…')(async setP => { await runTask({ task_type: 'generate_cover', project_id: project.project_id }, setP); flash('✓ 封面已生成') })} style={{ padding: '7px 14px' }} title="用图片引擎生成故事集封面">🎨 生成封面</Btn>
        <Btn size="sm" variant="ghost" onClick={async () => { await api.updateProject(project.project_id, { title: project.title }); await reload(); flash('✓ 已保存草稿') }} style={{ padding: '7px 14px' }}>保存草稿</Btn>
        <Btn size="sm" onClick={() => setProduce(true)} style={{ padding: '7px 16px' }}>生成音频</Btn>
        {/* 通知：Agent 任务动态 */}
        <span onClick={() => { setShowBell(v => !v); setShowUser(false); loadNotif() }} style={{ position: 'relative', color: C.textMd, cursor: 'pointer', display: 'flex' }}>
          <Ico d={ICONS.bell} size={19} />
          {notif.some(t => ['pending', 'running'].includes(t.status)) && <span style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 4, background: C.danger }} />}
        </span>
        {/* 用户菜单 */}
        <div onClick={() => { setShowUser(v => !v); setShowBell(false) }} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: 'linear-gradient(135deg,#F0A0C0,#A088E8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{(user?.name || 'U')[0].toUpperCase()}</div>
          <span style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{user?.name || '创作者'}</span>
          <span style={{ color: C.textLo2, fontSize: 11 }}>▾</span>
        </div>
      </div>
      {/* 通知下拉 */}
      {showBell && (
        <div style={{ position: 'absolute', top: 56, right: 130, width: 330, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 8px 30px rgba(20,20,40,.12)', zIndex: 40, padding: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, padding: '6px 10px' }}>任务通知</div>
          {notif.length === 0 ? <div style={{ padding: '10px', fontSize: 12.5, color: C.textLo2 }}>暂无任务</div> :
            notif.map(t => {
              const ST = { pending: ['等待', C.textLo2], running: ['进行中', C.blue], succeeded: ['✓ 成功', C.ok], failed: ['✕ 失败', C.danger], cancelled: ['已取消', C.textLo2] }
              const [sl, sc] = ST[t.status] || ST.pending
              const TL = { parse_source: '素材解析', generate_outline: '故事拆集', generate_script: '剧本生成', safety_review: '安全审核', identify_characters: '角色识别', recommend_voices: '声音匹配', generate_audio: '音频生成', remix_episode: '重新混音', export_project: '导出', generate_avatar: '角色头像', generate_cover: '封面生成', publish_device: '发布设备库' }
              return (
                <div key={t.task_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
                  <span style={{ color: C.text }}>{TL[t.task_type] || t.task_type}<span style={{ color: C.textLo2, marginLeft: 6, fontSize: 11 }}>{(t.message || '').slice(0, 16)}</span></span>
                  <span style={{ color: sc, whiteSpace: 'nowrap' }}>{sl}</span>
                </div>)
            })}
          <div onClick={() => { setShowBell(false); onNav && onNav('tasks') }} style={{ textAlign: 'center', color: C.primary, fontSize: 12.5, padding: '8px', cursor: 'pointer', fontWeight: 600, borderTop: `1px solid ${C.border}` }}>查看任务中心 →</div>
        </div>
      )}
      {/* 用户下拉 */}
      {showUser && (
        <div style={{ position: 'absolute', top: 56, right: 20, width: 200, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 8px 30px rgba(20,20,40,.12)', zIndex: 40, padding: 6 }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: C.textLo2 }}>{user?.email}</div>
          </div>
          <div onClick={() => { setShowUser(false); onNav && onNav('settings') }} style={{ padding: '9px 12px', fontSize: 13, color: C.textMd, cursor: 'pointer', borderRadius: 8 }}>⚙️ 系统设置</div>
          <div onClick={onLogout} style={{ padding: '9px 12px', fontSize: 13, color: C.danger, cursor: 'pointer', borderRadius: 8 }}>↪ 退出登录</div>
        </div>
      )}

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 30px', background: '#fff', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div onClick={() => setStep(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i === step ? C.text : i < step ? C.primary : '#fff', color: i <= step ? '#fff' : C.textLo2, border: i > step ? `1.5px solid ${C.borderMd}` : 'none' }}>{i < step ? '✓' : i + 1}</div>
              <span style={{ fontSize: 14, fontWeight: i === step ? 700 : 500, color: i === step ? C.text : C.textLo2 }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ margin: '0 14px', color: C.textLo2, fontSize: 14 }}>→</div>}
          </React.Fragment>))}
      </div>

      {/* 主体：三栏 + 底部预览 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
          {/* 左：素材与设定 */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <SettingsPanel project={project} track={track} setStep={setStep} flash={flash} reload={reload} />
          </div>
          {/* 中：脚本 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <ScriptPanel project={project} episodes={episodes} ep={ep} activeEp={activeEp} setActiveEp={setActiveEp}
              blocks={blocks} setBlocks={setBlocks} track={track} reload={reload} flash={flash} step={step} />
          </div>
          {/* 右：进度 + 角色 + 声音推荐 */}
          <div style={{ width: 306, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text, marginBottom: 14 }}>项目进度</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 74, height: 74 }}>
                  <svg width="74" height="74" style={{ transform: 'rotate(-90deg)' }}><circle cx="37" cy="37" r="31" fill="none" stroke={C.border} strokeWidth="7" /><circle cx="37" cy="37" r="31" fill="none" stroke={C.primary} strokeWidth="7" strokeDasharray={2 * Math.PI * 31} strokeDashoffset={2 * Math.PI * 31 * (1 - pct / 100)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .4s' }} /></svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: C.text }}>{pct}%</div>
                </div>
                <div><div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>当前阶段：{STATUS_LABEL[project.status]}</div><div style={{ fontSize: 12, color: C.textMd, marginTop: 3 }}>{stepHint}</div></div>
              </div>
            </Card>
            <RolePanel project={project} track={track} flash={flash} reload={reload} />
            <VoiceRecPanel project={project} voices={voices} blocks={blocks} track={track} reload={reload} flash={flash} />
          </div>
        </div>
        {/* 底部：项目预览 */}
        <PreviewBar project={project} episodes={episodes} activeEp={activeEp} setActiveEp={setActiveEp} onPreviewAll={() => setProduce(true)} />
      </div>

      {busy && <ProgressOverlay {...busy} />}
      {produce && <ProduceOverlay project={project} episodes={episodes} track={track} reload={reload} flash={flash} onClose={async () => { setProduce(false); await reload() }} />}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.text, color: '#fff', padding: '10px 20px', borderRadius: 10, zIndex: 80, fontSize: 14 }}>{toast}</div>}
    </div>
  )
}

// ── 左：素材与设定 ──
const CAP_LABEL = { llm: '文本 LLM', tts: '语音 TTS', music: '音乐', sfx: '音效', image: '图片' }
function SettingsPanel({ project, track, setStep, flash, reload }) {
  const [mode, setMode] = useState('upload')
  const [text, setText] = useState(project.source?.raw_text || '')
  const [selMode, setSelMode] = useState(project.source?.selection_mode || 'chapters')
  const [c1, setC1] = useState('第 27 回'); const [c2, setC2] = useState('第 27 回')
  const [fname, setFname] = useState(project.source?.title || '')
  const [count, setCount] = useState(project.episode_count)
  const [providers, setProviders] = useState(null)
  const [showEngine, setShowEngine] = useState(false)
  useEffect(() => { api.getProviders().then(setProviders).catch(() => {}) }, [])
  const style = STYLES.find(s => s.id === project.style) || STYLES[0]

  const onFile = async e => { const f = e.target.files?.[0]; if (!f) return; setText(await f.text()); setFname(f.name); setMode('upload'); flash('已读取 ' + f.name) }
  const go = () => {
    if (!text.trim()) return flash('请先粘贴或上传原著文本')
    track('生成剧本中…')(async setP => {
      if (count !== project.episode_count) await api.updateProject(project.project_id, { episode_count: count })
      await api.saveSource(project.project_id, { raw_text: text, title: fname || project.title, selection_mode: selMode, chapter_range: selMode === 'chapters' ? `${c1}-${c2}` : '' })
      await runTask({ task_type: 'parse_source', project_id: project.project_id }, setP)
      await runTask({ task_type: 'generate_outline', project_id: project.project_id }, setP)
      const p = await api.getProject(project.project_id)
      for (const e of (p.episodes || [])) await runTask({ task_type: 'generate_script', project_id: project.project_id, episode_id: e.episode_id }, setP)
      flash('✓ 剧本已生成'); setStep(1)
    })
  }
  const secTitle = { fontSize: 12.5, fontWeight: 700, color: C.text, margin: '4px 0 8px' }
  return (
    <Card style={{ height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 16 }}>素材与设定</div>
      <div style={secTitle}>原著来源</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <label style={{ ...pill(mode === 'upload'), cursor: 'pointer' }}>上传本地文件<input type="file" accept=".txt,.md" onChange={onFile} style={{ display: 'none' }} /></label>
        <div style={pill(mode === 'paste')} onClick={() => setMode('paste')}>文本粘贴</div>
      </div>
      {mode === 'paste'
        ? <textarea value={text} onChange={e => setText(e.target.value)} placeholder="粘贴原著文本…" style={{ ...inp, height: 96, resize: 'vertical', marginBottom: 12 }} />
        : <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 44, borderRadius: 7, background: C.primarySoft, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>TXT</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fname || '西游记（原著）.txt'}</div>
            <div style={{ fontSize: 11.5, color: C.textLo2 }}>{text ? (text.length / 500).toFixed(1) + ' KB' : '2.4 MB'}</div>
          </div>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: C.ok, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
        </div>}

      <div style={secTitle}>选择内容</div>
      <div style={{ fontSize: 12, color: C.textMd, marginBottom: 8 }}>音节范围</div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13 }}>
        {[['whole', '整本'], ['chapters', '指定音节'], ['custom_text', '自定义文本']].map(([v, l]) => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: selMode === v ? C.text : C.textMd }}>
            <span style={{ width: 15, height: 15, borderRadius: 8, border: `1.5px solid ${selMode === v ? C.primary : C.borderMd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{selMode === v && <span style={{ width: 7, height: 7, borderRadius: 4, background: C.primary }} />}</span>{l}</label>))}
      </div>
      {selMode === 'chapters' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input value={c1} onChange={e => setC1(e.target.value)} style={{ ...inp, textAlign: 'center' }} />
        <span style={{ color: C.textMd }}>至</span>
        <input value={c2} onChange={e => setC2(e.target.value)} style={{ ...inp, textAlign: 'center' }} /></div>}

      <div style={secTitle}>目标受众</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>{AGES.map(a => {
        const on = project.target_age === a.id
        return <div key={a.id} onClick={() => api.updateProject(project.project_id, { target_age: a.id }).then(reload)}
          style={{ flex: 1, textAlign: 'center', padding: '10px 4px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? C.primary : C.border}`, background: on ? C.primarySoft : '#fff' }}>
          <div style={{ fontSize: 19 }}>{a.emoji}</div><div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{a.label}</div><div style={{ fontSize: 10.5, color: C.textLo2 }}>{a.sub}</div></div>})}</div>

      <div style={secTitle}>故事风格</div>
      <select value={project.style} onChange={e => api.updateProject(project.project_id, { style: e.target.value }).then(reload)} style={{ ...inp, marginBottom: 8 }}>
        {STYLES.map(s => <option key={s.id} value={s.id}>{s.name}（{s.desc}）</option>)}</select>
      <div style={{ fontSize: 12, color: C.textLo2, lineHeight: 1.6, marginBottom: 14 }}>风格描述：{style.long}</div>

      <div style={secTitle}>集数设置</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.textMd }}>集数</span>
        <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.borderMd}`, borderRadius: 8, overflow: 'hidden' }}>
          <div onClick={() => setCount(Math.max(1, count - 1))} style={stepBtn}>−</div>
          <div style={{ width: 40, textAlign: 'center', fontSize: 14, fontWeight: 700, color: C.text }}>{count}</div>
          <div onClick={() => setCount(count + 1)} style={stepBtn}>＋</div>
        </div>
        <span style={{ fontSize: 12.5, color: C.textMd }}>集（建议 2-5 集）</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.textMd, marginBottom: 16 }}>预计总时长：{count * (project.episode_duration_minutes - 2)}-{count * (project.episode_duration_minutes + 2)} 分钟</div>

      {/* 生成引擎（项目级供应商覆盖，D-2） */}
      <div onClick={() => setShowEngine(v => !v)} style={{ ...secTitle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span>生成引擎 <span style={{ color: C.textLo2, fontWeight: 400 }}>（可选，默认跟随全局）</span></span>
        <span style={{ color: C.textLo2 }}>{showEngine ? '⌃' : '⌄'}</span>
      </div>
      {showEngine && providers && (
        <div style={{ marginBottom: 14 }}>
          {Object.keys(CAP_LABEL).map(cap => {
            const info = providers[cap]; if (!info) return null
            const cur = project[`${cap}_provider`] || ''
            return (
              <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ width: 62, fontSize: 12, color: C.textMd, flexShrink: 0 }}>{CAP_LABEL[cap]}</span>
                <select value={cur} onChange={e => api.updateProject(project.project_id, { [`${cap}_provider`]: e.target.value }).then(reload)}
                  style={{ ...inp, padding: '6px 10px', fontSize: 12.5 }}>
                  <option value="">全局默认（{(info.providers.find(p => p.id === info.effective) || {}).name || info.effective}）</option>
                  {info.providers.map(p => <option key={p.id} value={p.id}>{p.name}{p.configured ? ' ✓' : '（未配置）'}</option>)}
                </select>
              </div>)
          })}
        </div>
      )}

      <Btn onClick={go} variant="deep" style={{ width: '100%', padding: '11px' }}>下一步：生成脚本</Btn>
    </Card>
  )
}
const pill = on => ({ flex: 1, textAlign: 'center', padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: `1px solid ${on ? C.primaryBorder : C.border}`, background: on ? C.primarySoft : '#fff', color: on ? C.primary : C.textMd })
const stepBtn = { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.textMd, fontSize: 16 }

// ── 中：脚本 ──
function ScriptPanel({ project, episodes, ep, activeEp, setActiveEp, blocks, setBlocks, track, reload, flash, step }) {
  const [openSummary, setOpenSummary] = useState(true)
  const [expand, setExpand] = useState(false)
  const findings = (project.findings || []).filter(f => f.episode_id === ep?.episode_id)
  const review = step >= 2

  if (!ep) return <Card style={{ height: '100%' }}>
    <div style={{ fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 10 }}>脚本生成</div>
    <div style={{ color: C.textLo2, fontSize: 13.5 }}>在左侧填写素材与设定后，点击「下一步：生成脚本」，AI 将生成分集大纲与详细脚本。</div>
  </Card>

  const reloadBlocks = async () => { const d = await api.getScript(ep.episode_id); setBlocks(d.blocks || []) }
  const regen = () => track('重新生成本集剧本…')(async setP => { await runTask({ task_type: 'generate_script', project_id: project.project_id, episode_id: ep.episode_id }, setP); flash('✓ 已重新生成') })
  const runSafety = () => track('儿童安全审核中…')(async setP => { const r = await runTask({ task_type: 'safety_review', project_id: project.project_id, episode_id: ep.episode_id }, setP); flash(`审核完成：${(r.findings || []).length} 处风险`) })
  const saveText = async b => { await api.saveScript(ep.episode_id, [{ block_id: b.block_id, text: b.text }]) }
  const rewrite = b => { const ins = prompt('改写方向（更温柔 / 更活泼 / 缩短 / 降低刺激感）', '更适合儿童，换一种说法'); if (ins) track('局部重写中…')(async () => { await api.rewriteBlock(b.block_id, { rewrite_instruction: ins }); await reloadBlocks(); flash('✓ 已改写') }) }
  const regenBlock = b => track('重生成该句语音…')(async setP => { const t = await api.regenerateBlock(ep.episode_id, b.block_id); await new Promise((res, rej) => { const es = new EventSource(`/api/agent-tasks/${t.task_id}/stream`); es.onmessage = e => { const d = JSON.parse(e.data); if (d.message) setP({ progress: d.progress, message: d.message }); if (['succeeded', 'done'].includes(d.type)) { es.close(); res() } else if (['failed', 'error'].includes(d.type)) { es.close(); rej(new Error(d.error?.message || '失败')) } } }); flash('✓ 该句语音已重生成') })
  const approve = () => track('确认剧本…')(async () => { try { await api.approveScript(ep.episode_id); flash('✓ 剧本已审核') } catch (e) { flash('❌ ' + e.message) } })
  const addEp = () => track('新增一集…')(async () => { await api.addEpisode(project.project_id); flash('✓ 已新增一集') })
  const delEp = () => { if (confirm(`删除「第${ep.episode_number}集：${ep.title}」？`)) track('删除分集…')(async () => { await api.deleteEpisode(ep.episode_id); setActiveEp(0); flash('✓ 已删除') }) }
  const toggleLock = () => track(ep.locked ? '解锁分集…' : '锁定分集…')(async () => { await api.patchEpisode(ep.episode_id, { locked: !ep.locked }); flash(ep.locked ? '已解锁' : '已锁定，重新生成不会覆盖') })

  const shown = expand ? blocks : blocks.slice(0, 12)
  return (
    <Card style={{ height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>脚本生成 <span style={{ color: C.primary, fontSize: 13, fontWeight: 700 }}>✦ AI 生成完成</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {review && <Btn size="sm" variant="ghost" onClick={runSafety}>🛡 安全审核</Btn>}
          <Btn size="sm" variant="ghost" onClick={regen}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ico d={ICONS.refresh} size={13} />重新生成</span></Btn>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.textLo2, margin: '8px 0 14px' }}>已根据您选择的内容、目标受众与风格，生成 {episodes.length} 集脚本大纲与详细脚本。</div>

      {/* 分集 tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {episodes.map((e, i) => (
          <div key={e.episode_id} onClick={() => setActiveEp(i)} style={{ padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center',
            border: `1px solid ${i === activeEp ? C.primaryBorder : C.border}`, background: i === activeEp ? C.tabActiveBg : '#fff', color: i === activeEp ? C.primary : C.textMd }}>
            {e.locked && <span title="已锁定">🔒</span>}第{e.episode_number}集：{e.title}{e.review_status === 'approved' && <span style={{ color: C.ok }}>✓</span>}</div>))}
        <div onClick={addEp} title="新增一集" style={{ padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px dashed ${C.borderMd}`, color: C.textMd }}>＋ 加一集</div>
      </div>
      {/* 分集操作 */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5 }}>
        <span onClick={toggleLock} style={{ color: C.textMd, cursor: 'pointer' }}>{ep.locked ? '🔓 解锁本集' : '🔒 锁定本集'}</span>
        {episodes.length > 1 && <span onClick={delEp} style={{ color: C.danger, cursor: 'pointer' }}>🗑 删除本集</span>}
      </div>

      {/* 本集概要 */}
      <div style={{ background: C.page, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div onClick={() => setOpenSummary(o => !o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>本集概要</div><span style={{ color: C.textLo2, transform: openSummary ? 'none' : 'rotate(180deg)' }}>⌃</span></div>
        {openSummary && <div style={{ fontSize: 13, color: C.textMd, marginTop: 8, lineHeight: 1.6 }}>{ep.summary}</div>}
      </div>

      {/* 安全审核 */}
      {review && findings.length > 0 && findings.map(f => (
        <div key={f.finding_id} style={{ background: C.dangerSoft, borderRadius: 9, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><RiskTag level={f.risk_level} /><b style={{ fontSize: 13 }}>{f.risk_type}</b>{f.resolved && <span style={{ color: C.ok, fontSize: 12 }}>已处理</span>}</div>
          <div style={{ fontSize: 12, color: C.textMd }}>{f.reason}　建议：{f.suggestion}</div>
          {!f.resolved && <Btn size="sm" variant="soft" style={{ marginTop: 8 }} onClick={() => track('安全改写…')(async () => { await api.safetyRewrite({ finding_id: f.finding_id, block_id: f.block_id, original_text: f.text, rewrite_goal: f.suggestion }); await reloadBlocks(); flash('✓ 已改写') })}>一键改写</Btn>}
        </div>))}

      {/* 详细脚本 */}
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 10 }}>详细脚本 <span style={{ color: C.textLo2, fontWeight: 400, fontSize: 12 }}>（{expand ? '完整' : '节选'}）</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {shown.map(b => {
          if (b.type === 'bgm') return <div key={b.block_id} style={metaRow}>🎵 BGM {b.bgm_action === 'stop' ? '停止' : `：${b.text}`}</div>
          if (b.type === 'sfx') return <div key={b.block_id} style={metaRow}>（音效：{b.text}）</div>
          const col = colorFor(b.character_name)
          return (
            <div key={b.block_id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 74, color: col, fontWeight: 700, fontSize: 13.5, textAlign: 'right', paddingTop: review ? 6 : 0 }}>{b.character_name}：</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {b.emotion && <span style={{ color: C.textLo2, fontSize: 12.5, marginRight: 4 }}>（{b.emotion}）</span>}
                {review
                  ? <textarea defaultValue={b.text} onBlur={e => saveText({ ...b, text: e.target.value })}
                    style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 8px', outline: 'none', resize: 'vertical', fontSize: 13.5, color: C.text, fontFamily: 'inherit', lineHeight: 1.6 }} rows={Math.max(1, Math.ceil((b.text || '').length / 30))} />
                  : <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.7 }}>{b.text}</span>}
              </div>
              {review && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6 }}>
                <span onClick={() => rewrite(b)} style={{ fontSize: 12, color: C.primary, cursor: 'pointer', whiteSpace: 'nowrap' }}>重写</span>
                {ep.audio_status === 'generated' && <span onClick={() => regenBlock(b)} style={{ fontSize: 12, color: C.textMd, cursor: 'pointer', whiteSpace: 'nowrap' }}>🔊 重生成</span>}
              </div>}
            </div>)
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 18 }}>
        <Btn variant="soft" onClick={() => setExpand(x => !x)} style={{ padding: '9px 22px' }}>{expand ? '收起脚本 ⌃' : '展开完整脚本 ⌄'}</Btn>
        {review && <Btn onClick={approve}>确认本集剧本 →</Btn>}
      </div>
    </Card>
  )
}
const metaRow = { fontSize: 12.5, color: C.textLo2, paddingLeft: 86 }

// ── 右：角色列表 ──
function RolePanel({ project, track, flash, reload }) {
  const chars = project.characters || []
  const recommend = () => track('AI 识别角色…')(async setP => { await runTask({ task_type: 'identify_characters', project_id: project.project_id }, setP); flash('✓ 已识别角色') })
  const toggleLock = async c => { await api.updateCharacter(c.character_id, { locked: !c.locked }); await reload(); flash(c.locked ? '角色已解锁' : '角色已锁定') }
  const genAvatars = () => track('生成角色头像…')(async setP => { await runTask({ task_type: 'generate_avatar', project_id: project.project_id }, setP); flash('✓ 头像已生成') })
  const genOneAvatar = c => track(`生成 ${c.name} 头像…`)(async setP => { await runTask({ task_type: 'generate_avatar', project_id: project.project_id, input: { character_id: c.character_id } }, setP); flash('✓ 头像已生成') })
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>角色列表 <span style={{ color: C.textLo2, fontWeight: 400, fontSize: 12 }}>（本集）</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="soft" onClick={recommend} style={{ padding: '5px 10px' }}>✦ AI 建议角色</Btn>
          {chars.length > 0 && <Btn size="sm" variant="ghost" onClick={genAvatars} style={{ padding: '5px 10px' }} title="用图片引擎生成全部角色头像">🎨</Btn>}
        </div>
      </div>
      {chars.length === 0 ? <div style={{ fontSize: 12.5, color: C.textLo2 }}>剧本生成后自动识别角色</div> :
        chars.map(c => (
          <div key={c.character_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
            <span onClick={() => genOneAvatar(c)} title="点击生成头像" style={{ cursor: 'pointer', display: 'flex' }}>
              <Avatar name={c.name} size={36} url={c.avatar_url} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: C.textLo2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.personality || c.voice_suggestion || '—'}</div>
            </div>
            <span onClick={() => toggleLock(c)} title={c.locked ? '已锁定，重新生成不覆盖' : '锁定角色设定'} style={{ cursor: 'pointer', fontSize: 12, opacity: c.locked ? 1 : 0.4 }}>{c.locked ? '🔒' : '🔓'}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.role_type === 'main_character' ? C.blue : C.textLo2 }}>{ROLE_LABEL[c.role_type] || ''}</span>
          </div>))}
    </Card>
  )
}

// ── 右：声音库推荐 ──
function VoiceRecPanel({ project, voices, blocks, track, reload, flash }) {
  const chars = project.characters || []
  const bindings = project.bindings || []
  const bmap = Object.fromEntries(bindings.map(b => [b.character_id, b.voice_id]))
  const recommend = () => track('AI 匹配声音…')(async setP => {
    await runTask({ task_type: 'identify_characters', project_id: project.project_id }, setP)
    await runTask({ task_type: 'recommend_voices', project_id: project.project_id }, setP); flash('✓ 已推荐声音')
  })
  const pick = async (cid, vid) => { await api.setBindings(project.project_id, [{ character_id: cid, voice_id: vid }]); await reload(); flash('✓ 已绑定') }
  const vmeta = Object.fromEntries(voices.map(v => [v.voice_id, v]))
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>声音库推荐</div>
        <span onClick={recommend} style={{ fontSize: 12.5, color: C.primary, cursor: 'pointer', fontWeight: 600 }}>更多声音 ›</span>
      </div>
      {chars.length === 0 ? <div style={{ fontSize: 12.5, color: C.textLo2 }}>点击「更多声音」自动为角色推荐声音</div> :
        chars.map((c, i) => {
          const vid = bmap[c.character_id] || voices[i % Math.max(voices.length, 1)]?.voice_id
          const v = vmeta[vid]
          const PROV_TAG = { doubao: '豆包', minimax: 'MiniMax', elevenlabs: '11Labs' }
          return (
            <div key={c.character_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <Avatar name={c.name} size={34} url={c.avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: 'flex', gap: 5, alignItems: 'center' }}>{c.name}{bmap[c.character_id] && <span style={{ fontSize: 10, color: C.ok, background: C.okSoft, padding: '0 5px', borderRadius: 4 }}>已选</span>}</div>
                <div style={{ fontSize: 11, color: C.textLo2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
                  {v?.provider && <span style={{ color: C.primary, marginRight: 4 }}>[{PROV_TAG[v.provider] || v.provider}]</span>}{v?.name ? `${v.name} · ` : ''}{v?.tone || '—'}
                </div>
              </div>
              <PlayBtn url={v?.sample_url} />
              <Btn size="sm" variant="soft" style={{ padding: '4px 10px' }} onClick={() => vid && pick(c.character_id, vid)}>选择</Btn>
            </div>)
        })}
    </Card>
  )
}

// ── 底部：项目预览 ──
function PreviewBar({ project, episodes, activeEp, setActiveEp, onPreviewAll }) {
  const dur = project.episode_duration_minutes
  const total = episodes.length * dur
  return (
    <Card style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text, marginBottom: 14 }}>项目预览 <span style={{ color: C.textLo2, fontWeight: 400, fontSize: 12 }}>（脚本时长预估）</span></div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {episodes.length === 0 ? <div style={{ color: C.textLo2, fontSize: 13 }}>生成脚本后显示分集预览</div> :
          episodes.map((e, i) => (
            <div key={e.episode_id} onClick={() => setActiveEp(i)} style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${i === activeEp ? C.primaryBorder : C.border}`, background: i === activeEp ? C.tabActiveBg : '#fff' }}>
              <div style={{ width: 30, height: 34, borderRadius: 6, background: '#fff', border: `1px solid ${C.borderMd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMd }}>📄</div>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>第{e.episode_number}集：{e.title}</div><div style={{ fontSize: 11.5, color: C.textLo2 }}>时长预估：{dur - 3}-{dur} 分钟</div></div>
            </div>))}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.textMd }}>预计总时长</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>{total - 5}-{total + 3} 分钟</div>
        </div>
        <Btn variant="soft" onClick={onPreviewAll} style={{ flexShrink: 0 }}>预览全部脚本</Btn>
      </div>
    </Card>
  )
}

// ── 生成与发布 overlay ──
function ProduceOverlay({ project, episodes, track, reload, flash, onClose }) {
  const [exports, setExports] = useState([])
  const [pubs, setPubs] = useState([])
  const [opts, setOpts] = useState({ include_sfx: true, include_bgm: true })
  useEffect(() => {
    api.listExports(project.project_id).then(d => setExports(d.exports || []))
    api.publishRecords(project.project_id).then(d => setPubs(d.records || [])).catch(() => {})
  }, [project.status])
  const gen = ep => track(`生成《${ep.title}》音频…（BGM 每首约 3-4 分钟）`)(async setP => { await runTask({ task_type: 'generate_audio', project_id: project.project_id, episode_id: ep.episode_id, input: { generation_options: opts } }, setP); flash('✓ 音频完成') })
  const doExport = () => track('导出中…')(async setP => { await runTask({ task_type: 'export_project', project_id: project.project_id, input: { export_scope: 'all_episodes', formats: ['mp3'], include_script: true } }, setP); const d = await api.listExports(project.project_id); setExports(d.exports || []); flash('✓ 已导出') })
  const doPublish = () => track('发布到设备内容库…')(async setP => {
    await runTask({ task_type: 'publish_device', project_id: project.project_id }, setP)
    const d = await api.publishRecords(project.project_id); setPubs(d.records || []); flash('✓ 已发布到设备内容库')
  })
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width: 640, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>生成与发布</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: C.textLo2, fontSize: 20 }}>✕</span>
        </div>
        <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
          <Toggle label="背景音乐 BGM" on={opts.include_bgm} set={v => setOpts(o => ({ ...o, include_bgm: v }))} />
          <Toggle label="音效 SFX" on={opts.include_sfx} set={v => setOpts(o => ({ ...o, include_sfx: v }))} />
        </div>
        {episodes.map(ep => (
          <div key={ep.episode_id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>第{ep.episode_number}集：{ep.title} {ep.audio_status === 'generated' && <span style={{ color: C.ok, fontSize: 12 }}>✓ 已生成</span>}</div>
              <Btn size="sm" onClick={() => gen(ep)}>⚡ 生成音频</Btn>
            </div>
            {ep.final_audio_url && <div style={{ marginTop: 10 }}><audio controls src={ep.final_audio_url} style={{ width: '100%' }} /><a href={ep.final_audio_url} download style={{ color: C.primary, fontSize: 12.5, textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>⬇ 下载 MP3</a></div>}
          </div>))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12.5, color: C.textMd }}>导出 {exports.length} 条 · 发布 {pubs.length} 条</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={doExport}>导出 MP3</Btn>
            <Btn variant="deep" onClick={doPublish} title="推送成片到自有设备（故事机）内容库">📡 发布到设备内容库</Btn>
          </div>
        </div>
        {exports.map(x => <div key={x.export_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textLo2, padding: '6px 0', borderTop: `1px solid ${C.border}` }}><span>{x.file_name}</span><span>{(x.file_size / 1024 / 1024).toFixed(1)}MB</span></div>)}
        {pubs.slice(0, 6).map(r => (
          <div key={r.publish_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.textMd }}>📡 设备库 · {(episodes.find(e => e.episode_id === r.episode_id) || {}).title || r.episode_id}</span>
            <span style={{ color: r.status === 'succeeded' ? C.ok : C.danger }}>{r.status === 'succeeded' ? '成功' : `失败：${(r.message || '').slice(0, 40)}`}</span>
          </div>))}
      </div>
    </div>
  )
}
function Toggle({ label, on, set }) {
  return <div onClick={() => set(!on)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
    <div style={{ width: 38, height: 22, borderRadius: 11, background: on ? C.primary : C.borderMd, position: 'relative', transition: 'all .2s' }}><div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'all .2s' }} /></div>
    <span style={{ fontSize: 13, color: C.text }}>{label}</span></div>
}
function ProgressOverlay({ progress = 0, message = '' }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,.72)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Card style={{ width: 420, textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>{message || 'Agent 正在工作…'}</div>
      <div style={{ height: 8, background: C.page, borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress || 3}%`, background: C.primary, borderRadius: 4, transition: 'width .3s' }} /></div>
      <div style={{ fontSize: 12, color: C.textLo2, marginTop: 8 }}>{progress || 0}%</div>
    </Card></div>
}

// ═══════════════ 根 ═══════════════
const ADMIN_VIEWS = ['materials', 'voices', 'resources', 'styles', 'tasks', 'safety', 'settings']
export default function AgentApp() {
  const [user, setUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('ads_user') || 'null')
      return u && u.user_id ? u : null   // 旧版 mock 会话（无 user_id）自动失效
    } catch { return null }
  })
  const [view, setView] = useState('center')
  const [pid, setPid] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [recent, setRecent] = useState([])
  const [refresh, setRefresh] = useState(0)
  const loadRecent = useCallback(() => { api.listProjects().then(d => setRecent(d.projects || [])) }, [])
  useEffect(() => { if (user) loadRecent() }, [loadRecent, refresh, user])

  const logout = () => { localStorage.removeItem('ads_user'); setUser(null); setView('center'); setPid(null) }
  if (!user) return <Login onLogin={u => { localStorage.setItem('ads_user', JSON.stringify(u)); setUser(u) }} />

  const open = id => { setPid(id); setView('workbench') }
  const nav = v => { setView(v); if (v === 'center') setRefresh(r => r + 1) }
  const sidebarActive = view === 'workbench' ? null : view
  return (
    <div style={{ display: 'flex', height: '100vh', background: C.page, color: C.text, fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif' }}>
      <Sidebar recent={recent} onNew={() => setShowNew(true)} onNav={nav} onOpen={open} active={sidebarActive}
        user={user} onLogout={logout} onHelp={() => setShowHelp(true)} />
      {view === 'center' ? <ProjectCenter onOpen={open} onNew={() => setShowNew(true)} refresh={refresh} />
        : view === 'workbench' ? <Workbench key={pid} projectId={pid} onHome={() => nav('center')} onNav={nav} user={user} onLogout={logout} />
          : ADMIN_VIEWS.includes(view) ? <AdminPage page={view} />
            : <ProjectCenter onOpen={open} onNew={() => setShowNew(true)} refresh={refresh} />}
      {showNew && <NewProjectModal user={user} onClose={() => setShowNew(false)} onCreated={id => { setShowNew(false); setRefresh(r => r + 1); open(id) }} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}
