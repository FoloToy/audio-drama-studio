# 音频剧自动化生产系统 — CLAUDE.md

AI 编码助手参考文档。描述当前架构、关键实现细节和注意事项。

---

## 项目概述

将古典小说原著（三国演义、西游记等）自动转化为儿童音频剧的 Web 应用。
用户粘贴原著文本，系统自动完成剧本改写、角色识别、音色自动匹配、音效/BGM 生成、TTS 配音、混音合成全流程。

**访问地址：http://localhost:5173/**（前端 Vite dev server）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.10+，Flask，pydub |
| 前端 | React 18，Vite，Tailwind CSS |
| AI 剧本 | DeepSeek API（优先）/ Anthropic Claude（备用）/ OpenRouter（代理） |
| TTS | 豆包 seed-tts-2.0（火山引擎） |
| BGM | MiniMax music-2.6（优先）/ Suno 非官方 API（备用） |
| 音效 | ElevenLabs Sound Effects API（优先）/ MiniMax（备用） |

---

## Provider 路由逻辑

### LLM（剧本/提示词生成）

```python
# claude_service.py → stream_llm() / call_llm_text()
if DEEPSEEK_API_KEY:
    → api.deepseek.com/chat/completions（OpenAI 兼容格式）
elif ANTHROPIC_API_KEY or CLAUDE_API_BASE:
    → Anthropic SDK（直连或 OpenRouter 代理）
```

`CLAUDE_API_BASE` 填 OpenRouter Key（`sk-or-v1-...`）时自动走 OpenRouter；填 URL 时当代理地址。

### BGM 生成

```python
# suno_bgm.py → generate_bgm()
if MINIMAX_API_KEY:
    → services/minimax_bgm.py（同步接口，~250s，返回 hex MP3）
else:
    → Suno 非官方 API（http://localhost:3000，轮询）
```

### 音效生成

```python
# elevenlabs_sfx.py → generate_sfx()
if MINIMAX_API_KEY:
    → services/minimax_sfx.py（MiniMax music-2.6，~250s）
else:
    → ElevenLabs /v1/sound-generation（~5-10s，推荐）
```

> **注意**：实际推荐使用 ElevenLabs 生成音效（快，5-10s），MiniMax 生成 BGM（~250s）。

---

## 目录结构

```
audio-drama-studio/
├── CLAUDE.md
├── README.md
├── backend/
│   ├── main.py                   ← Flask 入口，所有 API 路由
│   ├── config.py                 ← 读 .env，常量，目录创建
│   ├── .env                      ← API Keys（不提交 git）
│   ├── requirements.txt
│   ├── services/
│   │   ├── claude_service.py     ← LLM 路由（DeepSeek/Anthropic），剧本/提示词生成
│   │   ├── doubao_tts.py         ← 豆包 TTS seed-tts-2.0
│   │   ├── minimax_bgm.py        ← MiniMax music-2.6 BGM 生成（同步）
│   │   ├── minimax_sfx.py        ← MiniMax music-2.6 音效生成（同步，备用）
│   │   ├── suno_bgm.py           ← BGM 路由入口（MiniMax 优先 → Suno）
│   │   ├── elevenlabs_sfx.py     ← 音效路由入口（MiniMax 优先 → ElevenLabs）
│   │   ├── mixer.py              ← pydub 混音合成
│   │   ├── library.py            ← BGM/音效本地素材库（library.json + AI 语义匹配）
│   │   └── voice_library.py      ← 音色库管理（voices.json + voices/ 目录）
│   ├── prompts/
│   │   ├── script_rewrite_sunjingxiu.txt  ← 儿童广播剧风格改写 prompt
│   │   ├── script_rewrite_blog.txt        ← 博客有声故事风格改写 prompt
│   │   └── media_prompt.txt               ← 音效/BGM 英文提示词生成 prompt
│   └── assets/
│       ├── bgm/           ← BGM 文件缓存（MP3，按名称，避免重复生成）
│       ├── sfx/           ← 音效文件缓存（MP3）
│       ├── voices/        ← 音色试听音频文件
│       ├── library.json   ← BGM/音效语义索引（add_entry 自动维护）
│       └── voices.json    ← 音色库（手动通过 UI 添加维护）
├── frontend/
│   ├── package.json
│   ├── vite.config.js            ← 代理 /api/* → localhost:5000，proxyTimeout=350_000
│   └── src/
│       ├── App.jsx               ← 所有页面组件（单文件架构）
│       ├── index.css             ← Tailwind + CSS 变量主题令牌（仅浅色模式）
│       ├── hooks/
│       │   └── useSSE.js         ← SSE 订阅 hook
│       └── components/
│           ├── CloudCanvas.jsx       ← WebGL 体积云背景（IQ shader，hash noise）
│           ├── StepIndicator.jsx     ← 步骤进度条（活跃项粉色 animate-ping 光点 + 渐变字）
│           ├── ScriptViewer.jsx      ← 剧本展示/编辑（高亮 BGM/音效/台词，无高度限制）
│           ├── CharacterCard.jsx     ← 角色音色卡（显示音色名/描述/试听）
│           ├── VoicePickerModal.jsx  ← 音色选择弹窗（含添加新音色表单）
│           ├── ProgressTracker.jsx   ← 7 阶段音频生成进度（SSE）
│           ├── SettingsModal.jsx     ← API Key 配置弹窗（固定浅色，hardcoded C 常量）
│           ├── StyleEditorModal.jsx  ← 改写风格 prompt 编辑器（固定浅色）
│           ├── RewriteProgress.jsx   ← 流式剧本生成展示（4 阶段彩色 + 荧光绿终端框）
│           └── LibraryModal.jsx      ← 本地素材库浏览（固定浅色）
└── output/                       ← 每集生成的台词语音 + 最终混音 MP3
```

---

## 后端 API 路由

### GET/POST `/api/settings`
读写 `.env` 文件中的 API Key 配置，保存后热更新当前进程，无需重启。

### POST `/api/suggest-names`
根据故事文本 AI 识别故事名称和集数名称（Claude Haiku，快速）。

```json
// request
{"raw_text": "话说天下大势…"}

// response
{"story_name": "三国演义", "episode_name": "第一集：桃园三结义"}
```

集数名称强制格式：`第X集：副标题`。

### POST `/api/rewrite-script-stream`
流式剧本改写，SSE 格式。

```
data: {"type": "thinking"}
data: {"type": "token", "text": "话说"}
data: {"type": "done", "result": { script: [...], characters: [...] }}
```

### POST `/api/media-prompts`
第 4 步核心：生成音效/BGM 英文提示词 + 查询本地素材库。

```json
// request
{"story_name": "三国演义", "episode_name": "第一集", "sfx_list": ["战马嘶鸣"], "bgm_list": ["开场音乐"]}

// response
{
  "sfx_prompts":  {"战马嘶鸣": "Horses galloping..."},
  "bgm_prompts":  {"开场音乐": "Epic ancient..."},
  "sfx_library":  {"战马嘶鸣": "/api/preview/sfx/战马嘶鸣"},
  "bgm_library":  {},
  "sfx_paths":    {"战马嘶鸣": "D:/...assets/sfx/战马嘶鸣.mp3"},
  "bgm_paths":    {},
  "sfx_status":   {"战马嘶鸣": true},
  "bgm_status":   {"开场音乐": false}
}
```

### POST `/api/generate-single-sfx` / `/api/generate-single-bgm`
单个音效/BGM 生成。支持 `force: true` 强制重新生成。

### POST `/api/generate-audio`
第 5 步：触发完整音频生成，返回 `task_id`。

### GET `/api/progress/<task_id>`
SSE 实时推送 7 阶段进度，最终含 `download_url`。

### 音色库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/voices` | 获取所有音色列表 |
| POST | `/api/voices` | 添加音色（multipart） |
| DELETE | `/api/voices/<voice_id>` | 删除音色 |
| GET | `/api/voices/<voice_id>/preview` | 试听预览 |
| POST | `/api/assign-voices` | AI 自动匹配角色音色 |

### 素材库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/library` | 查看库条目 |
| POST | `/api/library/sync` | 扫描补录未入库文件 |
| DELETE | `/api/library/<type>/<name>` | 删除库条目 |

---

## 前端架构说明

### 主题
**仅浅色模式**。深色模式已移除。`App.jsx` 顶部强制清除 `.dark` class：
```js
document.documentElement.classList.remove('dark')
localStorage.removeItem('folotoy-theme')
```

弹窗类组件（SettingsModal、LibraryModal、StyleEditorModal、VoicePickerModal）使用 hardcoded `const C = { bg: '#FEFCFD', ... }` 常量，完全不依赖 CSS 变量，确保可读性。

### 布局
`h-screen overflow-hidden` 锁定视口，无外部滚动条：

```
App (h-screen overflow-hidden)
  CloudCanvas (fixed, WebGL 云背景)
  overlay (fixed, rgba(252,246,250,0.82) 暖白半透)
  content (h-full flex-col)
    header        (shrink-0)
    StepIndicator (shrink-0)
    hero区        (shrink-0, 仅 Step 1)
    主卡片         (flex-1 min-h-0 flex-col overflow-y-auto)
      p-8 wrapper (flex-1 min-h-0 flex-col)
        各 Step 组件
```

**Step 1 InputPage**：flex-col，textarea `flex-1 min-h-[80px]` 自适应高度，风格选择+按钮 `shrink-0` 锁底。

**Step 2 ReviewPage**：flex-col，ScriptViewer 容器 `flex-1 min-h-0 overflow-hidden`，ScriptViewer 内部 `h-full overflow-y-auto`。

### Step 1 输入校验
故事名称、集数名称、故事内容**三项全填**才能点击「开始改写剧本」：
```js
const canSubmit = storyName.trim() && episodeName.trim() && rawText.trim()
```

### CloudCanvas（WebGL 云背景）
- IQ volumetric cloud shader，用 hash 噪声替代 iChannel0 纹理
- 0.5x 分辨率 + 24fps 帧率上限
- ResizeObserver 自适应尺寸

### RewriteProgress 阶段颜色
每个阶段独立颜色，差异极大，无绿色：

| 阶段 | 颜色 |
|---|---|
| 连接 AI | 蓝 `#2563EB` |
| 理解原著·构思结构 | 紫 `#9333EA` |
| 逐句生成剧本 | 橙 `#EA580C` |
| 校验结构 | 粉红 `#E5007F` |

终端输出框：黑绿配色，`#39FF14` 荧光绿文字，`textShadow` 发光效果，模拟真实终端屏。

### Step 4 MediaPage
「一键生成全部」按钮位于**顶部**，无需滚动即可触发。样式为低饱和粉色实线边框，无 glow-pulse 动画。

---

## 核心实现说明

### 剧本 JSON 格式

```python
[
    {"type": "bgm",  "action": "start", "name": "开场音乐"},
    {"type": "tts",  "speaker": "旁白", "emotion": "平缓叙述", "text": "话说天下大势…"},
    {"type": "sfx",  "name": "战马嘶鸣"},
    {"type": "tts",  "speaker": "刘备", "emotion": "坚定慷慨", "text": "我等当共举大义！"},
    {"type": "bgm",  "action": "stop"},
]
```

### Step 4 → Step 5 素材路径传递

第 4 步完成后传 `sfx_paths`/`bgm_paths`（绝对路径）给第 5 步，避免重复调用 `find_matches`：

```python
reused_sfx   = {n: p for n, p in (sfx_paths or {}).items() if p and os.path.exists(p)}
generate_sfx = {n: sfx_prompts[n] for n in sfx_prompts if n not in reused_sfx}
```

### MiniMax music-2.6（minimax_bgm.py）

```python
# URL: https://api.minimaxi.com/v1/music_generation  ← 注意是 minimaxi.com
# 响应时间: 约 200-250s（requests timeout=300）
# 响应格式: data.audio = hex 编码的 MP3 二进制
audio_bytes = bytes.fromhex(resp.json()["data"]["audio"])
```

**易错点：**
- 域名必须是 `api.minimaxi.com`（`.chat` 会 2049 报错）
- 参数是 `is_instrumental: True`，不是 `lyrics_type`
- 超时必须 ≥ 300s；Vite 代理也要设 `proxyTimeout: 350_000`

### 豆包 TTS（doubao_tts.py）

- endpoint: `https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- 情感通过 `additions.context_texts` 传自然语言描述
- 每条请求后 `sleep(0.3)` 避免限流

### pydub 混音（mixer.py）

- BGM 铺底：-20dB，循环填满，末尾 fade_out 2000ms
- 音效：-25dB，最长 4000ms，fade_out 300ms
- 台词按顺序叠加，cursor_ms 推进时间轴

### Windows GBK 编码修复

```python
# main.py 顶部，所有 import 之前
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
```

---

## 环境变量（.env）

```env
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-v4-pro
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=sk-or-v1-xxx        # OpenRouter Key 或代理 URL
CLAUDE_MODEL=anthropic/claude-sonnet-4-20250514

MINIMAX_API_KEY=sk-cp-xxxxx
MINIMAX_GROUP_ID=

DOUBAO_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

ELEVENLABS_API_KEY=sk_xxxxxx

SUNO_API_URL=http://localhost:3000

OUTPUT_DIR=./output
SFX_DIR=./assets/sfx
BGM_DIR=./assets/bgm
```

---

## 启动与重启（Windows）

```powershell
# 彻底杀掉旧进程
Stop-Process -Name python -Force -ErrorAction SilentlyContinue
Stop-Process -Name node   -Force -ErrorAction SilentlyContinue

# 重启后端
Start-Process cmd -ArgumentList "/k cd /d D:\audio-drama-studio\backend && python main.py"
# 重启前端
Start-Process cmd -ArgumentList "/k cd /d D:\audio-drama-studio\frontend && npm run dev"
```

访问 **http://localhost:5173/**

---

## 常见问题

### 接口返回 HTML 而非 JSON
后端未重启，旧进程仍在运行。用 PowerShell 彻底杀进程后重启。

### MiniMax 2049 "invalid api key"
检查域名是否为 `api.minimaxi.com`（不是 `.chat`）。

### BGM 生成超时
`music-2.6` 正常需 200-250s。确认 `vite.config.js` 中 `proxyTimeout: 350_000` 已设置。

### 设置保存后不生效
设置接口会热更新 `os.environ` 和 `config` 模块属性，无需重启。正常情况下应立即生效。

### 音色自动匹配为空
`assets/voices.json` 为空时跳过 AI 匹配。先在第 3 步「添加新音色」录入至少一条音色。
