# Agent 技术架构与接口定义

## 1. 文档目标

本文档用于指导后端、Agent 编排、模型调用、TTS、混音、任务队列和 API 开发。

目标是支持 MVP 闭环：

```text
内容输入
→ 素材解析
→ 儿童安全审核
→ 故事拆集
→ 剧本生成
→ 人工审核
→ 声音绑定
→ 音频生成
→ 混音
→ 导出
```

---

## 2. 系统总体架构

### 2.1 推荐服务模块

```text
Web Frontend
  ↓
API Gateway / Backend API
  ↓
Project Service
Source Material Service
Agent Orchestrator
Script Service
Safety Review Service
Voice Service
Audio Generation Service
Export Service
Task Queue
Object Storage
Database
```

### 2.2 核心后端服务

#### Project Service

负责项目创建、项目状态、项目配置、项目列表。

#### Source Material Service

负责文本输入、文件上传、文本清洗、素材版本管理。

#### Agent Orchestrator

负责任务编排，调用不同 Agent，记录任务状态和结果。

#### Script Service

负责分集大纲、剧本块、剧本版本、人工修改和锁定逻辑。

#### Safety Review Service

负责儿童安全审核、风险标记、风险等级、改写建议。

#### Voice Service

负责声音库、声音授权、声音推荐、角色声音绑定。

#### Audio Generation Service

负责 TTS 调用、分句音频生成、音效、BGM、混音。

#### Export Service

负责 MP3 / WAV / 剧本文档 / JSON 工程文件导出。

---

## 3. Agent 列表

### 3.1 素材解析 Agent

职责：

1. 清洗用户输入文本。
2. 识别章节或故事单元。
3. 提取主要人物。
4. 总结主要情节。
5. 判断是否适合儿童改编。
6. 输出可改编单元。

输入：

```json
{
  "project_id": "project_001",
  "source_text": "...",
  "target_age": "5-8",
  "episode_count": 3,
  "style": "classic_children_radio",
  "faithfulness": "medium"
}
```

输出：

```json
{
  "summary": "故事主要讲述...",
  "characters": [
    {
      "name": "孙悟空",
      "role_type": "main_character",
      "description": "活泼、勇敢、好奇"
    }
  ],
  "story_units": [
    {
      "unit_id": "unit_001",
      "title": "石猴出世",
      "summary": "花果山上，一只石猴诞生。",
      "suggested_age": "3-8",
      "risk_level": "low"
    }
  ],
  "safety_findings": [],
  "adaptation_suggestions": ["适合改编为多角色短剧"]
}
```

---

### 3.2 儿童安全审核 Agent

职责：

1. 检查暴力、恐怖、成人化、歧视、危险行为等内容。
2. 根据年龄段判断风险。
3. 输出风险等级和修改建议。
4. 阻止高风险内容进入下一阶段。

输入：

```json
{
  "target_age": "5-8",
  "content_type": "script",
  "content": "..."
}
```

输出：

```json
{
  "risk_level": "medium",
  "blocked": false,
  "findings": [
    {
      "finding_id": "finding_001",
      "risk_type": "violence",
      "risk_level": "medium",
      "location": {
        "episode_id": "ep_001",
        "block_id": "block_009"
      },
      "text": "打得落花流水，死伤无数",
      "reason": "包含战争伤害和死亡表达，不适合 5-8 岁直接呈现。",
      "suggestion": "改为：大家都遇到了很大的困难，不能只靠力气解决问题。"
    }
  ]
}
```

---

### 3.3 故事拆集 Agent

职责：

1. 根据素材和集数拆分故事结构。
2. 不是按字数平均切分，而是按儿童听故事节奏切分。
3. 每集要有开场钩子、核心冲突、结尾期待。

输入：

```json
{
  "project_id": "project_001",
  "source_analysis": {},
  "target_age": "5-8",
  "episode_count": 3,
  "episode_duration_minutes": 5,
  "style": "classic_children_radio",
  "format": "narrator_plus_roles"
}
```

输出：

```json
{
  "episodes": [
    {
      "episode_number": 1,
      "title": "大江边的难题",
      "summary": "曹操船队来到江边，周瑜发现不能硬拼。",
      "hook": "一条宽宽的大江边，大家遇到了大难题。",
      "main_conflict": "敌方船队很多，不能只靠力气。",
      "characters": ["旁白", "周瑜", "小兵"],
      "emotional_curve": ["平静", "紧张", "思考"],
      "educational_value": "遇到困难要动脑筋",
      "cliffhanger": "办法会不会藏在风里？",
      "risk_level": "low",
      "estimated_duration_minutes": 5
    }
  ]
}
```

---

### 3.4 适龄改编 Agent

职责：

1. 将成人原著转为适合儿童的表达。
2. 根据年龄段控制语言、冲突、角色数量和刺激强度。
3. 弱化暴力、死亡、恐怖和成人化内容。

输入：

```json
{
  "target_age": "3-5",
  "original_content": "双方激战，死伤惨重。",
  "context": "三国故事改编"
}
```

输出：

```json
{
  "adapted_content": "大家都不想再争来争去了，他们希望快点想出一个好办法。",
  "adaptation_notes": ["弱化战争伤害", "降低刺激感", "适合 3-5 岁"]
}
```

---

### 3.5 风格转换 Agent

职责：

1. 将内容转为指定讲述风格。
2. 保持适龄规则优先。
3. 输出风格化表达建议。

输入：

```json
{
  "style": "classic_elder_storyteller",
  "target_age": "5-8",
  "content": "..."
}
```

输出：

```json
{
  "styled_content": "小朋友们，今天我们要讲一个发生在大江边的故事。",
  "style_notes": ["亲切开场", "慢节奏", "有互动提问"]
}
```

---

### 3.6 剧本生成 Agent

职责：

1. 根据确认后的大纲生成结构化音频剧本。
2. 输出旁白、角色台词、音效、BGM、停顿、情绪和语速。
3. 保持角色性格和声音建议一致。

输入：

```json
{
  "project_id": "project_001",
  "episode": {},
  "target_age": "5-8",
  "style": "classic_children_radio",
  "format": "narrator_plus_roles",
  "characters": [],
  "safety_rules": []
}
```

输出：

```json
{
  "episode_id": "ep_001",
  "title": "大江边的难题",
  "estimated_duration_minutes": 5,
  "characters": [
    {
      "name": "旁白",
      "voice_suggestion": "温暖、亲切、讲故事感"
    }
  ],
  "script_blocks": [
    {
      "order": 1,
      "type": "bgm",
      "text": "轻快古风片头，8 秒",
      "duration_ms": 8000
    },
    {
      "order": 2,
      "type": "narration",
      "character": "旁白",
      "text": "小朋友们，今天我们要来到一条很宽很宽的大江边。",
      "emotion": "warm",
      "speed": "slow",
      "pause_after_ms": 500
    },
    {
      "order": 3,
      "type": "dialogue",
      "character": "小兵",
      "text": "周将军，你快看！曹操的船好多好多呀！",
      "emotion": "nervous",
      "speed": "medium",
      "pause_after_ms": 500
    }
  ],
  "safety_summary": {
    "risk_level": "low",
    "findings": []
  }
}
```

---

### 3.7 角色识别 Agent

职责：

1. 从剧本或素材中识别角色。
2. 生成角色设定。
3. 给出声音建议。

输出：

```json
{
  "characters": [
    {
      "name": "周瑜",
      "role_type": "main_character",
      "personality": "年轻、坚定、善于思考",
      "age_feel": "young_adult",
      "voice_suggestion": "清亮、沉稳、坚定",
      "appears_in_episodes": [1, 2, 3]
    }
  ]
}
```

---

### 3.8 声音匹配 Agent

职责：

1. 根据角色设定推荐声音。
2. 过滤未授权或不可商用声音。
3. 保持项目内声音一致性。

输入：

```json
{
  "project_id": "project_001",
  "characters": [],
  "available_voices": [],
  "commercial_use": true
}
```

输出：

```json
{
  "recommendations": [
    {
      "character_name": "周瑜",
      "recommended_voices": [
        {
          "voice_id": "voice_009",
          "score": 0.91,
          "reason": "清亮、坚定，适合年轻将领角色。"
        }
      ]
    }
  ]
}
```

---

### 3.9 音频生成 Agent

职责：

1. 根据剧本块生成 TTS 音频。
2. 应用角色声音、情绪、语速、停顿。
3. 生成单句、段落或整集音频。

输入：

```json
{
  "episode_id": "ep_001",
  "script_blocks": [],
  "voice_bindings": [],
  "generation_options": {
    "speed": "standard",
    "emotion_strength": "medium",
    "include_sfx": true,
    "include_bgm": true
  }
}
```

输出：

```json
{
  "episode_id": "ep_001",
  "audio_blocks": [
    {
      "block_id": "block_001",
      "audio_id": "audio_001",
      "file_url": "https://storage.example.com/audio_001.mp3",
      "duration_ms": 4200,
      "status": "completed"
    }
  ]
}
```

---

### 3.10 混音 Agent

职责：

1. 按剧本顺序拼接人声。
2. 插入停顿。
3. 插入音效和 BGM。
4. 控制 BGM 自动压低，保证人声清楚。
5. 输出整集音频。

输入：

```json
{
  "episode_id": "ep_001",
  "audio_blocks": [],
  "sfx_blocks": [],
  "bgm_blocks": [],
  "mix_options": {
    "bgm_volume": 30,
    "voice_volume": 100,
    "sfx_volume": 60,
    "output_format": "mp3"
  }
}
```

输出：

```json
{
  "episode_id": "ep_001",
  "final_audio_url": "https://storage.example.com/final_ep_001.mp3",
  "duration_ms": 302000,
  "format": "mp3",
  "status": "completed"
}
```

---

## 4. 核心 API 设计

## 4.1 Project API

### 创建项目

```http
POST /api/projects
```

Request:

```json
{
  "title": "火烧赤壁儿童短剧",
  "description": "三国故事改编",
  "source_type": "topic",
  "target_age": "5-8",
  "episode_count": 3,
  "episode_duration_minutes": 5,
  "style": "classic_elder_storyteller",
  "format": "narrator_plus_roles",
  "faithfulness": "medium"
}
```

Response:

```json
{
  "project_id": "project_001",
  "status": "draft"
}
```

### 获取项目详情

```http
GET /api/projects/:projectId
```

### 更新项目配置

```http
PATCH /api/projects/:projectId
```

### 查询项目列表

```http
GET /api/projects?status=&keyword=&page=&page_size=
```

---

## 4.2 Source API

### 提交文本素材

```http
POST /api/projects/:projectId/source
```

Request:

```json
{
  "source_type": "text",
  "title": "火烧赤壁",
  "raw_text": "..."
}
```

### 上传文件素材

```http
POST /api/projects/:projectId/source-file
Content-Type: multipart/form-data
```

### 获取素材解析结果

```http
GET /api/projects/:projectId/source-analysis
```

---

## 4.3 Agent Task API

### 创建 Agent 任务

```http
POST /api/agent-tasks
```

Request:

```json
{
  "project_id": "project_001",
  "task_type": "generate_outline",
  "input": {
    "target_age": "5-8",
    "episode_count": 3
  }
}
```

TaskType 枚举：

```text
parse_source
generate_outline
generate_script
rewrite_script_block
safety_review
identify_characters
recommend_voices
generate_audio
remix_episode
export_project
```

Response:

```json
{
  "task_id": "task_001",
  "status": "pending"
}
```

### 查询任务状态

```http
GET /api/agent-tasks/:taskId
```

Response:

```json
{
  "task_id": "task_001",
  "task_type": "generate_outline",
  "status": "running",
  "progress": 45,
  "message": "正在生成第 2 集大纲",
  "result": null,
  "error": null
}
```

### 取消任务

```http
POST /api/agent-tasks/:taskId/cancel
```

---

## 4.4 Outline API

### 获取分集大纲

```http
GET /api/projects/:projectId/outline
```

### 保存分集大纲

```http
PUT /api/projects/:projectId/outline
```

Request:

```json
{
  "episodes": [
    {
      "episode_id": "ep_001",
      "episode_number": 1,
      "title": "大江边的难题",
      "summary": "曹操船队来到江边，周瑜发现不能硬拼。",
      "hook": "一条宽宽的大江边，大家遇到了大难题。",
      "main_conflict": "敌方船队很多，不能只靠力气。",
      "characters": ["周瑜", "小兵"],
      "educational_value": "遇到困难要动脑筋",
      "cliffhanger": "办法会不会藏在风里？",
      "risk_level": "low",
      "locked": false
    }
  ]
}
```

### 确认分集大纲

```http
POST /api/projects/:projectId/outline/approve
```

---

## 4.5 Script API

### 获取某集剧本

```http
GET /api/episodes/:episodeId/script
```

### 保存某集剧本

```http
PUT /api/episodes/:episodeId/script
```

Request:

```json
{
  "script_blocks": [
    {
      "block_id": "block_001",
      "order": 1,
      "type": "narration",
      "character_id": "char_narrator",
      "text": "小朋友们，今天我们要来到一条很宽很宽的大江边。",
      "emotion": "warm",
      "speed": "slow",
      "pause_after_ms": 500,
      "locked": false
    }
  ]
}
```

### 局部重写

```http
POST /api/script-blocks/:blockId/rewrite
```

Request:

```json
{
  "rewrite_instruction": "更温柔，更适合 5-8 岁儿童",
  "preserve_meaning": true
}
```

### 确认某集剧本

```http
POST /api/episodes/:episodeId/script/approve
```

### 批量确认剧本

```http
POST /api/projects/:projectId/scripts/approve
```

---

## 4.6 Safety API

### 审核文本

```http
POST /api/safety/review
```

Request:

```json
{
  "project_id": "project_001",
  "target_age": "5-8",
  "content_type": "script",
  "content": "..."
}
```

### 一键安全改写

```http
POST /api/safety/rewrite
```

Request:

```json
{
  "finding_id": "finding_001",
  "target_age": "5-8",
  "original_text": "打得落花流水，死伤无数。",
  "rewrite_goal": "弱化暴力和死亡表达"
}
```

---

## 4.7 Character API

### 获取角色列表

```http
GET /api/projects/:projectId/characters
```

### 更新角色

```http
PATCH /api/characters/:characterId
```

### 锁定角色

```http
POST /api/characters/:characterId/lock
```

---

## 4.8 Voice API

### 获取声音库

```http
GET /api/voices?age_feel=&gender_feel=&style_tag=&commercial_use=
```

### 获取推荐声音

```http
POST /api/projects/:projectId/voice-recommendations
```

### 绑定角色声音

```http
POST /api/projects/:projectId/voice-bindings
```

Request:

```json
{
  "bindings": [
    {
      "character_id": "char_001",
      "voice_id": "voice_001",
      "locked": true
    }
  ]
}
```

### 试听声音

```http
POST /api/voices/:voiceId/preview
```

Request:

```json
{
  "text": "小朋友们，今天我们来讲一个有趣的故事。",
  "emotion": "warm",
  "speed": "standard"
}
```

---

## 4.9 Audio API

### 生成某集音频

```http
POST /api/episodes/:episodeId/audio/generate
```

Request:

```json
{
  "generation_options": {
    "speed": "standard",
    "emotion_strength": "medium",
    "include_sfx": true,
    "include_bgm": true,
    "bgm_volume": 30
  }
}
```

Response:

```json
{
  "task_id": "task_audio_001"
}
```

### 生成某个剧本块音频

```http
POST /api/script-blocks/:blockId/audio/generate
```

### 获取某集音频资产

```http
GET /api/episodes/:episodeId/audio
```

### 重新混音

```http
POST /api/episodes/:episodeId/audio/remix
```

---

## 4.10 Export API

### 导出项目

```http
POST /api/projects/:projectId/export
```

Request:

```json
{
  "export_scope": "all_episodes",
  "formats": ["mp3"],
  "include_script": true
}
```

### 获取导出记录

```http
GET /api/projects/:projectId/exports
```

---

## 5. 数据模型

## 5.1 Project

```ts
interface Project {
  project_id: string;
  title: string;
  description?: string;
  source_type: 'text' | 'file' | 'topic';
  target_age: '3-5' | '5-8' | '8-12';
  episode_count: number;
  episode_duration_minutes: number;
  style: string;
  format: 'single_narrator' | 'narrator_plus_roles' | 'audio_drama' | 'bedtime_story';
  faithfulness: 'low' | 'medium' | 'high';
  status: ProjectStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}
```

## 5.2 Episode

```ts
interface Episode {
  episode_id: string;
  project_id: string;
  episode_number: number;
  title: string;
  summary: string;
  hook: string;
  main_conflict: string;
  characters: string[];
  educational_value: string;
  cliffhanger: string;
  risk_level: RiskLevel;
  estimated_duration_minutes: number;
  locked: boolean;
  status: EpisodeStatus;
}
```

## 5.3 ScriptBlock

```ts
interface ScriptBlock {
  block_id: string;
  episode_id: string;
  order: number;
  type: 'narration' | 'dialogue' | 'sfx' | 'bgm' | 'pause' | 'transition';
  character_id?: string;
  text: string;
  emotion?: string;
  speed?: 'slow' | 'medium' | 'fast';
  pause_after_ms?: number;
  voice_id?: string;
  sfx_id?: string;
  bgm_id?: string;
  review_status: 'pending' | 'approved' | 'rejected';
  audio_status: 'none' | 'generating' | 'generated' | 'failed';
  locked: boolean;
}
```

## 5.4 Voice

```ts
interface Voice {
  voice_id: string;
  name: string;
  gender_feel: 'male' | 'female' | 'neutral';
  age_feel: 'childlike' | 'young' | 'adult' | 'elder';
  tone: string;
  style_tags: string[];
  supported_emotions: string[];
  license_status: 'system_authorized' | 'user_authorized' | 'brand_owned' | 'not_commercial' | 'unauthorized';
  commercial_use: boolean;
  sample_url: string;
  enabled: boolean;
}
```

---

## 6. 任务队列设计

### 6.1 需要异步化的任务

1. 素材解析
2. 分集大纲生成
3. 剧本生成
4. 儿童安全审核
5. 声音推荐
6. TTS 音频生成
7. 混音
8. 导出

### 6.2 AgentTask 数据结构

```ts
interface AgentTask {
  task_id: string;
  project_id: string;
  episode_id?: string;
  task_type: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
  input: Record<string, any>;
  result?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    detail?: any;
  };
  created_at: string;
  updated_at: string;
}
```

### 6.3 任务重试规则

1. 模型调用失败可自动重试 2 次。
2. TTS 生成失败可自动重试 2 次。
3. 混音失败不自动无限重试。
4. 高风险内容审核失败不应自动重试，应返回用户修改。
5. 所有失败任务都必须保留错误原因。

---

## 7. Prompt 输出规范

所有 Agent 输出必须是 JSON，不允许只输出自然语言。

### 7.1 通用输出要求

1. 必须符合接口 schema。
2. 不得输出 Markdown 包裹 JSON。
3. 不得遗漏必填字段。
4. 不确定时使用空数组或 null。
5. 风险内容必须单独放入 safety_findings。
6. 已锁定内容不得覆盖。

### 7.2 剧本块输出要求

每个 script_block 必须包含：

1. order
2. type
3. text
4. character，除 sfx、bgm、pause 外
5. emotion，旁白和台词必填
6. speed，旁白和台词必填
7. pause_after_ms

---

## 8. 儿童安全审核规则

### 8.1 风险类型枚举

```text
violence
horror
adult_content
sexual_content
discrimination
insult
bad_language
dangerous_behavior
negative_values
superstition
death_expression
historical_inappropriate
```

### 8.2 风险等级

```text
low
medium
high
blocked
```

### 8.3 阻断规则

以下情况不得进入音频生成：

1. risk_level = high 且未处理。
2. risk_level = blocked。
3. 剧本未人工审核。
4. 角色声音未绑定。
5. 声音授权状态不可用。

---

## 9. 音频生成流程

### 9.1 单集音频生成步骤

```text
读取已审核剧本
→ 校验角色声音绑定
→ 逐个文本块生成 TTS
→ 插入停顿
→ 插入音效
→ 插入 BGM
→ 混音
→ 输出单集 MP3
→ 保存 AudioAsset
→ 更新 episode audio_status
```

### 9.2 局部重生成步骤

```text
用户修改某个 ScriptBlock
→ 保存文本
→ 标记该 block audio_status = stale
→ 用户点击重新生成
→ 只生成该 block 音频
→ 替换原 AudioAsset
→ 重新混音该集
```

### 9.3 音量建议

默认混音参数：

```json
{
  "voice_volume": 100,
  "bgm_volume": 30,
  "sfx_volume": 60,
  "ducking_enabled": true,
  "ducking_level": 20
}
```

---

## 10. 存储设计

### 10.1 数据库

推荐存储：

1. users
2. projects
3. source_materials
4. source_analyses
5. episodes
6. characters
7. script_blocks
8. safety_findings
9. voices
10. voice_bindings
11. audio_assets
12. exports
13. agent_tasks

### 10.2 对象存储

用于存储：

1. 上传文本文件
2. TTS 单句音频
3. 音效文件
4. BGM 文件
5. 混音后的单集 MP3
6. 导出包

路径建议：

```text
/projects/{project_id}/source/{source_id}.txt
/projects/{project_id}/episodes/{episode_id}/blocks/{block_id}.mp3
/projects/{project_id}/episodes/{episode_id}/final.mp3
/projects/{project_id}/exports/{export_id}.zip
```

---

## 11. 权限设计

### 11.1 用户角色

```text
user
admin
```

### 11.2 权限规则

普通用户：

1. 只能访问自己的项目。
2. 可以创建、编辑、导出自己的项目。
3. 可以使用已启用且授权可用的声音。

管理员：

1. 可以访问全部项目。
2. 可以管理声音库。
3. 可以管理风格模板。
4. 可以管理安全规则。
5. 可以查看系统任务日志。

---

## 12. 错误处理

### 12.1 通用错误结构

```json
{
  "error": {
    "code": "SCRIPT_NOT_APPROVED",
    "message": "剧本尚未审核，不能生成音频。",
    "detail": {}
  }
}
```

### 12.2 常见错误码

```text
PROJECT_NOT_FOUND
SOURCE_NOT_FOUND
TASK_NOT_FOUND
INVALID_PROJECT_STATUS
OUTLINE_NOT_APPROVED
SCRIPT_NOT_APPROVED
VOICE_NOT_BOUND
VOICE_NOT_AUTHORIZED
SAFETY_RISK_BLOCKED
AUDIO_GENERATION_FAILED
MIXING_FAILED
EXPORT_FAILED
```

---

## 13. MVP 开发建议

### 13.1 第一阶段

目标：打通文本到剧本。

功能：

1. 项目创建
2. 文本输入
3. 素材解析
4. 分集大纲生成
5. 大纲编辑
6. 剧本生成
7. 剧本编辑
8. 儿童安全审核

### 13.2 第二阶段

目标：打通剧本到音频。

功能：

1. 角色识别
2. 声音库
3. 声音绑定
4. 单句 TTS
5. 单集音频生成
6. 简单混音
7. MP3 导出

### 13.3 第三阶段

目标：提升生产效率。

功能：

1. 局部重写
2. 局部重生成
3. 批量生成
4. 版本历史
5. 风格模板后台
6. 安全规则后台

---

## 14. Codex 实现提示

建议先实现以下目录结构：

```text
src/
  app/
  components/
  features/
    projects/
    source/
    outline/
    scripts/
    voices/
    audio/
    exports/
  services/
    api.ts
    agentTasks.ts
    projects.ts
    scripts.ts
    audio.ts
  types/
    project.ts
    episode.ts
    script.ts
    voice.ts
    task.ts
server/
  routes/
    projects.ts
    source.ts
    agentTasks.ts
    outline.ts
    scripts.ts
    safety.ts
    voices.ts
    audio.ts
    exports.ts
  services/
    agentOrchestrator.ts
    safetyReviewService.ts
    audioGenerationService.ts
    mixService.ts
  agents/
    sourceParserAgent.ts
    outlineAgent.ts
    scriptWriterAgent.ts
    safetyAgent.ts
    voiceMatcherAgent.ts
```

MVP 可以先使用 mock Agent 返回结构化数据，再逐步替换为真实模型调用。
