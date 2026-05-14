"""
MiniMax 音乐生成 API — BGM 生成服务
文档：https://platform.minimaxi.com/docs/api-reference/music-generation

接口同步返回，data.audio 为 hex 编码的 MP3 数据，无需轮询。
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


def generate_bgm(
    bgm_name:         str,
    prompt_en:        str,
    max_wait_seconds: int = 300,   # music-2.6 同步接口，约需 200-250s；保留参数签名兼容性
) -> Optional[str]:
    """
    用 MiniMax music-2.6-free 生成 BGM，返回本地 MP3 路径；失败抛异常。
    """
    safe_name = _sanitize(bgm_name)
    out_path  = os.path.join(config.BGM_DIR, f"{safe_name}.mp3")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 10_000:
        print(f"[BGM/MiniMax] 已存在，跳过: {safe_name}.mp3", flush=True)
        return out_path

    print(f"[BGM/MiniMax] v2 model=music-2.6 生成中: {bgm_name}", flush=True)

    resp = requests.post(
        f"{_BASE_URL}/music_generation",
        headers=_headers(),
        json={
            "model":           "music-2.6",
            "prompt":          prompt_en,
            "is_instrumental": True,
            "audio_setting": {
                "sample_rate": 44100,
                "bitrate":     256000,
                "format":      "mp3",
            },
        },
        timeout=max_wait_seconds,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"MiniMax BGM HTTP {resp.status_code}: {resp.text[:300]}")

    data  = resp.json()
    br    = data.get("base_resp") or {}
    if br.get("status_code", -1) != 0:
        raise RuntimeError(
            f"MiniMax BGM 错误 {br.get('status_code')}: {br.get('status_msg')} | {data}"
        )

    audio_hex = (data.get("data") or {}).get("audio", "")
    if not audio_hex:
        raise RuntimeError(f"MiniMax BGM 返回空音频: {data}")

    audio_bytes = bytes.fromhex(audio_hex)
    tmp_path    = out_path + ".tmp"
    try:
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)
        os.replace(tmp_path, out_path)
        size_kb = os.path.getsize(out_path) // 1024
        print(f"[BGM/MiniMax] {bgm_name} ({size_kb} KB)", flush=True)
        return out_path
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"MiniMax BGM 写文件失败: {e}") from e
