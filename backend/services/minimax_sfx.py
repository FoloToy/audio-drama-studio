"""
MiniMax 音乐生成 API — 音效（SFX）生成服务
文档：https://platform.minimaxi.com/docs/api-reference/music-generation

接口同步返回，data.audio 为 hex 编码的 MP3 数据，无需轮询。
音效与 BGM 使用同一接口，通过 prompt 描述短促声音效果。
"""

import os
import re
import requests
from typing import Optional

import config

_BASE_URL = "https://api.minimaxi.com/v1"


def _sanitize(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', '_', name)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {config.MINIMAX_API_KEY.strip()}",
        "Content-Type":  "application/json",
    }


def generate_sfx(
    sfx_name:         str,
    prompt_en:        str,
    max_wait_seconds: int = 300,
) -> Optional[str]:
    """
    用 MiniMax music-2.6-free 生成音效，返回本地 MP3 路径；失败抛异常。
    """
    safe_name = _sanitize(sfx_name)
    out_path  = os.path.join(config.SFX_DIR, f"{safe_name}.mp3")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 1_000:
        print(f"[SFX/MiniMax] 已存在，跳过: {safe_name}.mp3", flush=True)
        return out_path

    print(f"[SFX/MiniMax] 生成中: {sfx_name}", flush=True)

    resp = requests.post(
        f"{_BASE_URL}/music_generation",
        headers=_headers(),
        json={
            "model":           "music-2.6",
            "prompt":          prompt_en,
            "is_instrumental": True,
            "audio_setting": {
                "sample_rate": 44100,
                "bitrate":     128000,
                "format":      "mp3",
            },
        },
        timeout=max_wait_seconds,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"MiniMax SFX HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    br   = data.get("base_resp") or {}
    if br.get("status_code", -1) != 0:
        raise RuntimeError(
            f"MiniMax SFX 错误 {br.get('status_code')}: {br.get('status_msg')} | {data}"
        )

    audio_hex = (data.get("data") or {}).get("audio", "")
    if not audio_hex:
        raise RuntimeError(f"MiniMax SFX 返回空音频: {data}")

    audio_bytes = bytes.fromhex(audio_hex)
    tmp_path    = out_path + ".tmp"
    try:
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)
        os.replace(tmp_path, out_path)
        size_kb = os.path.getsize(out_path) // 1024
        print(f"[SFX/MiniMax] {sfx_name} ({size_kb} KB)", flush=True)
        return out_path
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"MiniMax SFX 写文件失败: {e}") from e
