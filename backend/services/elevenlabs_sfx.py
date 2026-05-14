"""
ElevenLabs Sound Effects API 音效生成服务

专用于生成离散音效（刀剑碰撞、脚步声、自然音等）。
MiniMax music-2.6 是音乐模型，不适合做音效；音效必须用 ElevenLabs。
文档：https://elevenlabs.io/docs/api-reference/sound-generation
"""

import os
import re
import requests
from typing import Optional
from config import ELEVENLABS_API_KEY, ELEVENLABS_SFX_URL, SFX_DIR


def _sanitize(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', '_', name)


def generate_sfx(
    sfx_name:         str,
    prompt_en:        str,
    duration_seconds: float = 3.0,
    prompt_influence: float = 0.3,
) -> Optional[str]:
    """
    用 ElevenLabs Sound Effects API 生成音效，返回本地 MP3 路径；失败返回 None。
    """
    safe_name = _sanitize(sfx_name)
    out_path  = os.path.join(SFX_DIR, f"{safe_name}.mp3")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        print(f"[SFX/ElevenLabs] 已存在，跳过: {safe_name}.mp3", flush=True)
        return out_path

    if not ELEVENLABS_API_KEY:
        print(f"[SFX/ElevenLabs] 未配置 ELEVENLABS_API_KEY，跳过: {sfx_name}", flush=True)
        return None

    print(f"[SFX/ElevenLabs] 生成中: {sfx_name}", flush=True)

    tmp_path = out_path + ".tmp"
    try:
        resp = requests.post(
            ELEVENLABS_SFX_URL,
            headers={
                "xi-api-key":   ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text":             prompt_en,
                "duration_seconds": duration_seconds,
                "prompt_influence": prompt_influence,
            },
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"[SFX/ElevenLabs] HTTP {resp.status_code}: {resp.text[:200]}", flush=True)
            return None

        with open(tmp_path, "wb") as f:
            f.write(resp.content)
        os.replace(tmp_path, out_path)
        size_kb = os.path.getsize(out_path) // 1024
        print(f"[SFX/ElevenLabs] {sfx_name} ({size_kb} KB)", flush=True)
        return out_path

    except Exception as e:
        print(f"[SFX/ElevenLabs] 生成失败 [{sfx_name}]: {e}", flush=True)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return None


def generate_all_sfx(
    sfx_prompts: dict[str, str],
    progress_callback=None,
) -> dict[str, str]:
    """批量生成音效，返回 {名称: 文件路径}。"""
    result = {}
    total  = len(sfx_prompts)

    for i, (name, prompt) in enumerate(sfx_prompts.items(), 1):
        print(f"[SFX] 生成 [{i}/{total}]: {name}", flush=True)
        if progress_callback:
            progress_callback(name, "generating", i, total)

        path = generate_sfx(name, prompt)
        if path:
            result[name] = path
            if progress_callback:
                progress_callback(name, "done", i, total)
        else:
            if progress_callback:
                progress_callback(name, "error", i, total)

    return result
