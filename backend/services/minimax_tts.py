"""
MiniMax T2A v2 语音合成适配器（D-2 多 TTS 供应商）。
接口：POST https://api.minimaxi.com/v1/t2a_v2（注意域名 minimaxi.com）
响应：data.audio 为 hex 编码的 MP3。
系统音色示例：clever_boy / lovely_girl / audiobook_female_1 / audiobook_male_1
"""

from typing import Optional
import requests
import config

_URL = "https://api.minimaxi.com/v1/t2a_v2"

# 平台情感描述（自然语言）→ MiniMax emotion 枚举的粗映射
_EMOTION_MAP = [
    (("开心", "喜悦", "兴奋", "活泼"), "happy"),
    (("悲伤", "难过", "哭"), "sad"),
    (("愤怒", "生气"), "angry"),
    (("害怕", "恐惧", "紧张", "警惕"), "fearful"),
    (("惊讶", "惊奇"), "surprised"),
    (("厌恶",), "disgusted"),
]


def _map_emotion(desc: str) -> Optional[str]:
    for keys, emo in _EMOTION_MAP:
        if any(k in (desc or "") for k in keys):
            return emo
    return None  # 默认中性


def synthesize(text: str, voice_id: str, emotion_context: Optional[str] = None) -> Optional[bytes]:
    key = (config.MINIMAX_API_KEY or "").strip()
    if not key:
        print("[TTS/MiniMax] 未配置 MINIMAX_API_KEY", flush=True)
        return None
    url = _URL
    group = (config.MINIMAX_GROUP_ID or "").strip()
    if group:
        url += f"?GroupId={group}"
    voice_setting = {"voice_id": voice_id, "speed": 1.0, "vol": 1.0, "pitch": 0}
    emo = _map_emotion(emotion_context or "")
    if emo:
        voice_setting["emotion"] = emo
    try:
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "speech-02-turbo",
                "text": text,
                "voice_setting": voice_setting,
                "audio_setting": {"format": "mp3", "sample_rate": 32000, "bitrate": 128000},
            },
            timeout=90,
        )
        if resp.status_code != 200:
            print(f"[TTS/MiniMax] HTTP {resp.status_code}: {resp.text[:200]}", flush=True)
            return None
        data = resp.json()
        audio_hex = (data.get("data") or {}).get("audio")
        if not audio_hex:
            print(f"[TTS/MiniMax] 无音频数据: {str(data)[:200]}", flush=True)
            return None
        return bytes.fromhex(audio_hex)
    except Exception as e:
        print(f"[TTS/MiniMax] 请求异常: {e}", flush=True)
        return None
