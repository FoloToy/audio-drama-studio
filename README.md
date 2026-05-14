# 音频剧自动生产系统

将古典小说原著自动转化为适合 8-11 岁小朋友收听的儿童音频剧。

粘贴原著文本 → AI 改写剧本 → 音色库自动配音 → 音效/BGM 生成 → 混音下载 MP3，全程无需手动操作。

---

## 快速开始

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
python -u main.py
# 运行在 http://localhost:5000
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
# 运行在 http://localhost:5173
```

### 3. 配置 API Key

打开页面右上角「API 设置」，填入所需的 API Key，点保存即可（无需重启）。

---

## 所需 API Key

| 功能 | 服务 | 获取地址 |
|---|---|---|
| AI 剧本改写 | DeepSeek（推荐） | [platform.deepseek.com](https://platform.deepseek.com) → API Keys |
| AI 剧本改写（备用） | Anthropic Claude | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| BGM 生成 | MiniMax music-2.6 | [platform.minimaxi.com](https://platform.minimaxi.com) → API Keys |
| 音效生成 | ElevenLabs | [elevenlabs.io](https://elevenlabs.io) → Settings → API Keys |
| 角色配音 | 豆包 TTS 2.0 | 火山引擎控制台 → 语音技术 → seed-tts-2.0 |

> **最简配置**：DeepSeek + MiniMax + ElevenLabs + 豆包 TTS，四个 Key 覆盖全流程。

---

## 使用流程（5步）

1. **输入原著** — 填写故事名称、集数名称（支持「AI 识别故事名称和集数」一键填写），粘贴原著文本，选择改写风格；三项全填后才可点击开始
2. **确认剧本** — 查看 AI 改写后的剧本，可直接点击台词编辑内容、修改 BGM/音效名称
3. **配置音色** — AI 自动从本地音色库匹配角色音色，可手动调整；支持添加新音色（含试听）
4. **生成 BGM/音效** — 顶部「⚡ 一键生成全部」按钮优先显示；AI 生成英文提示词并查询本地素材库，库中已有的直接复用
5. **生成音频** — 点击开始，实时查看 7 阶段进度，完成后下载 MP3

---

## 音频生成说明

### BGM
- 使用 **MiniMax `music-2.6`** 模型，每首约需 **3-4 分钟**生成
- 无人声纯器乐，古典中国乐器风格
- 按名称缓存，相同名称不重复生成；已入本地素材库的自动复用

### 音效
- 使用 **ElevenLabs Sound Effects API**，约需 **5-10 秒**生成
- 同样按名称缓存，已入素材库的自动复用

### 配音
- **豆包 seed-tts-2.0**，支持情感上下文控制
- 音色统一管理在本地音色库（`assets/voices.json`）
- AI 根据角色特征自动从音色库匹配，可在第 3 步手动调整

---

## 本地素材库

系统维护三个本地库，避免重复生成：

| 库 | 路径 | 内容 |
|---|---|---|
| BGM 库 | `assets/library.json` → bgm | BGM 文件的语义描述索引 |
| 音效库 | `assets/library.json` → sfx | 音效文件的语义描述索引 |
| 音色库 | `assets/voices.json` | 豆包 TTS 音色 ID、名称、描述、试听音频 |

生成新音效/BGM 后自动入库；第 4 步进入时 AI 会先检索库中是否有可复用的素材。

---

## 目录说明

```
backend/
├── assets/
│   ├── bgm/           ← MiniMax 生成的 BGM 缓存（MP3）
│   ├── sfx/           ← ElevenLabs 生成的音效缓存（MP3）
│   ├── voices/        ← 音色试听音频文件
│   ├── library.json   ← BGM/音效语义索引（自动维护）
│   └── voices.json    ← 音色库（手动维护）
└── output/            ← 每集台词语音 + 最终混音 MP3
```

---

## 重启服务（Windows）

**必须用 PowerShell 彻底杀进程**，否则旧进程残留会继续占用端口：

```powershell
Stop-Process -Name python -Force -ErrorAction SilentlyContinue
Stop-Process -Name node   -Force -ErrorAction SilentlyContinue
# 重启后端
Start-Process cmd -ArgumentList "/k cd /d D:\audio-drama-studio\backend && python main.py"
# 重启前端
Start-Process cmd -ArgumentList "/k cd /d D:\audio-drama-studio\frontend && npm run dev"
```

访问地址：**http://localhost:5173/**
