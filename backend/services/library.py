"""
本地 BGM / 音效素材库管理

维护 assets/library.json，记录所有已生成的资产，
并通过 LLM 语义匹配避免重复生成风格相似的素材。

库文件结构：
{
  "bgm": {
    "热闹酒馆": {
      "file": "热闹酒馆.mp3",
      "prompt": "Romance of the Three Kingdoms, lively ancient Chinese tavern...",
      "added": "2026-05-13 12:00"
    }
  },
  "sfx": {
    "战马嘶鸣": { "file": "战马嘶鸣.mp3", "prompt": "...", "added": "..." }
  }
}
"""

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

import config

# 库文件放在 assets/ 目录（bgm/ 和 sfx/ 的上一级）
_LIBRARY_PATH = Path(config.BGM_DIR).parent / "library.json"
_lock = threading.Lock()


# ── 内部读写 ─────────────────────────────────────────────────────────────────

def _load() -> dict:
    if _LIBRARY_PATH.exists():
        try:
            return json.loads(_LIBRARY_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[Library] 读取失败，重置: {e}", flush=True)
    return {"bgm": {}, "sfx": {}}


def _save(lib: dict) -> None:
    _LIBRARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(_LIBRARY_PATH) + ".tmp"
    Path(tmp).write_text(
        json.dumps(lib, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.replace(tmp, _LIBRARY_PATH)


# ── 公开接口 ─────────────────────────────────────────────────────────────────

def get_library() -> dict:
    """返回当前库，自动剔除文件已不存在的条目。"""
    with _lock:
        lib = _load()
        changed = False
        for asset_type, asset_dir in [("bgm", config.BGM_DIR), ("sfx", config.SFX_DIR)]:
            for name in list(lib.get(asset_type, {}).keys()):
                fp = os.path.join(asset_dir, lib[asset_type][name]["file"])
                if not os.path.exists(fp):
                    del lib[asset_type][name]
                    changed = True
        if changed:
            _save(lib)
        return lib


def add_entry(asset_type: str, name: str, prompt: str, file_path: str) -> None:
    """将新生成的资产登记到库。asset_type = 'bgm' | 'sfx'"""
    with _lock:
        lib = _load()
        lib.setdefault(asset_type, {})[name] = {
            "file":   os.path.basename(file_path),
            "prompt": prompt,
            "added":  datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        _save(lib)
    print(f"[Library] 已入库 {asset_type}: {name}", flush=True)


def sync_from_disk() -> None:
    """
    扫描 assets/bgm/ 和 assets/sfx/ 目录，
    将尚未入库的文件以文件名（去扩展名）作为 name 补录（prompt 留空）。
    适合首次使用时将已有文件纳入库管理。
    """
    with _lock:
        lib = _load()
        for asset_type, asset_dir in [("bgm", config.BGM_DIR), ("sfx", config.SFX_DIR)]:
            section = lib.setdefault(asset_type, {})
            for fname in os.listdir(asset_dir):
                if not fname.lower().endswith(".mp3"):
                    continue
                name = os.path.splitext(fname)[0]
                if name not in section:
                    section[name] = {
                        "file":   fname,
                        "prompt": "",
                        "added":  "unknown",
                    }
        _save(lib)


def find_matches(
    needed: dict[str, str],
    asset_type: str,
) -> dict[str, Optional[str]]:
    """
    语义匹配：在现有库中为每个 needed 资产找最合适的现有文件。

    Args:
        needed:     {名称: 英文提示词}
        asset_type: 'bgm' | 'sfx'

    Returns:
        {名称: 匹配到的本地文件路径 | None}
        None 表示库中无合适素材，需要新生成。
    """
    lib = get_library()
    existing = lib.get(asset_type, {})
    asset_dir = config.BGM_DIR if asset_type == "bgm" else config.SFX_DIR

    # 库为空，直接全部新生成
    if not existing:
        return {name: None for name in needed}

    type_label = "BGM背景音乐" if asset_type == "bgm" else "音效"

    library_lines = "\n".join(
        f'  "{n}": {entry.get("prompt", "（无描述）")[:120]}'
        for n, entry in existing.items()
    )
    needed_lines = "\n".join(
        f'  "{n}": {p}' for n, p in needed.items()
    )

    prompt = f"""你是一个音频剧{type_label}素材库管理员。

当前素材库（名称: 提示词描述）：
{library_lines}

本次需要的{type_label}（名称: 提示词描述）：
{needed_lines}

任务：判断每个「需要的」素材，能否用库中现有素材替代。
替代标准：情绪基调、使用场景、整体风格高度相似即可，不要求完全相同。
宁可新生成，也不要将差距较大的素材硬凑。

输出 JSON，格式：{{"需要的名称": "库中名称或null"}}
- 若有合适的库中素材：填写库中的名称（必须与库中名称完全一致）
- 若没有合适的：填 null
只输出 JSON，不要有任何解释。"""

    from services.claude_service import call_llm_text
    try:
        raw = call_llm_text(prompt, max_tokens=512)
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("no JSON found")
        mapping: dict = json.loads(raw[start:end])
    except Exception as e:
        print(f"[Library] LLM 匹配失败，全部新生成: {e}", flush=True)
        return {name: None for name in needed}

    result: dict[str, Optional[str]] = {}
    for name in needed:
        matched_name = mapping.get(name)
        if matched_name and matched_name in existing:
            fp = os.path.join(asset_dir, existing[matched_name]["file"])
            if os.path.exists(fp):
                result[name] = fp
                print(f"[Library] '{name}' -> 复用库中 '{matched_name}'", flush=True)
                continue
        result[name] = None

    return result
