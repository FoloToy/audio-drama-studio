import os
from pathlib import Path
from dotenv import load_dotenv

# 指定绝对路径，避免从不同 CWD 启动时读不到 .env
load_dotenv(Path(__file__).parent / ".env")

DOUBAO_API_KEY     = os.environ.get("DOUBAO_API_KEY", "")
DOUBAO_RESOURCE_ID = "seed-tts-2.0"
DOUBAO_API_URL     = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_SFX_URL = "https://api.elevenlabs.io/v1/sound-generation"

ANTHROPIC_API_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL       = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")
CLAUDE_API_BASE    = os.environ.get("CLAUDE_API_BASE", "")  # 空 = Anthropic 直连；填 OpenRouter 地址则走代理

DEEPSEEK_API_KEY   = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL     = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")

MINIMAX_API_KEY    = os.environ.get("MINIMAX_API_KEY", "")
MINIMAX_GROUP_ID   = os.environ.get("MINIMAX_GROUP_ID", "")   # 部分接口需要；可留空

SUNO_API_URL       = os.environ.get("SUNO_API_URL", "http://localhost:3000")

# ── OpenAI 兼容供应商（LLM + 图片；改 Base URL 可接 Qwen/Moonshot/GLM 等）──
OPENAI_API_KEY     = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL    = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL       = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")

# ── 火山方舟 Ark（豆包 Seedream 图片生成）──
ARK_API_KEY        = os.environ.get("ARK_API_KEY", "")
ARK_BASE_URL       = os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
ARK_IMAGE_MODEL    = os.environ.get("ARK_IMAGE_MODEL", "doubao-seedream-3-0-t2i-250415")

# ── 设备内容库发布通道（自有故事机生态）──
DEVICE_LIBRARY_API_URL = os.environ.get("DEVICE_LIBRARY_API_URL", "")
DEVICE_LIBRARY_API_KEY = os.environ.get("DEVICE_LIBRARY_API_KEY", "")

OUTPUT_DIR         = os.environ.get("OUTPUT_DIR", "./output")
SFX_DIR            = os.environ.get("SFX_DIR", "./assets/sfx")
BGM_DIR            = os.environ.get("BGM_DIR", "./assets/bgm")
IMAGES_DIR         = os.environ.get("IMAGES_DIR", "./assets/images")

BGM_VOLUME         = -20
SFX_VOLUME         = -25
BGM_FADE_OUT       = 2000
SFX_MAX_MS         = 4000
SFX_FADE_OUT       = 300

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SFX_DIR, exist_ok=True)
os.makedirs(BGM_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

# ── 启动时打印 LLM 路由信息，方便排查 ──────────────────────────────
import sys
if DEEPSEEK_API_KEY:
    print(f"[config] LLM -> DeepSeek  model={DEEPSEEK_MODEL}", flush=True)
elif ANTHROPIC_API_KEY or CLAUDE_API_BASE:
    print(f"[config] LLM -> Anthropic/OpenRouter  model={CLAUDE_MODEL}", flush=True)
else:
    print("[config] WARNING: no LLM API key configured!", flush=True)
