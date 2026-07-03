"""
ElevenLabs TTS 适配器（D-2 多 TTS 供应商）。
接口：POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
模型：eleven_multilingual_v2（支持中文）。返回 MP3 二进制。
"""

from typing import Optional
import requests
import config


def synthesize(text: str, voice_id: str, emotion_context: Optional[str] = None) -> Optional[bytes]:
    key = (config.ELEVENLABS_API_KEY or "").strip()
    if not key:
        print("[TTS/ElevenLabs] 未配置 ELEVENLABS_API_KEY", flush=True)
        return None
    try:
        resp = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                # ElevenLabs 无显式情感参数；用 voice_settings 的 style 近似控制表现力
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75,
                                   "style": 0.35 if emotion_context else 0.0},
            },
            timeout=90,
        )
        if resp.status_code != 200:
            print(f"[TTS/ElevenLabs] HTTP {resp.status_code}: {resp.text[:200]}", flush=True)
            return None
        return resp.content
    except Exception as e:
        print(f"[TTS/ElevenLabs] 请求异常: {e}", flush=True)
        return None
