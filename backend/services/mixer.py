"""
pydub 混音合成服务
完整复用 xiyou10.py 的 _mix_merge 逻辑
将台词音频、音效、BGM 按时间轴合成为完整音频剧
"""

import os
import re
from typing import Optional
from config import BGM_VOLUME, SFX_VOLUME, BGM_FADE_OUT, SFX_MAX_MS, SFX_FADE_OUT


def _sanitize_filename(name: str) -> str:
    """去除文件名中的非法字符，与 doubao_tts 保持一致"""
    return re.sub(r'[/\\:*?"<>|]', '_', name)


def _load_audio(path: str):
    from pydub import AudioSegment
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    return AudioSegment.from_file(path, format=ext if ext else "mp3")


def _loop_bgm(bgm_seg, target_ms: int):
    """将 BGM 循环拼接到至少 target_ms 长度，线性增长不指数膨胀"""
    if len(bgm_seg) == 0:
        return bgm_seg
    result = bgm_seg
    while len(result) < target_ms:
        result = result + bgm_seg
    return result


def mix_episode(
    script: list[dict],
    tts_file_map: dict[str, str],
    sfx_file_map: dict[str, str],
    bgm_file_map: dict[str, str],
    output_path: str,
    progress_callback=None,
) -> Optional[str]:
    """
    将所有音频素材按剧本时间轴合成为完整音频剧。
    
    Args:
        script:         结构化JSON剧本
        tts_file_map:   {"003_刘备": "/path/to/003_刘备.mp3", ...}
        sfx_file_map:   {"刀剑碰撞": "/path/to/刀剑碰撞.mp3", ...}
        bgm_file_map:   {"开场音乐": "/path/to/开场音乐.mp3", ...}
        output_path:    最终输出文件路径
        progress_callback: fn(stage, detail)
    
    Returns:
        输出文件路径，失败返回None
    """
    try:
        from pydub import AudioSegment
    except ImportError:
        print("[Mix] 缺少 pydub，请运行: pip install pydub")
        return None

    # 构建 tts 查找索引：用 script 全局行号（1-based）→ 文件路径
    # 与 doubao_tts.generate_episode_tts 的命名规则完全一致
    tts_index = {}
    for global_idx, item in enumerate(script, 1):
        if item["type"] == "tts":
            safe_speaker = _sanitize_filename(item["speaker"])
            key = f"{global_idx:03d}_{safe_speaker}"
            if key in tts_file_map:
                tts_index[global_idx] = tts_file_map[key]

    timeline   = []
    cursor_ms  = 0
    active_bgm = None

    for global_idx, item in enumerate(script, 1):
        t = item["type"]

        if t == "bgm":
            action = item.get("action", "stop")
            if action == "stop":
                if active_bgm:
                    dur = cursor_ms - active_bgm["start_ms"]
                    if dur > 0:
                        bgm_seg = _loop_bgm(_load_audio(active_bgm["path"]) + BGM_VOLUME,
                                            dur + BGM_FADE_OUT)
                        fade_ms = min(dur, BGM_FADE_OUT)
                        timeline.append({
                            "seg":      bgm_seg[:dur].fade_out(fade_ms),
                            "start_ms": active_bgm["start_ms"],
                        })
                    active_bgm = None
            else:
                name = item.get("name", "")
                if name in bgm_file_map:
                    if active_bgm:
                        dur = cursor_ms - active_bgm["start_ms"]
                        if dur > 0:
                            bgm_seg = _loop_bgm(_load_audio(active_bgm["path"]) + BGM_VOLUME,
                                                dur + BGM_FADE_OUT)
                            fade_ms = min(dur, BGM_FADE_OUT)
                            timeline.append({
                                "seg":      bgm_seg[:dur].fade_out(fade_ms),
                                "start_ms": active_bgm["start_ms"],
                            })
                    active_bgm = {
                        "name":     name,
                        "path":     bgm_file_map[name],
                        "start_ms": cursor_ms,
                    }

        elif t == "sfx":
            name = item.get("name", "")
            if name in sfx_file_map:
                sfx_seg = (_load_audio(sfx_file_map[name]) + SFX_VOLUME)
                sfx_seg = sfx_seg[:SFX_MAX_MS].fade_out(SFX_FADE_OUT)
                timeline.append({"seg": sfx_seg, "start_ms": cursor_ms})

        elif t == "tts":
            tts_path = tts_index.get(global_idx)
            if tts_path and os.path.exists(tts_path):
                seg = _load_audio(tts_path)
                timeline.append({"seg": seg, "start_ms": cursor_ms})
                cursor_ms += len(seg)

    # 收尾：结束最后一段 BGM
    if active_bgm:
        dur = cursor_ms - active_bgm["start_ms"]
        if dur > 0:
            bgm_seg = _loop_bgm(_load_audio(active_bgm["path"]) + BGM_VOLUME,
                                dur + BGM_FADE_OUT)
            fade_ms = min(dur, BGM_FADE_OUT)
            timeline.append({
                "seg":      bgm_seg[:dur].fade_out(fade_ms),
                "start_ms": active_bgm["start_ms"],
            })

    if not timeline:
        print("[Mix] 没有可合并的音频")
        return None

    if progress_callback:
        progress_callback("mix", f"叠加 {len(timeline)} 条音轨...")

    total_ms = max(item["start_ms"] + len(item["seg"]) for item in timeline)
    master   = AudioSegment.silent(duration=total_ms)
    for item in timeline:
        master = master.overlay(item["seg"], position=item["start_ms"])

    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    master.export(output_path, format="mp3", bitrate="128k")

    total_sec        = len(master) / 1000
    minutes, seconds = divmod(int(total_sec), 60)
    size_kb          = os.path.getsize(output_path) // 1024
    print(f"[Mix] Done! 时长: {minutes}分{seconds}秒，大小: {size_kb}KB")
    print(f"[Mix] 输出: {output_path}")

    return output_path
