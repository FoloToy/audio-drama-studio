"""
音频短剧创作 Agent 平台 —— FastAPI 后端入口。

- 全部平台路由在 routes_agent.py（APIRouter，前缀 /api）
- 配置（API Key 等）存 SQLite app_settings 表；backend/.env 仅作首次启动播种
- AgentTask 编排为线程池 worker + SSE（orchestrator.py）
- 启动：PORT=5001 python -u main.py（等价 uvicorn main:app --port 5001）

（旧 Flask 版 Studio 端点已随迁移移除；旧单页 Studio 前端 App.jsx 不再挂载。）
"""

import sys

# Windows 默认 GBK 终端无法打印 emoji；强制 UTF-8（必须在其他 import 之前）
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db as agent_db
import orchestrator as agent_orch
import agents as agent_impls
from routes_agent import router as agent_router

app = FastAPI(title="音频短剧创作 Agent 平台", version="2.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# ── 启动装配：DB（含配置 overlay）→ Agent 注册 → worker → 路由 ──────────
agent_db.init_db()
agent_impls.register_all()
agent_orch.start_workers(3)

# 配置 overlay 之后重建 Anthropic 客户端（claude_service 在 import 时用的是 .env 值）
try:
    import services.claude_service as _cs
    _cs.client = _cs._make_client()
except Exception as _e:
    print(f"[main] Anthropic 客户端初始化跳过: {_e}", flush=True)

app.include_router(agent_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "framework": "fastapi"}


if __name__ == "__main__":
    # 启动时将磁盘上已有的 BGM/音效文件同步进素材库
    from services import library as asset_library
    asset_library.sync_from_disk()

    import uvicorn
    port = int(os.environ.get("PORT", "5001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
