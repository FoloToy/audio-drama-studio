"""
Suno 非官方 API BGM 生成服务
依赖本地部署的 suno-api（https://github.com/gcui-art/suno-api）
"""

import os
import re
import time
import requests
from typing import Optional
from config import SUNO_API_URL, BGM_DIR


def _sanitize_filename(name: str) -> str:
    """去除文件名中的非法字符，与其他服务保持一致"""
    return re.sub(r'[/\\:*?"<>|]', '_', name)


def generate_bgm(
    bgm_name: str,
    prompt_en: str,
    max_wait_seconds: int = 300,
) -> Optional[str]:
    """
    生成 BGM：优先使用 MiniMax（MINIMAX_API_KEY 非空），否则走 Suno。

    Args:
        bgm_name:         BGM名称（用于文件命名）
        prompt_en:        英文提示词（纯音乐描述）
        max_wait_seconds: 最长等待时间

    Returns:
        生成的BGM文件路径，失败返回None
    """
    import config as _cfg
    if (_cfg.MINIMAX_API_KEY or "").strip():
        from services.minimax_bgm import generate_bgm as _mm_generate
        return _mm_generate(bgm_name, prompt_en, max_wait_seconds=min(max_wait_seconds, 300))

    safe_name = _sanitize_filename(bgm_name)
    out_path  = os.path.join(BGM_DIR, f"{safe_name}.mp3")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
        print(f"[BGM] 已存在，跳过: {safe_name}.mp3")
        return out_path

    generate_url = f"{SUNO_API_URL}/api/generate"
    payload = {
        "prompt":            prompt_en,
        "make_instrumental": True,
        "wait_audio":        False,  # 异步模式，轮询等待
    }

    try:
        print(f"[BGM] 提交生成任务: {bgm_name}")
        resp = requests.post(generate_url, json=payload, timeout=30)
        if resp.status_code != 200:
            print(f"[BGM] 提交失败 HTTP {resp.status_code}: {resp.text[:200]}")
            return None

        data = resp.json()
        # suno-api 返回格式: [{"id": "...", "audio_url": "...", ...}]
        if not data or not isinstance(data, list):
            print(f"[BGM] 响应格式异常: {data}")
            return None

        song_id   = data[0].get("id")
        audio_url = data[0].get("audio_url")

        # 如果立即有 audio_url 就直接下载
        if audio_url and audio_url.startswith("http"):
            return _download_bgm(audio_url, out_path, bgm_name)

        # 否则轮询等待
        if not song_id:
            print(f"[BGM] 无法获取 song_id")
            return None

        return _poll_and_download(song_id, out_path, bgm_name, max_wait_seconds)

    except Exception as e:
        print(f"[BGM] 请求异常 [{bgm_name}]: {e}")
        return None


def _poll_and_download(
    song_id: str,
    out_path: str,
    bgm_name: str,
    max_wait: int,
) -> Optional[str]:
    """轮询 Suno API 等待生成完成后下载"""
    query_url = f"{SUNO_API_URL}/api/get?ids={song_id}"
    waited    = 0
    interval  = 5

    while waited < max_wait:
        time.sleep(interval)
        waited += interval
        try:
            resp = requests.get(query_url, timeout=15)
            if resp.status_code != 200:
                continue
            items = resp.json()
            if not items:
                continue
            item      = items[0]
            status    = item.get("status", "")
            audio_url = item.get("audio_url", "")

            if status == "complete" and audio_url:
                return _download_bgm(audio_url, out_path, bgm_name)
            elif status in ("error", "failed"):
                print(f"[BGM] 生成失败: {bgm_name}, status={status}")
                return None
            else:
                print(f"[BGM] 等待中 [{waited}s]: {bgm_name}, status={status}")
        except Exception as e:
            print(f"[BGM] 轮询异常: {e}")

    print(f"[BGM] 超时: {bgm_name}")
    return None


def _download_bgm(audio_url: str, out_path: str, bgm_name: str) -> Optional[str]:
    """下载BGM音频文件，用临时文件+rename保证原子性"""
    tmp_path = out_path + ".tmp"
    try:
        resp = requests.get(audio_url, timeout=60, stream=True)
        if resp.status_code != 200:
            print(f"[BGM] 下载失败 HTTP {resp.status_code}")
            return None
        with open(tmp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        os.replace(tmp_path, out_path)  # 原子替换，不留损坏文件
        size_kb = os.path.getsize(out_path) // 1024
        print(f"[BGM] OK {bgm_name} ({size_kb}KB)")
        return out_path
    except Exception as e:
        print(f"[BGM] 下载异常: {e}")
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return None


def generate_all_bgm(
    bgm_prompts: dict[str, str],
    progress_callback=None,
) -> dict[str, str]:
    """
    批量生成所有BGM（串行，因Suno API有并发限制）。
    
    Args:
        bgm_prompts: {BGM名: 英文提示词}
        progress_callback: fn(name, status, index, total)
    
    Returns:
        {BGM名: 文件路径}
    """
    result = {}
    total  = len(bgm_prompts)

    for i, (name, prompt) in enumerate(bgm_prompts.items(), 1):
        print(f"[BGM] 生成 [{i}/{total}]: {name}")
        if progress_callback:
            progress_callback(name, "generating", i, total)

        path = generate_bgm(name, prompt)
        if path:
            result[name] = path
            if progress_callback:
                progress_callback(name, "done", i, total)
        else:
            if progress_callback:
                progress_callback(name, "error", i, total)

    return result
