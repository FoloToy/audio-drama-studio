"""
LLM 多供应商路由（D-2）。
call_llm_text(prompt, system, max_tokens, provider) —— provider 显式指定或经 providers.resolve 决定。
支持：deepseek / openai（OpenAI 兼容，可自定义 Base URL）/ anthropic（含 OpenRouter）。
"""

import requests
import config
import providers as prov


def _openai_compatible(base: str, key: str, model: str,
                       prompt: str, system: str, max_tokens: int) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = requests.post(
        base.rstrip("/") + "/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "stream": False, "max_tokens": max_tokens},
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def call_llm_text(prompt: str, system: str = "", max_tokens: int = 4096,
                  provider: str = None, project: dict = None) -> str:
    """统一非流式文本补全。provider 未指定时按 项目覆盖→全局默认→已配置 解析。"""
    pid = provider or prov.resolve("llm", project)
    print(f"[LLM] provider={pid}", flush=True)

    if pid == "deepseek":
        key = (config.DEEPSEEK_API_KEY or "").strip()
        if not key:
            raise ValueError("DeepSeek 未配置 API Key")
        return _openai_compatible("https://api.deepseek.com", key,
                                  (config.DEEPSEEK_MODEL or "deepseek-chat").strip(),
                                  prompt, system, max_tokens)

    if pid == "openai":
        key = (config.OPENAI_API_KEY or "").strip()
        if not key:
            raise ValueError("OpenAI 兼容供应商未配置 API Key")
        return _openai_compatible(config.OPENAI_BASE_URL or "https://api.openai.com/v1", key,
                                  (config.OPENAI_MODEL or "gpt-4o-mini").strip(),
                                  prompt, system, max_tokens)

    # anthropic（含 OpenRouter 代理，复用 claude_service 的客户端构建逻辑）
    import services.claude_service as cs
    kwargs = dict(model=config.CLAUDE_MODEL, max_tokens=max_tokens,
                  messages=[{"role": "user", "content": prompt}])
    if system:
        kwargs["system"] = system
    response = cs.client.messages.create(**kwargs)
    return response.content[0].text
