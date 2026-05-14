# 音频剧自动化生产系统 — CLAUDE.md

AI 编码助手参考文档。描述当前架构、关键实现细节和注意事项。

---

## 项目概述

将古典小说原著（三国演义、西游记等）自动转化为儿童音频剧的 Web 应用。
用户粘贴原著文本，系统自动完成剧本改写、角色识别、音色自动匹配、音效/BGM 生成、TTS 配音、混音合成全流程。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.10+，Flask，pydub |
| 前端 | React 18，Vite，Tailwind CSS |
| AI 剧本 | DeepSeek API（优先）/ Anthropic Claude（备用）/ OpenRouter（代理） |
| TTS | 豆包 seed-tts-2.0（火山引擎） |
| BGM | MiniMax music-2.6（优先）/ Suno 非官方 API（备用） |
| 音效 | ElevenLabs Sound Effects API（优先）/ MiniMax（备用，由 elevenlabs_sfx.py 路由） |

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
> 路由优先级在 `elevenlabs_sfx.py` 里，`MINIMAX_API_KEY` 非空时会走 MiniMax 音效，可按需调整。

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
│   │   ├── script_rewrite_sunjingxiu.txt  ← 孙敬修风格改写 prompt
│   │   ├── script_rewrite_blog.txt        ← 博客/轻松风格改写 prompt
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
│       ├── hooks/
│       │   └── useSSE.js         ← SSE 订阅 hook
│       └── components/
│           ├── StepIndicator.jsx     ← 步骤进度条
│           ├── ScriptViewer.jsx      ← 剧本展示（高亮 BGM/音效/台词）
│           ├── CharacterCard.jsx     ← 角色音色卡（显示音色名/描述/试听）
│           ├── VoicePickerModal.jsx  ← 音色选择弹窗（含添加新音色表单）
│           ├── ProgressTracker.jsx   ← 7 阶段音频生成进度（SSE）
│           ├── SettingsModal.jsx     ← API Key 配置弹窗（保存到 .env）
│           ├── StyleEditorModal.jsx  ← 改写风格 prompt 编辑器
│           ├── RewriteProgress.jsx   ← 流式剧本生成展示（SSE token）
│           └── LibraryModal.jsx      ← 本地素材库浏览
└── output/                       ← 每集生成的台词语音 + 最终混音 MP3
```

---

## 后端 API 路由

### GET/POST `/api/settings`
读写 `.env` 文件中的 API Key 配置，保存后热更新当前进程，无需重启。

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
  "sfx_library":  {"战马嘶鸣": "/api/preview/sfx/战马嘶鸣"},  // 库中已有的预览URL
  "bgm_library":  {},
  "sfx_paths":    {"战马嘶鸣": "D:/...assets/sfx/战马嘶鸣.mp3"},  // 传给 Step5 跳过重复匹配
  "bgm_paths":    {},
  "sfx_status":   {"战马嘶鸣": true},   // 磁盘上是否已有文件
  "bgm_status":   {"开场音乐": false}
}
```

### POST `/api/generate-single-sfx` / `/api/generate-single-bgm`
单个音效/BGM 生成（第 4 步逐个生成使用）。支持 `force: true` 强制重新生成。

### GET `/api/preview/sfx/<name>` / `/api/preview/bgm/<name>`
流式返回音效/BGM 预览音频（MP3）。

### POST `/api/generate-audio`
第 5 步：触发完整音频生成，返回 `task_id`，之后通过 SSE 订阅进度。

```json
// request（sfx_paths/bgm_paths 由第 4 步传来，避免重复素材库查询）
{
  "story_name": "三国演义", "episode_name": "第一集",
  "script": [...], "voice_map": {"旁白": "zh_female_shaoergushi_uranus_bigtts"},
  "sfx_prompts": {...}, "bgm_prompts": {...},
  "sfx_paths": {"战马嘶鸣": "/abs/path/..."},
  "bgm_paths": {}
}
// response
{"task_id": "abc123"}
```

### GET `/api/progress/<task_id>`
SSE 实时推送 7 阶段进度：

```
data: {"stage": "prompt",      "status": "done"}
data: {"stage": "sfx_library", "status": "done", "message": "复用 2 个"}
data: {"stage": "bgm_library", "status": "done"}
data: {"stage": "sfx",  "item": "战马嘶鸣", "status": "done", "progress": 1, "total": 3}
data: {"stage": "bgm",  "item": "开场音乐", "status": "generating"}
data: {"stage": "tts",  "item": "旁白", "status": "done", "progress": 5, "total": 16}
data: {"stage": "mix",  "status": "done"}
data: {"stage": "done", "download_url": "/api/download/abc123/abc123_mix.mp3"}
```

### 音色库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/voices` | 获取所有音色列表（含 has_preview） |
| POST | `/api/voices` | 添加音色（multipart：voice_id/name/description/audio） |
| DELETE | `/api/voices/<voice_id>` | 删除音色 + 预览文件 |
| GET | `/api/voices/<voice_id>/preview` | 试听预览音频 |
| POST | `/api/assign-voices` | AI 自动为角色列表匹配音色 |

### 素材库 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/library` | 查看 BGM/音效库条目和数量 |
| POST | `/api/library/sync` | 扫描 assets/ 目录补录未入库文件 |
| DELETE | `/api/library/<type>/<name>` | 删除库条目（不删文件） |

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

### 音色库（voice_library.py）

`assets/voices.json` 结构：
```json
{
  "zh_female_shaoergushi_uranus_bigtts": {
    "name": "少儿故事",
    "description": "温柔清晰的女声，适合旁白和讲故事",
    "preview_file": "zh_female_shaoergushi_uranus_bigtts.mp3"
  }
}
```

`assign_voices(characters)` 调用 LLM 根据角色特征匹配音色，返回 `{角色名: voice_id}`。

### Step 4 → Step 5 素材路径传递

第 4 步 `/api/media-prompts` 完成素材库匹配后返回 `sfx_paths`/`bgm_paths`（绝对路径）。
第 5 步 `/api/generate-audio` 接收这两个参数，`_run_generation` 直接复用，**不再重复调用 `find_matches`**。

```python
reused_sfx   = {n: p for n, p in (sfx_paths or {}).items() if p and os.path.exists(p)}
generate_sfx = {n: sfx_prompts[n] for n in sfx_prompts if n not in reused_sfx}
```

### MiniMax music-2.6（minimax_bgm.py）

```python
# 同步接口，无需轮询
# URL: https://api.minimaxi.com/v1/music_generation   ← 注意是 minimaxi.com 不是 .chat
# 模型: music-2.6（付费）
# 响应时间: 约 200-250s（requests timeout=300）
# 响应格式: data.audio = hex 编码的 MP3 二进制
resp = requests.post(
    "https://api.minimaxi.com/v1/music_generation",
    headers={"Authorization": f"Bearer {MINIMAX_API_KEY}"},
    json={
        "model": "music-2.6",
        "prompt": prompt_en,
        "is_instrumental": True,   # ← 必须用这个参数，不是 lyrics_type
        "audio_setting": {"sample_rate": 44100, "bitrate": 128000, "format": "mp3"},
    },
    timeout=300,
)
audio_bytes = bytes.fromhex(resp.json()["data"]["audio"])
```

**易错点：**
- 域名必须是 `api.minimaxi.com`（`.chat` 或 `.minimax.chat` 鉴权会 2049 报错）
- 参数是 `is_instrumental: True`，不是 `lyrics_type: "instrumental"`
- 模型是 `music-2.6`（付费），免费版 `music-2.6-free` 配额极少
- 超时必须 ≥ 300s；Vite 代理也要设 `proxyTimeout: 350_000`

### 豆包 TTS（doubao_tts.py）

- endpoint: `https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- headers: `X-Api-Key`, `X-Api-Resource-Id: seed-tts-2.0`, `X-Api-Connect-Id`
- 响应：NDJSON 流，每行 JSON 含 base64 音频块
- 情感：通过 `additions.context_texts` 传入自然语言描述
- 每条请求后 `sleep(0.3)` 避免限流

### pydub 混音（mixer.py）

- BGM 铺底：音量 -20dB，循环填满时长，末尾 fade_out 2000ms
- 音效：音量 -25dB，最长 4000ms，fade_out 300ms
- 台词：按顺序叠加，cursor_ms 推进时间轴
- 最终 overlay 合成，导出 128k MP3

### Windows GBK 编码修复

`main.py` 顶部（所有 import 之前）强制 UTF-8 输出，防止 LLM 生成内容含 emoji 时 print 崩溃：

```python
import sys
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
```

---

## 环境变量（.env）

```env
# AI 脚本生成（DeepSeek 优先，Claude 备用）
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-v4-pro        # 或 deepseek-v4-flash / deepseek-chat
ANTHROPIC_API_KEY=sk-ant-xxx          # DeepSeek 为空时使用
CLAUDE_API_BASE=sk-or-v1-xxx          # 填 OpenRouter Key 则走 OpenRouter
CLAUDE_MODEL=anthropic/claude-sonnet-4-20250514

# BGM（MiniMax 优先 → Suno 备用）
MINIMAX_API_KEY=sk-cp-xxxxx
MINIMAX_GROUP_ID=                     # 部分接口需要，可留空

# 配音
DOUBAO_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 音效（ElevenLabs 推荐；MINIMAX_API_KEY 非空时会路由到 MiniMax）
ELEVENLABS_API_KEY=sk_xxxxxx

# 备用 BGM（MiniMax 为空时使用）
SUNO_API_URL=http://localhost:3000

# 输出目录
OUTPUT_DIR=./output
SFX_DIR=./assets/sfx
BGM_DIR=./assets/bgm
```

---

## 启动方式

```bash
# 后端
cd backend
pip install -r requirements.txt
python -u main.py

# 前端
cd frontend
npm install
npm run dev
```

**Windows 重启后端（必须用 PowerShell）：**
```powershell
Get-Process python* -ErrorAction SilentlyContinue | Stop-Process -Force
# 确认端口已释放后再启动
python -u main.py
```

Git Bash 的 `pkill` 在 Windows 下无法杀死所有 Python 进程，残留进程会继续占用 5000 端口并运行旧代码。

---

## 常见问题

### `/api/voices` 返回 HTML 404
后端还在运行旧代码（未重启）。用 PowerShell 彻底杀进程后重启。

### MiniMax 2049 "invalid api key"
- 检查域名是否为 `api.minimaxi.com`（不是 `.chat`）
- 旧进程残留 → PowerShell 彻底杀进程

### BGM 生成超时 / 前端报错
- `music-2.6` 正常需要 200-250s
- 确认 `vite.config.js` 中 `proxyTimeout: 350_000` 已设置
- 前端 `genBgm` 里有 `AbortController` 330s 超时保护

### 设置保存后不生效
- `config.py` 使用绝对路径 `load_dotenv(Path(__file__).parent / ".env")`
- 设置接口会热更新 `os.environ` 和 `config` 模块属性，无需重启

### 音色自动匹配为空
- 检查 `assets/voices.json` 是否为空（第 3 步进入时音色库为空则跳过 AI 匹配）
- 先在第 3 步「选择音色 → 添加新音色」录入至少一条音色
