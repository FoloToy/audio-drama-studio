"""
豆包 TTS 2.0 HTTP 流式合成服务
完整复用 xiyou10.py 的接口逻辑，支持情感上下文注入
"""

import json
import uuid
import base64
import time
import os
import re
from typing import Optional
import requests
from config import DOUBAO_API_KEY, DOUBAO_RESOURCE_ID, DOUBAO_API_URL


def _sanitize_filename(name: str) -> str:
    """去除文件名中的非法字符，替换为下划线"""
    return re.sub(r'[/\\:*?"<>|]', '_', name)


def _build_additions(context: Optional[str] = None) -> str:
    additions = {"disable_default_bit_rate": True}
    if context and DOUBAO_RESOURCE_ID.startswith("seed-tts-2"):
        additions["context_texts"] = [context]
    return json.dumps(additions, ensure_ascii=False)


def _decode_ndjson_audio(raw_bytes: bytes) -> Optional[bytes]:
    try:
        text = raw_bytes.decode("utf-8")
    except Exception as e:
        print(f"[TTS] UTF-8解码失败: {e}")
        return None

    audio_chunks = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            code = obj.get("code", 0)
            if code not in (0, 20000000):
                print(f"[TTS] API错误码 {code}: {obj.get('message', '')}")
                return None
            data = obj.get("data")
            if data:
                try:
                    audio_chunks.append(base64.b64decode(data))
                except Exception as e:
                    print(f"[TTS] base64解码失败，跳过: {e}")
        except json.JSONDecodeError:
            continue

    if not audio_chunks:
        print("[TTS] 未找到音频数据")
        return None
    return b"".join(audio_chunks)


def synthesize(
    text: str,
    voice_type: str,
    emotion_context: Optional[str] = None,
) -> Optional[bytes]:
    """
    调用豆包TTS合成单条语音。
    
    Args:
        text: 要合成的文本（已去除情感标签）
        voice_type: 豆包音色ID，如 "zh_female_shaoergushi_uranus_bigtts"
        emotion_context: 情感描述自然语言，传入 context_texts
    
    Returns:
        MP3音频二进制数据，失败返回None
    """
    headers = {
        "X-Api-Key":         DOUBAO_API_KEY,
        "X-Api-Resource-Id": DOUBAO_RESOURCE_ID,
        "X-Api-Connect-Id":  str(uuid.uuid4()),
        "Content-Type":      "application/json",
    }
    payload = {
        "user":       {"uid": "audio_drama_gen"},
        "req_params": {
            "text":      text,
            "speaker":   voice_type,
            "additions": _build_additions(emotion_context),
        },
    }
    try:
        resp = requests.post(
            DOUBAO_API_URL,
            headers=headers,
            json=payload,
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"[TTS] HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        return _decode_ndjson_audio(resp.content)
    except Exception as e:
        print(f"[TTS] 请求异常: {e}")
        return None


def generate_episode_tts(
    script: list[dict],
    voice_map: dict[str, str],
    output_dir: str,
    progress_callback=None,
) -> dict[str, str]:
    """
    批量生成一集所有台词的TTS音频。
    
    Args:
        script:    结构化剧本列表
        voice_map: {角色名: 豆包音色ID}
        output_dir: 音频文件输出目录
        progress_callback: fn(index, speaker, status) 进度回调
    
    Returns:
        {文件key: 文件路径}，如 {"003_刘备": "/output/ep1/003_刘备.mp3"}
    """
    os.makedirs(output_dir, exist_ok=True)

    tts_items = [
        (i + 1, item)
        for i, item in enumerate(script)
        if item["type"] == "tts" and item["speaker"] in voice_map
    ]

    file_map = {}
    for seq, (global_idx, item) in enumerate(tts_items, 1):
        speaker     = item["speaker"]
        emotion_ctx = item.get("emotion") or None
        text        = item["text"]
        voice_id    = voice_map[speaker]

        safe_speaker = _sanitize_filename(speaker)
        filename = f"{global_idx:03d}_{safe_speaker}.mp3"
        out_path = os.path.join(output_dir, filename)
        file_key = f"{global_idx:03d}_{safe_speaker}"

        if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            print(f"[TTS] 已存在，跳过: {filename}")
            file_map[file_key] = out_path
            if progress_callback:
                progress_callback(seq, speaker, "skipped", len(tts_items))
            continue

        print(f"[TTS] 合成 [{global_idx:03d}] {speaker}: {text[:30]}…")
        audio = synthesize(text, voice_id, emotion_ctx)

        if audio:
            tmp_path = out_path + ".tmp"
            try:
                with open(tmp_path, "wb") as f:
                    f.write(audio)
                os.replace(tmp_path, out_path)
            except Exception:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                raise
            file_map[file_key] = out_path
            print(f"[TTS] OK {filename} ({len(audio)//1024}KB)")
            if progress_callback:
                progress_callback(seq, speaker, "done", len(tts_items))
        else:
            print(f"[TTS] FAIL 合成失败: {filename}")
            if progress_callback:
                progress_callback(seq, speaker, "error", len(tts_items))

        time.sleep(0.3)

    return file_map
