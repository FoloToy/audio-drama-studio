import json
import re
import anthropic
import requests
from pathlib import Path
import config


def _make_client() -> anthropic.Anthropic:
    base = (config.CLAUDE_API_BASE or "").strip()
    key  = (config.ANTHROPIC_API_KEY or "").strip()

    # 如果 base 字段填的是 API Key（以 sk- 开头），自动识别为 OpenRouter Key
    if base.startswith("sk-"):
        return anthropic.Anthropic(
            auth_token=base,
            base_url="https://openrouter.ai/api",
            default_headers={
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "Audio Drama Studio",
            },
        )
    # base 字段填的是正常 URL（自定义代理）
    if base:
        return anthropic.Anthropic(
            auth_token=key,
            base_url=base,
            default_headers={
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "Audio Drama Studio",
            },
        )
    # 直连 Anthropic：用 X-Api-Key（key 为空时用占位符，避免 SDK 初始化报错；调用时才会真正鉴权失败）
    return anthropic.Anthropic(api_key=key or "sk-placeholder")


client = _make_client()

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8")


def _parse_with_repair(raw: str) -> dict:
    """
    两层修复：
    1. strict=False  容忍控制字符（\\n \\t 等）
    2. 迭代转义裸引号  精准修复 Claude 在中文台词里夹带的 ASCII 双引号
       （不用 json_repair 库——它会截断 bgm/sfx 数组）
    """
    # 第一层：直接解析，容忍控制字符
    try:
        return json.loads(raw, strict=False)
    except json.JSONDecodeError:
        pass

    # 第二层：逐步转义最近的裸引号，最多修 60 次
    working = raw
    for _ in range(60):
        try:
            return json.loads(working, strict=False)
        except json.JSONDecodeError as e:
            pos   = e.pos
            fixed = False
            # 从报错位置向前找最近一个未转义的双引号
            for i in range(pos - 1, max(pos - 400, -1), -1):
                if working[i] == '"' and (i == 0 or working[i - 1] != '\\'):
                    working = working[:i] + '\\"' + working[i + 1:]
                    fixed = True
                    break
            if not fixed:
                break

    try:
        return json.loads(working, strict=False)
    except json.JSONDecodeError as e:
        snippet = working[max(0, e.pos - 80): e.pos + 80]
        raise ValueError(f"JSON repair failed at char {e.pos}: {e.msg}\n>>> {snippet!r}") from e


def _fill_missing(data: dict) -> dict:
    """从 script 数组重建空缺的 characters / bgm_list / sfx_list。"""
    script = data.get("script") or []
    if not data.get("characters") and script:
        from collections import Counter
        counts = Counter(
            item["speaker"] for item in script
            if item.get("type") == "tts" and item.get("speaker")
        )
        data["characters"] = [
            {
                "name": name,
                "importance": "必须" if name == "旁白" else "主要",
                "lines_count": cnt,
            }
            for name, cnt in counts.most_common()
        ]
    if not data.get("bgm_list") and script:
        data["bgm_list"] = list({
            item["name"] for item in script
            if item.get("type") == "bgm" and item.get("action") == "start" and item.get("name")
        })
    if not data.get("sfx_list") and script:
        data["sfx_list"] = list({
            item["name"] for item in script
            if item.get("type") == "sfx" and item.get("name")
        })
    return data


def _extract_json(text: str) -> dict:
    """从Claude返回文本中提取JSON，兼容有无markdown代码块、有无前缀说明"""
    text = text.strip()
    start_match = re.search(r'```(?:json)?\s*\n?', text)
    if start_match:
        content_start = start_match.end()
        end_pos = text.rfind('```', content_start)
        if end_pos > content_start:
            return _fill_missing(_parse_with_repair(text[content_start:end_pos].strip()))
    start = text.find("{")
    end   = text.rfind("}")
    if start != -1 and end > start:
        return _fill_missing(_parse_with_repair(text[start:end + 1]))
    return _fill_missing(_parse_with_repair(text))


def _fill_prompt(template: str, **kwargs) -> str:
    """
    手动替换占位符，避免两个问题：
    1. str.format() 把 JSON 示例里的花括号当占位符
    2. 用户内容（raw_text）里若含 {other_key} 字样，被二次替换
    策略：用唯一哨兵先占位用户内容，再统一替换元数据，最后还原用户内容
    """
    # 分离「用户内容」（可能含花括号）和「元数据」（不含花括号）
    USER_CONTENT_KEYS = {"raw_text", "sfx_list", "bgm_list"}
    sentinels = {}
    result = template

    # 第一步：把用户内容替换为唯一哨兵（哨兵不含花括号，不会被误匹配）
    for key in USER_CONTENT_KEYS:
        if key in kwargs:
            sentinel = f"\x00PLACEHOLDER_{key.upper()}\x00"
            result = result.replace("{" + key + "}", sentinel)
            sentinels[sentinel] = str(kwargs[key])

    # 第二步：替换元数据占位符（story_name, episode_name 等，不含花括号）
    for key, value in kwargs.items():
        if key not in USER_CONTENT_KEYS:
            result = result.replace("{" + key + "}", str(value))

    # 第三步：还原用户内容
    for sentinel, value in sentinels.items():
        result = result.replace(sentinel, value)

    return result


# 所有改写调用统一加的 system 指令，防止 JSON 字符串内出现裸引号
_REWRITE_SYSTEM = (
    "你的输出必须是合法的 JSON。"
    "在 JSON 字符串值（emotion、text 等字段）中，禁止使用 ASCII 双引号（\"），"
    "如需表示引语请使用中文引号「」或直接省略引号符号。"
)

# 内置风格 → 对应 prompt 文件名
STYLE_PROMPT_MAP = {
    "sunjingxiu": "script_rewrite_sunjingxiu.txt",
    "blog":       "script_rewrite_blog.txt",
}

# 自定义 prompt 中要追加的 JSON 输出格式要求（保证输出可解析）
_CUSTOM_OUTPUT_SUFFIX = """

---

## 输出格式（必须严格遵守）

必须严格按照以下 JSON 格式输出，不要输出任何其他内容：

```json
{
  "script": [
    {"type": "bgm", "action": "start", "name": "BGM名称"},
    {"type": "tts", "speaker": "旁白", "emotion": "情感描述文字", "text": "台词内容"},
    {"type": "sfx", "name": "音效名称"},
    {"type": "tts", "speaker": "角色名", "emotion": "情感描述文字", "text": "台词内容"},
    {"type": "bgm", "action": "stop"}
  ],
  "characters": [
    {"name": "旁白", "importance": "必须", "lines_count": 数字},
    {"name": "角色名", "importance": "主要或次要", "lines_count": 数字}
  ],
  "bgm_list": ["BGM名称1"],
  "sfx_list": ["音效名称1"]
}
```

## 用户输入信息

故事名称：{story_name}
集数名称：{episode_name}

原著文本：
{raw_text}

---

请直接输出 JSON，不要有任何前缀说明或后缀解释。
"""


def build_rewrite_prompt(
    story_name:    str,
    episode_name:  str,
    raw_text:      str,
    style:         str = "sunjingxiu",
    custom_prompt: str = "",
) -> str:
    if style == "custom":
        base     = custom_prompt.strip() if custom_prompt.strip() else _load_prompt("script_rewrite_sunjingxiu.txt")
        template = base + _CUSTOM_OUTPUT_SUFFIX
    else:
        filename = STYLE_PROMPT_MAP.get(style, "script_rewrite_sunjingxiu.txt")
        template = _load_prompt(filename)
    return _fill_prompt(template, story_name=story_name,
                        episode_name=episode_name, raw_text=raw_text)


SCRIPT_TOOL = {
    "name": "output_script",
    "description": "改写后的广播剧剧本结构化输出",
    "input_schema": {
        "type": "object",
        "properties": {
            "script": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type":    {"type": "string"},
                        "speaker": {"type": "string"},
                        "emotion": {"type": "string"},
                        "text":    {"type": "string"},
                        "action":  {"type": "string"},
                        "name":    {"type": "string"},
                    },
                    "required": ["type"],
                },
            },
            "characters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name":        {"type": "string"},
                        "importance":  {"type": "string"},
                        "lines_count": {"type": "integer"},
                    },
                    "required": ["name", "importance", "lines_count"],
                },
            },
            "bgm_list": {"type": "array", "items": {"type": "string"}},
            "sfx_list": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["script", "characters", "bgm_list", "sfx_list"],
    },
}


def rewrite_script(
    story_name:    str,
    episode_name:  str,
    raw_text:      str,
    style:         str = "sunjingxiu",
    custom_prompt: str = "",
) -> dict:
    prompt = build_rewrite_prompt(story_name, episode_name, raw_text, style, custom_prompt)
    response = client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=8192,
        tools=[SCRIPT_TOOL],
        tool_choice={"type": "tool", "name": "output_script"},
        messages=[{"role": "user", "content": prompt}],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "output_script":
            return _fill_missing(block.input)
    raise ValueError("Claude 未返回 tool_use 结果")


def stream_llm(prompt: str, system: str = ""):
    """
    统一的流式推理接口。
    优先使用 DeepSeek（DEEPSEEK_API_KEY 非空时）；否则走 Anthropic。
    每次 yield 一个 (event_type, text) 元组：
      ("thinking", None)  —— 模型已响应、开始生成
      ("token",    str)   —— 增量 token
    """
    # ── DeepSeek 路径 ──────────────────────────────────────────────────
    if (config.DEEPSEEK_API_KEY or "").strip():
        key   = config.DEEPSEEK_API_KEY.strip()
        model = (config.DEEPSEEK_MODEL or "deepseek-v4-flash").strip()
        print(f"[LLM] 使用 DeepSeek，model={model}", flush=True)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type":  "application/json",
                "Accept":        "text/event-stream",
            },
            json={
                "model":      model,
                "messages":   messages,
                "stream":     True,
                "max_tokens": 8192,
            },
            stream=True,
            timeout=120,
        )
        resp.raise_for_status()
        yield ("thinking", None)   # 连接建立即进入「构思」阶段，不等第一个 token

        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
            if not line.startswith("data: "):
                continue
            payload = line[6:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            text  = delta.get("content") or ""
            if text:
                yield ("token", text)
        return

    # ── Anthropic / OpenRouter 路径 ────────────────────────────────────
    print(f"[LLM] 使用 Anthropic/OpenRouter，model={config.CLAUDE_MODEL}", flush=True)
    kwargs = dict(
        model=config.CLAUDE_MODEL,
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )
    if system:
        kwargs["system"] = system

    with client.messages.stream(**kwargs) as stream:
        for event in stream:
            etype = getattr(event, "type", None)
            if etype == "message_start":
                yield ("thinking", None)
            elif etype == "content_block_delta":
                delta = getattr(event, "delta", None)
                if delta and getattr(delta, "type", None) == "text_delta":
                    chunk = getattr(delta, "text", "") or ""
                    if chunk:
                        yield ("token", chunk)


def call_llm_text(prompt: str, system: str = "", max_tokens: int = 4096) -> str:
    """
    统一非流式文本补全接口。
    优先 DeepSeek（DEEPSEEK_API_KEY 非空），否则走 Anthropic。
    返回模型的完整输出文本。
    """
    if (config.DEEPSEEK_API_KEY or "").strip():
        key   = config.DEEPSEEK_API_KEY.strip()
        model = (config.DEEPSEEK_MODEL or "deepseek-chat").strip()
        print(f"[LLM] call_llm_text 使用 DeepSeek，model={model}")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "stream": False, "max_tokens": max_tokens},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    # Anthropic 路径
    kwargs = dict(
        model=config.CLAUDE_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return response.content[0].text


def generate_media_prompts(
    story_name: str,
    episode_name: str,
    sfx_list: list[str],
    bgm_list: list[str],
) -> dict:
    """为音效和BGM生成英文提示词（支持 DeepSeek / Anthropic）。"""
    template = _load_prompt("media_prompt.txt")
    prompt   = _fill_prompt(template,
                            story_name=story_name,
                            episode_name=episode_name,
                            sfx_list="\n".join(f"- {s}" for s in sfx_list),
                            bgm_list="\n".join(f"- {b}" for b in bgm_list))
    raw = call_llm_text(prompt, max_tokens=4096)
    if not raw:
        raise ValueError("模型返回了空响应")
    return _extract_json(raw)
