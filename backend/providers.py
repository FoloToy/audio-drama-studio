"""
供应商注册表（产品定义 V2 · D-2）。
五种生成能力（llm / tts / music / sfx / image）× 多供应商：
- 每个供应商声明所需配置项（env key），据此判断"已配置/未配置"
- 全局默认供应商存 app_settings 表（key: default_<capability>）
- 项目可覆盖（projects.<capability>_provider 列）
- resolve() 决策顺序：项目覆盖 → 全局默认 → 第一个已配置 → 第一个注册
"""

import config
from db import get_conn, _write_lock

CAPABILITIES = ["llm", "tts", "music", "sfx", "image"]

# 注册表：capability → [ {id, name, requires: [env keys], note} ]
REGISTRY = {
    "llm": [
        {"id": "deepseek",  "name": "DeepSeek",            "requires": ["DEEPSEEK_API_KEY"],
         "note": "deepseek-chat，OpenAI 兼容，推荐"},
        {"id": "openai",    "name": "OpenAI 兼容",          "requires": ["OPENAI_API_KEY"],
         "note": "改 Base URL 可接 GPT/Qwen/Moonshot/GLM 等"},
        {"id": "anthropic", "name": "Anthropic Claude",     "requires": ["ANTHROPIC_API_KEY"],
         "note": "含 OpenRouter（填 CLAUDE_API_BASE）", "alt_requires": ["CLAUDE_API_BASE"]},
    ],
    "tts": [
        {"id": "doubao",     "name": "豆包 seed-tts-2.0",   "requires": ["DOUBAO_API_KEY"],
         "note": "情感上下文控制，中文儿童内容首选"},
        {"id": "minimax",    "name": "MiniMax speech",      "requires": ["MINIMAX_API_KEY"],
         "note": "系统音色含儿童声（聪明男童/可爱女孩）"},
        {"id": "elevenlabs", "name": "ElevenLabs",          "requires": ["ELEVENLABS_API_KEY"],
         "note": "multilingual v2，多语种"},
    ],
    "music": [
        {"id": "minimax", "name": "MiniMax music-2.6", "requires": ["MINIMAX_API_KEY"],
         "note": "约 3-4 分钟/首，无人声器乐"},
        {"id": "suno",    "name": "Suno（本地代理）",    "requires": ["SUNO_API_URL"],
         "note": "需本地部署 suno-api"},
    ],
    "sfx": [
        {"id": "elevenlabs", "name": "ElevenLabs SFX", "requires": ["ELEVENLABS_API_KEY"],
         "note": "约 5-10 秒/个，推荐"},
        {"id": "minimax",    "name": "MiniMax",         "requires": ["MINIMAX_API_KEY"],
         "note": "备用，较慢（~250s）"},
    ],
    "image": [
        {"id": "ark",    "name": "火山方舟 Seedream", "requires": ["ARK_API_KEY"],
         "note": "豆包 Seedream 文生图，中文提示词友好"},
        {"id": "openai", "name": "OpenAI 兼容图片",    "requires": ["OPENAI_API_KEY"],
         "note": "gpt-image / DALL·E 及兼容代理"},
    ],
}


def _configured(p: dict) -> bool:
    """所需配置项任一非空即视为已配置（alt_requires 为等效备选）。"""
    keys = p.get("requires", [])
    ok = all((getattr(config, k, "") or "").strip() for k in keys)
    if not ok and p.get("alt_requires"):
        ok = all((getattr(config, k, "") or "").strip() for k in p["alt_requires"])
    # SUNO_API_URL 有默认值，视为"可配置但需自建"，不自动算已配置
    if keys == ["SUNO_API_URL"]:
        ok = (config.SUNO_API_URL or "").strip() not in ("", "http://localhost:3000")
    return ok


def _get_setting(key: str) -> str | None:
    r = get_conn().execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None


def _set_setting(key: str, value: str):
    conn = get_conn()
    with _write_lock:
        conn.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)", (key, value))
        conn.commit()


def get_default(cap: str) -> str | None:
    return _get_setting(f"default_{cap}")


def set_default(cap: str, provider_id: str):
    valid = {p["id"] for p in REGISTRY.get(cap, [])}
    if provider_id and provider_id not in valid:
        raise ValueError(f"未知供应商 {provider_id}（能力 {cap}）")
    _set_setting(f"default_{cap}", provider_id or "")


def resolve(cap: str, project: dict = None) -> str:
    """决定某能力实际使用的供应商 id。"""
    plist = REGISTRY.get(cap, [])
    valid = {p["id"] for p in plist}
    # 1. 项目覆盖
    if project:
        pv = (project.get(f"{cap}_provider") or "").strip()
        if pv in valid:
            return pv
    # 2. 全局默认
    dv = (get_default(cap) or "").strip()
    if dv in valid:
        return dv
    # 3. 第一个已配置
    for p in plist:
        if _configured(p):
            return p["id"]
    # 4. 兜底：第一个注册的
    return plist[0]["id"] if plist else ""


def list_providers() -> dict:
    """供前端设置页使用：每能力的供应商列表 + 配置状态 + 当前默认。"""
    out = {}
    for cap in CAPABILITIES:
        out[cap] = {
            "providers": [
                {"id": p["id"], "name": p["name"], "note": p.get("note", ""),
                 "configured": _configured(p)}
                for p in REGISTRY[cap]
            ],
            "default": get_default(cap) or "",
            "effective": resolve(cap),
        }
    return out
