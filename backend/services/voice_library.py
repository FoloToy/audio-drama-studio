"""
音色库管理服务
管理 assets/voices.json 和 assets/voices/ 目录下的预览音频
"""

import os
import json
import threading
from pathlib import Path

ASSETS_DIR  = Path(__file__).parent.parent / "assets"
VOICES_DIR  = ASSETS_DIR / "voices"
VOICES_JSON = ASSETS_DIR / "voices.json"

_lock = threading.Lock()


def _ensure_dirs():
    ASSETS_DIR.mkdir(exist_ok=True)
    VOICES_DIR.mkdir(exist_ok=True)


def _load() -> dict:
    _ensure_dirs()
    if not VOICES_JSON.exists():
        return {}
    try:
        return json.loads(VOICES_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict):
    _ensure_dirs()
    VOICES_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_voices() -> list[dict]:
    """返回所有音色列表（含 has_preview 字段）"""
    with _lock:
        data = _load()
    result = []
    for voice_id, info in data.items():
        preview_file = info.get("preview_file", "")
        has_preview  = bool(preview_file and (VOICES_DIR / preview_file).exists())
        result.append({
            "voice_id":    voice_id,
            "name":        info.get("name", voice_id),
            "description": info.get("description", ""),
            "has_preview": has_preview,
        })
    return result


def add_voice(
    voice_id:      str,
    name:          str,
    description:   str,
    preview_bytes: bytes = None,
    preview_ext:   str   = "mp3",
) -> dict:
    """添加或更新音色（preview_bytes 为空时保留原有预览文件）"""
    _ensure_dirs()
    with _lock:
        data  = _load()
        entry = {
            "name":         name,
            "description":  description,
            "preview_file": "",
        }
        if preview_bytes:
            fname = f"{voice_id}.{preview_ext.lstrip('.')}"
            (VOICES_DIR / fname).write_bytes(preview_bytes)
            entry["preview_file"] = fname
        elif voice_id in data and data[voice_id].get("preview_file"):
            entry["preview_file"] = data[voice_id]["preview_file"]
        data[voice_id] = entry
        _save(data)
    return {"voice_id": voice_id, **entry}


def delete_voice(voice_id: str) -> bool:
    """删除音色条目，同时删除对应的预览音频文件"""
    with _lock:
        data = _load()
        if voice_id not in data:
            return False
        preview_file = data[voice_id].get("preview_file", "")
        if preview_file:
            p = VOICES_DIR / preview_file
            if p.exists():
                p.unlink()
        del data[voice_id]
        _save(data)
    return True


def get_preview_path(voice_id: str) -> str | None:
    """返回预览文件的绝对路径，不存在则返回 None"""
    with _lock:
        data = _load()
    info = data.get(voice_id)
    if not info:
        return None
    preview_file = info.get("preview_file", "")
    if not preview_file:
        return None
    p = VOICES_DIR / preview_file
    return str(p) if p.exists() else None


def assign_voices(characters: list[dict]) -> dict[str, str]:
    """
    用 LLM 根据角色特征从本地音色库自动匹配最合适的音色。

    Args:
        characters: [{"name": "刘备", "importance": "必须", "lines_count": 10}, ...]

    Returns:
        {"角色名": "voice_id", ...}
    """
    voices = get_voices()
    if not voices:
        return {}

    from services.claude_service import call_llm_text, _extract_json

    chars_text = "\n".join(
        f"- {c['name']}（{c.get('importance', '次要')}，{c.get('lines_count', 0)} 条台词）"
        for c in characters
    )
    voices_text = "\n".join(
        f"- ID: {v['voice_id']} | 名称: {v['name']} | 描述: {v['description']}"
        for v in voices
    )

    prompt = f"""你是音频剧制作专家，请根据角色特征为每个角色匹配最合适的豆包 TTS 音色。

## 角色列表
{chars_text}

## 可用音色库
{voices_text}

## 匹配规则
- 根据角色的性别、年龄、性格选择最合适的音色
- 旁白角色优先选择清晰、温和的女声
- 每个角色只能分配一个音色
- 只能从以上音色库中选择，不能使用库外的 ID

## 输出格式
严格按以下 JSON 格式输出，不要有任何前缀、后缀或 Markdown：

{{
  "角色名1": "voice_id_1",
  "角色名2": "voice_id_2"
}}"""

    try:
        text   = call_llm_text(prompt, max_tokens=1024)
        result = _extract_json(text)
        # 校验：只保留库中存在的 voice_id
        valid_ids = {v["voice_id"] for v in voices}
        return {name: vid for name, vid in result.items() if vid in valid_ids}
    except Exception as e:
        print(f"[voice_library] assign_voices 失败: {e}", flush=True)
        return {}
