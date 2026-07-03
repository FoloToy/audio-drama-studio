# Studio → Agent 升级实施计划

> 目标：将当前「单会话 5 步向导（Studio）」升级为 PRD 描述的「多项目、多 Agent、带审核门禁的平台（Agent）」。
> 约束：**保持 Python/Flask 后端**，最大化复用现有音频管线。本文件只做规划，不含代码。
> 参考：[`01_PRD.md`](01_PRD.md)、[`02_Frontend_UI_Interaction.md`](02_Frontend_UI_Interaction.md)、[`03_Agent_Architecture_API.md`](03_Agent_Architecture_API.md)。

---

## 0. 现状基线与复用判定

| 现有资产 | 判定 | 升级后角色 |
|---|---|---|
| `services/doubao_tts.py` | ✅ 直接复用 | 音频生成 Agent 的 TTS 后端 |
| `services/elevenlabs_sfx.py` / `minimax_bgm.py` / `suno_bgm.py` | ✅ 直接复用 | 音效/BGM 生成器 |
| `services/mixer.py` | ✅ 直接复用 | 混音 Agent 后端 |
| `services/claude_service.py`（LLM 路由 DeepSeek/Anthropic） | ✅ 复用为底座 | 所有 Agent 的模型调用substrate |
| `services/voice_library.py` / `library.py` | ⚠️ 扩展 | 声音库需补授权/可商用/年龄段字段 |
| `main.py` SSE 进度 + threading | ⚠️ 抽象化 | 升级为通用 AgentTask 队列 |
| 前端 5 步组件（ScriptViewer/CharacterCard/ProgressTracker…） | ⚠️ 迁移 | 拆到各 stage 页面复用 |
| 「一个大 prompt 出整集剧本」 | ❌ 拆分 | 拆成 素材解析→大纲→改编→风格→剧本 多 Agent |

**基线结论**：现有实现覆盖 PRD「剧本→音频」后半程（≈40%）；升级重点是补齐「文本→剧本」前半程 + 平台骨架（持久化 / 项目 / Agent 编排 / 安全门禁）。

---

## 1. 目标后端架构（Flask，分层）

```
backend/
├── main.py                      ← 瘦入口：初始化 DB、注册 blueprint、启动 worker
├── config.py                    ← 现有，扩展配置项
├── db.py                        ← SQLite 连接 + schema 迁移（init/migrate）
├── store/                       ← 仓储层（每表一个 repository）
│   ├── projects.py  episodes.py  script_blocks.py  characters.py
│   ├── voices.py    voice_bindings.py  safety_findings.py
│   ├── audio_assets.py  exports.py  agent_tasks.py  source_materials.py
├── orchestrator/
│   ├── task_queue.py            ← AgentTask 队列 + worker 线程池 + SSE 广播
│   └── registry.py              ← task_type → Agent 类映射、重试策略
├── agents/
│   ├── base.py                  ← Agent 基类：run(input)->dict，强制 JSON schema 校验
│   ├── source_parser_agent.py   ← 素材解析
│   ├── outline_agent.py         ← 故事拆集
│   ├── age_adapt_agent.py       ← 适龄改编
│   ├── style_agent.py           ← 风格转换
│   ├── script_writer_agent.py   ← 剧本生成
│   ├── safety_agent.py          ← 儿童安全审核
│   ├── character_agent.py       ← 角色识别
│   ├── voice_matcher_agent.py   ← 声音匹配
│   ├── audio_agent.py           ← 封装 doubao_tts + elevenlabs/minimax
│   └── mix_agent.py             ← 封装 mixer
├── routes/                      ← 每资源一个 blueprint（见 §4）
└── services/                    ← 现有底层 provider，保持不动
```

**设计要点**
- **DB 用 SQLite**（`db.py` 单文件，零运维，满足 MVP；后续可平滑换 Postgres）。所有状态落库，刷新/重启后可续。
- **AgentTask 队列**统一所有长任务（解析/大纲/剧本/审核/推荐/TTS/混音/导出），对外只暴露 `POST /api/agent-tasks` + `GET /api/agent-tasks/:id`（SSE），复用现有 SSE 模式。
- **Agent 基类**统一：输入 dict → LLM（走 claude_service）→ JSON 解析修复（复用 `_extract_json`/`_parse_with_repair`）→ schema 校验 → 返回。MVP 阶段允许「mock 返回」开关，便于先跑通链路（PRD §14）。

---

## 2. 数据模型（SQLite 表，对齐 PRD §10 / §5）

13 张表：`users, projects, source_materials, source_analyses, episodes, characters, script_blocks, safety_findings, voices, voice_bindings, audio_assets, exports, agent_tasks`。

关键字段对齐 PRD schema（英文命名，替换现有中文散列结构）：
- `projects`: target_age(3-5/5-8/8-12)、episode_count、episode_duration_minutes、style、format、faithfulness、status（15 态枚举，见 UI §17.1）
- `source_materials`: 增 `chapter_range`（对齐设计稿「指定音节：第 X 回 至 第 Y 回」）、`selection_mode`(whole/chapters/custom_text)
- `script_blocks`: type(`narration/dialogue/sfx/bgm/pause/transition`)、emotion、speed、pause_after_ms、voice_id、review_status、audio_status、locked ← **这是与现有 `tts/sfx/bgm` 结构的核心迁移点**
- `voices`: gender_feel、age_feel、tone、style_tags、supported_emotions、**license_status、commercial_use**、sample_url、enabled ← 现有音色库需补授权/商用字段
- `agent_tasks`: task_type、status(pending/running/succeeded/failed/cancelled)、progress、message、input、result、error

**剧本 block 迁移策略**：写一个 `script_blocks` 双向适配器——旧 `{type:tts,speaker,emotion,text}` ↔ 新 `{type:dialogue/narration,character_id,emotion,speed,...}`——保证现有音频管线（读 script 数组）在迁移期继续工作。

---

## 3. Agent 编排链路（对齐 PRD §11）

```
文本输入 → [parse_source] → [safety_review]
        → [generate_outline] → 用户确认大纲
        → [adapt_age → style_transfer → generate_script] → [safety_review] → 用户审核剧本
        → [identify_characters] → [recommend_voices] → 用户确认声音
        → [generate_audio] → [remix_episode] → 用户试听 → [export_project]
```

`task_type` 枚举（PRD §4.3）：`parse_source, generate_outline, generate_script, rewrite_script_block, safety_review, identify_characters, recommend_voices, generate_audio, remix_episode, export_project`。

**重试策略**（PRD §6.3）：模型/TTS 失败自动重试 2 次；混音不无限重试；高风险审核不自动重试、退回用户；所有失败保留 error 原因。

**安全门禁**（PRD §8.3）：`risk_level=high 未处理` / `blocked` / 剧本未审核 / 声音未绑定 / 声音授权不可用 → 一律禁止进入音频生成，返回错误码 `SAFETY_RISK_BLOCKED` / `SCRIPT_NOT_APPROVED` / `VOICE_NOT_BOUND`。

---

## 4. API 面（Flask blueprints，对齐 PRD §4）

| Blueprint | 主要路由 |
|---|---|
| projects | `POST/GET /api/projects`、`GET/PATCH /api/projects/:id`、`?status=&keyword=` |
| source | `POST /api/projects/:id/source`、`/source-file`(multipart)、`GET /source-analysis` |
| agent_tasks | `POST /api/agent-tasks`、`GET /api/agent-tasks/:id`(SSE)、`POST /:id/cancel` |
| outline | `GET/PUT /api/projects/:id/outline`、`POST /outline/approve` |
| scripts | `GET/PUT /api/episodes/:id/script`、`POST /script-blocks/:id/rewrite`、`POST /episodes/:id/script/approve` |
| safety | `POST /api/safety/review`、`POST /api/safety/rewrite` |
| characters | `GET /api/projects/:id/characters`、`PATCH /characters/:id`、`POST /:id/lock` |
| voices | `GET /api/voices`（扩展现有）、`POST /voice-recommendations`、`POST /voice-bindings`、`POST /voices/:id/preview` |
| audio | `POST /api/episodes/:id/audio/generate`、`/audio/remix`、`POST /script-blocks/:id/audio/generate`、`GET /episodes/:id/audio` |
| exports | `POST /api/projects/:id/export`、`GET /exports` |

统一错误结构 `{error:{code,message,detail}}`，错误码表见 PRD §12.2。

---

## 5. 前端（React，增量迁移，以 `04_UI.png` 设计稿为准）

> ⚠️ **以设计稿为准，修正 PRD/UI 文档的字面结构**：`04_UI.png`（「音频短剧创作 Agent Beta」主工作台）显示，核心创作并非按 `/source`、`/outline`、`/scripts` 拆成多个独立路由，而是**收敛在单个三栏工作台内、通过分集 tab 与 5 步 Stepper 切换完成**。因此前端分两类页面：**① 平台级独立页（项目管理/后台）** 与 **② 项目工作台（单页三栏，内部分步）**。

### 5.1 全局框架（App Shell）
固定**左侧导航栏**（对齐设计稿 §左栏）：
- 顶部品牌「音频短剧创作 Agent · Beta」+ 主色「＋ 新建项目」按钮。
- 一级导航：**项目中心 / 素材库 / 声音库 / 我的资源 / 模板中心 / 任务中心**（注意用设计稿命名，取代 UI 文档 §2.1 的旧命名；「任务中心」对应 AgentTask 列表，「我的资源」为用户素材）。
- 「最近项目」列表：封面缩略图 + 项目名 + 更新时间；底部「使用指南 / 帮助中心」。

固定**顶部栏**：面包屑（项目中心 / 项目名 ✎）、右侧「保存草稿 / 生成音频 / 通知铃铛 / 用户头像」。

### 5.2 项目工作台 Stepper —— **5 步（非 PRD 的 6 步）**
```
① 素材与设定 → ② 脚本生成 → ③ 脚本审阅 → ④ 角色与声音 → ⑤ 生成与发布
```
设计稿将 PRD 的「素材解析」并入 ①，「分集大纲」并入 ①→② 的生成过程（大纲以分集 tab + 底部「项目预览」卡片体现，不单列页）。安全审核并入 ③「脚本审阅」。

### 5.3 页面清单

| 页面/路由 | 类型 | 复用现有 | 关键要素（据设计稿） |
|---|---|---|---|
| `/projects` 项目中心 | 独立页 | — | 项目卡片（封面/名称/年龄/集数/风格/状态/更新时间/创建人）、搜索、状态筛选、空态 |
| `/projects/new` 新建项目 | 独立页 | InputPage 部分 | 基础信息 + 项目类型；创建后进入工作台 ① |
| `/projects/:id` **项目工作台** | 单页三栏 | 见下 | 顶部 5 步 Stepper + 三栏 + 底部「项目预览」，内部分步切换（**核心页**） |
| `/admin/voices`·`/admin/styles`·`/admin/safety-rules` | 独立页 | StyleEditorModal/LibraryModal | 后台管理（P1） |

### 5.4 项目工作台三栏结构（`/projects/:id` 内部，对齐设计稿）

**左中栏「素材与设定」（Step ①）**——复用/改造 InputPage：
- 原著来源：**上传本地文件 / 文本粘贴** 切换（现仅粘贴，需补文件上传 + 已上传文件卡片：文件名/大小/✓）。
- **选择内容**：音节范围 = 整本 / 指定音节 / 自定义文本；指定音节时「第 X 回 至 第 Y 回」双下拉。（← 设计稿新增项，需进数据模型 `source_materials.chapter_range`）
- **目标受众**：3-5 岁 / 5-8 岁 / 8-12 岁 卡片选择（补齐现有缺失的年龄配置）。
- 故事风格：下拉 + 风格描述（复用 StyleEditorModal 数据）。
- **集数设置**：− N + 集（建议 2-5 集）、预计总时长自动估算。
- 底部主按钮：「下一步：生成脚本」。

**中栏「脚本生成 / 脚本审阅」（Step ②③）**——复用/改造 ScriptViewer：
- 顶部「✦ AI 生成完成」状态 +「重新生成」。
- **分集 tab**：第1集…第N集 切换。
- 本集概要（可折叠）+ 详细脚本：**按角色彩色区分**（旁白/角色名各异色），内联 `(音效:…)`、`(情绪)` 标签；「展开完整脚本」。
- Step ③ 叠加：块级编辑、局部重写弹窗、安全审核结果。

**右栏（随 Step 变化）**：
- **项目进度**：环形百分比 + 当前阶段文字（对齐 AgentTask/project.status）。
- **角色列表（本集）**：头像 + 角色名 + 类型（主角/配角/旁白）+ 性格 +「AI 建议角色」。
- **声音库推荐**：每角色推荐声音卡（试听 ▶ +「选择」），角色识别与声音匹配**就地同屏完成**（不单列 `/voices` 页）。

**底部「项目预览」**：各分集卡片（时长预估）+ 项目预计总时长 +「预览全部脚本」。

**Step ⑤ 生成与发布**——复用 ProductionPage/ProgressTracker/useSSE：参数面板 + 逐块进度 + 播放器（剧本同步高亮）+ 单句重生成 + 导出/记录。

### 5.5 全局交互
防抖自动保存（1-2s，顶部「保存草稿」）、长任务 5 态、锁定图标、4 个人工确认节点（大纲/剧本/声音/最终音频）。登录页 MVP 可用 mock。

---

## 6. 分阶段里程碑（对齐 PRD §13，含验收）

### Phase 0 — 平台骨架（无用户可感新功能，纯地基）
- `db.py` + 13 表 schema + 仓储层；`orchestrator/task_queue.py` 通用任务队列；`agents/base.py`。
- 把现有 `doubao_tts/mixer/…` 包成 `audio_agent`/`mix_agent`，用新队列跑通「老 5 步」→ 证明地基不破坏现有能力。
- 项目 CRUD + 列表页。
- **验收**：能创建项目、落库、刷新后状态保留；老的「文本→音频」链路经由新队列仍能产出 MP3。

### Phase 1 — 文本→剧本（补齐前半程，PRD §13.1）
- Agent：parse_source、generate_outline、generate_script（内部串 adapt_age+style）、safety_review。
- 页面：项目工作台 Step ①素材与设定（含目标受众/集数/音节范围）→ Step ②脚本生成（分集 tab + 底部项目预览）→ Step ③脚本审阅（块级编辑 + 局部重写 + 安全审核）。大纲不单列页，以分集 tab + 预览卡片呈现。
- **验收**：PRD §12.2/12.3/12.4/12.7——能出指定集数大纲（含钩子/冲突/教育价值/悬念/风险）、出结构化剧本、编辑并标记已审核、高风险被阻断。

### Phase 2 — 剧本→音频（复用后半程，PRD §13.2）
- Agent：identify_characters、recommend_voices；扩展声音库授权/商用字段；audio_agent 按 script_blocks 生成 + mix_agent 混音 + MP3 导出。
- 页面：Step ④角色与声音（角色列表 + 声音推荐**在工作台右栏就地完成**，试听/选择/锁定）→ Step ⑤生成与发布（参数面板 + 逐块进度 + 播放器 + 导出记录）。
- **验收**：PRD §12.5/12.6——角色绑定并锁定声音、单集音频区分角色声、插入音效/BGM、试听并导出 MP3。

### Phase 3 — 生产效率（PRD §13.3）
- 局部重写/单句重生成（`audio_status=stale`→只重生成该块→重混音）、批量生成全项目、版本历史、三个管理后台页。
- **验收**：单句改文本→只重生成该句并替换、批量生成多集、后台可维护声音/风格/安全规则。

---

## 7. 迁移风险与兼容策略

1. **不破坏现有能力**：Phase 0 先让老链路经新队列跑通，再逐步替换，任何阶段 `main` 分支都可产出 MP3。
2. **block 结构迁移**：用双向适配器过渡，避免一次性重写 mixer/tts 读取逻辑。
3. **Windows/编码**：保留 `main.py` 顶部 UTF-8 reconfigure；SQLite 路径用绝对路径。
4. **长任务超时**：沿用 `proxyTimeout: 350_000`（MiniMax BGM ~250s）。
5. **Mock 优先**：各前半程 Agent 先 mock 结构化输出打通 UI，再接真实模型（PRD §14），降低联调阻塞。

---

## 8. 建议起步动作（待批准后执行）

从 **Phase 0** 起步：`db.py` + 表结构 + `agent_tasks` 队列 + 项目 CRUD/列表页，并用新队列复跑现有音频链路做回归。此步不引入任何 AI 行为变化，是纯地基，风险最低、可验证。
