"""
TTS 多供应商路由（D-2）。
音色建模为 voice = provider + provider_voice_id（voices.provider 列）。
同一部剧可以混用不同供应商的音色——按每个音色自身的 provider 分发合成。
"""

import os
import re
import time
from typing import Optional

import store


def _sanitize(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', '_', name)


def synthesize(text: str, voice_id: str, emotion_context: Optional[str] = None,
               provider: Optional[str] = None) -> Optional[bytes]:
    """按 provider 分发到对应 TTS 适配器。provider 未指定时查音色库。"""
    if not provider:
        v = store.get_voice(voice_id)
        provider = (v or {}).get("provider") or "doubao"
    if provider == "minimax":
        from services.minimax_tts import synthesize as _syn
        return _syn(text, voice_id, emotion_context)
    if provider == "elevenlabs":
        from services.elevenlabs_tts import synthesize as _syn
        return _syn(text, voice_id, emotion_context)
    # 默认豆包
    from services.doubao_tts import synthesize as _syn
    return _syn(text, voice_id, emotion_context)


def generate_episode_tts(script: list[dict], voice_map: dict[str, str],
                         output_dir: str, progress_callback=None) -> dict[str, str]:
    """
    批量生成一集台词（多供应商版，接口与 services.doubao_tts.generate_episode_tts 一致）。
    voice_map: {角色名: voice_id}；每个 voice_id 的 provider 从音色库解析。
    """
    os.makedirs(output_dir, exist_ok=True)

    # 预解析每个音色的 provider（减少循环内查询）
    providers = {}
    for vid in set(voice_map.values()):
        v = store.get_voice(vid)
        providers[vid] = (v or {}).get("provider") or "doubao"

    tts_items = [(i + 1, item) for i, item in enumerate(script)
                 if item["type"] == "tts" and item["speaker"] in voice_map]
    file_map = {}
    for seq, (gidx, item) in enumerate(tts_items, 1):
        speaker = item["speaker"]
        vid = voice_map[speaker]
        prov = providers.get(vid, "doubao")
        fname = f"{gidx:03d}_{_sanitize(speaker)}.mp3"
        out_path = os.path.join(output_dir, fname)
        fkey = f"{gidx:03d}_{_sanitize(speaker)}"

        if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            file_map[fkey] = out_path
            if progress_callback:
                progress_callback(seq, speaker, "skipped", len(tts_items))
            continue

        print(f"[TTS/{prov}] 合成 [{gidx:03d}] {speaker}: {item['text'][:30]}…", flush=True)
        audio = synthesize(item["text"], vid, item.get("emotion") or None, provider=prov)
        if audio:
            tmp = out_path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(audio)
            os.replace(tmp, out_path)
            file_map[fkey] = out_path
            if progress_callback:
                progress_callback(seq, speaker, "done", len(tts_items))
        else:
            print(f"[TTS/{prov}] FAIL: {fname}", flush=True)
            if progress_callback:
                progress_callback(seq, speaker, "error", len(tts_items))
        time.sleep(0.3)   # 各家均有限流，统一节流

    return file_map
