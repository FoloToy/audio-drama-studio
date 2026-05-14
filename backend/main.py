"""
音频剧自动化生产系统 - Flask 后端入口
"""

import sys

# Windows 默认 GBK 终端无法打印 emoji；强制 UTF-8（未知字符替换为 ? 而非崩溃）
# 必须在所有其他 import / print 之前执行
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import os
import uuid
import json
import queue
import threading
from pathlib import Path
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from dotenv import set_key

from config import OUTPUT_DIR
from services.claude_service  import rewrite_script, generate_media_prompts, build_rewrite_prompt, _extract_json
from services.doubao_tts      import generate_episode_tts
from services.elevenlabs_sfx  import generate_all_sfx
from services.suno_bgm        import generate_all_bgm
from services.mixer           import mix_episode
from services                 import library as asset_library
from services                 import voice_library

ENV_FILE = Path(__file__).parent / ".env"
PROMPTS_DIR = Path(__file__).parent / "prompts"

# 风格 ID → prompt 文件名（仅内置可编辑风格）
STYLE_PROMPT_FILES = {
    "sunjingxiu": "script_rewrite_sunjingxiu.txt",
    "blog":       "script_rewrite_blog.txt",
}

# 可通过设置页面修改的配置项
SETTINGS_KEYS = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_BASE",
    "CLAUDE_MODEL",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "MINIMAX_API_KEY",
    "MINIMAX_GROUP_ID",
    "DOUBAO_API_KEY",
    "ELEVENLABS_API_KEY",
    "SUNO_API_URL",
]

app = Flask(__name__)
CORS(app)

# 全局任务进度队列：{task_id: queue.Queue}
_task_queues: dict[str, queue.Queue] = {}


# ─────────────────────────────────────────────
# 风格 prompt：读取 / 保存
# ─────────────────────────────────────────────

@app.route("/api/styles/<style_id>", methods=["GET"])
def api_get_style(style_id: str):
    filename = STYLE_PROMPT_FILES.get(style_id)
    if not filename:
        return jsonify({"error": "未知风格"}), 404
    path = PROMPTS_DIR / filename
    if not path.exists():
        return jsonify({"error": "文件不存在"}), 404
    return jsonify({"style": style_id, "content": path.read_text(encoding="utf-8")})


@app.route("/api/styles/<style_id>", methods=["POST"])
def api_save_style(style_id: str):
    data = request.get_json(silent=True)
    if not data or "content" not in data:
        return jsonify({"error": "content 不能为空"}), 400
    filename = STYLE_PROMPT_FILES.get(style_id)
    if not filename:
        return jsonify({"error": "未知风格"}), 404
    (PROMPTS_DIR / filename).write_text(data["content"], encoding="utf-8")
    return jsonify({"success": True})


# ─────────────────────────────────────────────
# Step 2：改写剧本 + 识别角色
# ─────────────────────────────────────────────

@app.route("/api/rewrite-script", methods=["POST"])
def api_rewrite_script():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "请求体必须是 JSON"}), 400
    story_name    = data.get("story_name", "").strip()
    episode_name  = data.get("episode_name", "").strip()
    raw_text      = data.get("raw_text", "").strip()
    style         = data.get("style", "sunjingxiu")
    custom_prompt = data.get("custom_prompt", "")

    if not story_name or not raw_text:
        return jsonify({"error": "story_name 和 raw_text 不能为空"}), 400

    try:
        result = rewrite_script(story_name, episode_name, raw_text,
                                style=style, custom_prompt=custom_prompt)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# Step 2b：流式改写剧本（SSE token 推送）
# ─────────────────────────────────────────────

@app.route("/api/rewrite-script-stream", methods=["POST"])
def api_rewrite_script_stream():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "请求体必须是 JSON"}), 400
    story_name    = data.get("story_name", "").strip()
    episode_name  = data.get("episode_name", "").strip()
    raw_text      = data.get("raw_text", "").strip()
    style         = data.get("style", "sunjingxiu")
    custom_prompt = data.get("custom_prompt", "")
    if not story_name or not raw_text:
        return jsonify({"error": "story_name 和 raw_text 不能为空"}), 400

    import services.claude_service as cs

    def generate():
        try:
            yield f"data: {json.dumps({'type': 'start'}, ensure_ascii=False)}\n\n"
            prompt = build_rewrite_prompt(story_name, episode_name, raw_text, style, custom_prompt)
            tokens = []
            for event_type, text in cs.stream_llm(prompt, system=cs._REWRITE_SYSTEM):
                if event_type == "thinking":
                    yield f"data: {json.dumps({'type': 'thinking'}, ensure_ascii=False)}\n\n"
                elif event_type == "token" and text:
                    tokens.append(text)
                    yield f"data: {json.dumps({'type': 'token', 'text': text}, ensure_ascii=False)}\n\n"
            result = _extract_json("".join(tokens))
            yield f"data: {json.dumps({'type': 'done', 'result': result}, ensure_ascii=False)}\n\n"
        except Exception as e:
            import traceback
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'traceback': traceback.format_exc()}, ensure_ascii=False)}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─────────────────────────────────────────────
# Step 5：开始生成音频（SSE 进度推送）
# ─────────────────────────────────────────────

@app.route("/api/generate-audio", methods=["POST"])
def api_generate_audio():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "请求体必须是 JSON"}), 400
    story_name   = data.get("story_name", "")
    episode_name = data.get("episode_name", "")
    script       = data.get("script", [])
    voice_map    = data.get("voice_map", {})

    if not script or not voice_map:
        return jsonify({"error": "script 和 voice_map 不能为空"}), 400

    # 可选：step 4 已生成的提示词，传入后跳过 Claude 生成提示词步骤
    sfx_prompts = data.get("sfx_prompts") or None
    bgm_prompts = data.get("bgm_prompts") or None
    # 可选：step 4 已完成库匹配，传入后跳过 step 5 重复的 find_matches 调用
    sfx_paths   = data.get("sfx_paths")   or {}   # {name: 本地文件路径}
    bgm_paths   = data.get("bgm_paths")   or {}

    task_id = str(uuid.uuid4())
    q       = queue.Queue()
    _task_queues[task_id] = q

    # 在后台线程运行完整生成流程
    threading.Thread(
        target=_run_generation,
        args=(task_id, story_name, episode_name, script, voice_map, q,
              sfx_prompts, bgm_prompts, sfx_paths, bgm_paths),
        daemon=True,
    ).start()

    return jsonify({"task_id": task_id})


@app.route("/api/progress/<task_id>")
def api_progress(task_id: str):
    """SSE 端点，实时推送生成进度"""
    q = _task_queues.get(task_id)
    if not q:
        return jsonify({"error": "任务不存在"}), 404

    def event_stream():
        while True:
            try:
                msg = q.get(timeout=60)
                yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
                if msg.get("stage") in ("done", "error"):
                    break
            except queue.Empty:
                yield f"data: {json.dumps({'stage': 'heartbeat'}, ensure_ascii=False)}\n\n"

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok"})


# ─────────────────────────────────────────────
# Step 4：生成 BGM / 音效提示词及单个生成
# ─────────────────────────────────────────────

def _re_sanitize(name: str) -> str:
    import re
    return re.sub(r'[/\\:*?"<>|]', '_', name)


@app.route("/api/media-prompts", methods=["POST"])
def api_media_prompts():
    data         = request.get_json(silent=True) or {}
    story_name   = data.get("story_name", "")
    episode_name = data.get("episode_name", "")
    sfx_list     = data.get("sfx_list", [])
    bgm_list     = data.get("bgm_list", [])
    empty = {"sfx_prompts": {}, "bgm_prompts": {},
             "sfx_status": {}, "bgm_status": {},
             "sfx_library": {}, "bgm_library": {}}
    if not sfx_list and not bgm_list:
        return jsonify(empty)
    try:
        import config as cfg

        # ── 阶段1：Claude/DeepSeek 生成英文提示词 ────────────────────
        result = generate_media_prompts(story_name, episode_name, sfx_list, bgm_list)
        sfx_prompts = result.get("sfx_prompts", {})
        bgm_prompts = result.get("bgm_prompts", {})

        # ── 阶段2：AI 语义查询本地素材库，优先复用 ──────────────────
        sfx_library: dict[str, str] = {}   # {需求名: 预览URL}
        bgm_library: dict[str, str] = {}
        sfx_paths:   dict[str, str] = {}   # {需求名: 服务器本地绝对路径}，传给 Step5 跳过重复匹配
        bgm_paths:   dict[str, str] = {}
        try:
            if sfx_prompts:
                for name, path in asset_library.find_matches(sfx_prompts, "sfx").items():
                    if path:
                        base = os.path.splitext(os.path.basename(path))[0]
                        sfx_library[name] = f"/api/preview/sfx/{base}"
                        sfx_paths[name]   = path
                        print(f"[media-prompts] SFX 库复用: {name} <- {base}", flush=True)
            if bgm_prompts:
                for name, path in asset_library.find_matches(bgm_prompts, "bgm").items():
                    if path:
                        base = os.path.splitext(os.path.basename(path))[0]
                        bgm_library[name] = f"/api/preview/bgm/{base}"
                        bgm_paths[name]   = path
                        print(f"[media-prompts] BGM 库复用: {name} <- {base}", flush=True)
        except Exception as lib_err:
            print(f"[media-prompts] 素材库匹配失败（跳过）: {lib_err}", flush=True)

        # ── 阶段3：磁盘存在性检查（非库命中的名称）────────────────
        sfx_status: dict[str, bool] = {}
        for name in sfx_list:
            if name in sfx_library:
                sfx_status[name] = True
            else:
                fp = os.path.join(cfg.SFX_DIR, f"{_re_sanitize(name)}.mp3")
                sfx_status[name] = os.path.exists(fp) and os.path.getsize(fp) > 1000

        bgm_status: dict[str, bool] = {}
        for name in bgm_list:
            if name in bgm_library:
                bgm_status[name] = True
            else:
                fp = os.path.join(cfg.BGM_DIR, f"{_re_sanitize(name)}.mp3")
                bgm_status[name] = os.path.exists(fp) and os.path.getsize(fp) > 1000

        result["sfx_library"] = sfx_library
        result["bgm_library"] = bgm_library
        result["sfx_paths"]   = sfx_paths
        result["bgm_paths"]   = bgm_paths
        result["sfx_status"]  = sfx_status
        result["bgm_status"]  = bgm_status
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate-single-sfx", methods=["POST"])
def api_generate_single_sfx():
    data   = request.get_json(silent=True) or {}
    name   = data.get("name", "").strip()
    prompt = data.get("prompt", "").strip()
    force  = data.get("force", False)
    if not name or not prompt:
        return jsonify({"error": "name 和 prompt 不能为空"}), 400
    from services.elevenlabs_sfx import generate_sfx
    import config as cfg
    if force:
        fp = os.path.join(cfg.SFX_DIR, f"{_re_sanitize(name)}.mp3")
        if os.path.exists(fp):
            os.remove(fp)
    try:
        path = generate_sfx(name, prompt)
        if path:
            return jsonify({"success": True, "preview_url": f"/api/preview/sfx/{name}"})
        return jsonify({"error": "音效生成失败，请检查 ElevenLabs API Key 配置"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate-single-bgm", methods=["POST"])
def api_generate_single_bgm():
    data   = request.get_json(silent=True) or {}
    name   = data.get("name", "").strip()
    prompt = data.get("prompt", "").strip()
    force  = data.get("force", False)
    if not name or not prompt:
        return jsonify({"error": "name 和 prompt 不能为空"}), 400
    from services.suno_bgm import generate_bgm
    import config as cfg
    if force:
        fp = os.path.join(cfg.BGM_DIR, f"{_re_sanitize(name)}.mp3")
        if os.path.exists(fp):
            os.remove(fp)
    try:
        path = generate_bgm(name, prompt)
        if path:
            return jsonify({"success": True, "preview_url": f"/api/preview/bgm/{name}"})
        return jsonify({"error": "BGM 生成失败，请检查 MiniMax / Suno API 配置"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/preview/sfx/<path:name>")
def api_preview_sfx(name: str):
    import config as cfg
    fp = os.path.join(cfg.SFX_DIR, f"{_re_sanitize(name)}.mp3")
    if not os.path.exists(fp):
        return jsonify({"error": "文件不存在"}), 404
    return send_file(fp, mimetype="audio/mpeg")


@app.route("/api/preview/bgm/<path:name>")
def api_preview_bgm(name: str):
    import config as cfg
    fp = os.path.join(cfg.BGM_DIR, f"{_re_sanitize(name)}.mp3")
    if not os.path.exists(fp):
        return jsonify({"error": "文件不存在"}), 404
    return send_file(fp, mimetype="audio/mpeg")


# ─────────────────────────────────────────────
# 素材库 API
# ─────────────────────────────────────────────

@app.route("/api/library", methods=["GET"])
def api_get_library():
    """返回本地 BGM/音效素材库（含条目数量和元数据，不含音频数据）。"""
    lib = asset_library.get_library()
    return jsonify({
        "bgm": lib.get("bgm", {}),
        "sfx": lib.get("sfx", {}),
        "bgm_count": len(lib.get("bgm", {})),
        "sfx_count": len(lib.get("sfx", {})),
    })


@app.route("/api/library/sync", methods=["POST"])
def api_sync_library():
    """扫描 assets/ 目录，将未入库的文件补录到库中。"""
    asset_library.sync_from_disk()
    lib = asset_library.get_library()
    return jsonify({
        "message": "同步完成",
        "bgm_count": len(lib.get("bgm", {})),
        "sfx_count": len(lib.get("sfx", {})),
    })


@app.route("/api/library/<asset_type>/<path:name>", methods=["DELETE"])
def api_delete_library_entry(asset_type: str, name: str):
    """从库中删除条目（不删除文件本身）。"""
    if asset_type not in ("bgm", "sfx"):
        return jsonify({"error": "asset_type 须为 bgm 或 sfx"}), 400
    from services.library import _load, _save, _lock
    with _lock:
        lib = _load()
        if name in lib.get(asset_type, {}):
            del lib[asset_type][name]
            _save(lib)
            return jsonify({"message": f"已删除 {asset_type}/{name}"})
    return jsonify({"error": "条目不存在"}), 404


# ─────────────────────────────────────────────
# 音色库 API
# ─────────────────────────────────────────────

@app.route("/api/voices", methods=["GET"])
def api_get_voices():
    """返回本地音色库列表"""
    return jsonify(voice_library.get_voices())


@app.route("/api/voices", methods=["POST"])
def api_add_voice():
    """
    添加或更新音色。
    支持 multipart/form-data（含预览音频文件）或 application/json（无预览）。
    """
    if request.content_type and "multipart" in request.content_type:
        voice_id    = (request.form.get("voice_id")    or "").strip()
        name        = (request.form.get("name")        or "").strip()
        description = (request.form.get("description") or "").strip()
        if not voice_id or not name:
            return jsonify({"error": "voice_id 和 name 不能为空"}), 400
        preview_bytes = None
        preview_ext   = "mp3"
        audio_file    = request.files.get("audio")
        if audio_file and audio_file.filename:
            preview_bytes = audio_file.read()
            ext = os.path.splitext(audio_file.filename)[1].lstrip(".")
            preview_ext = ext if ext else "mp3"
    else:
        data = request.get_json(silent=True) or {}
        voice_id    = (data.get("voice_id")    or "").strip()
        name        = (data.get("name")        or "").strip()
        description = (data.get("description") or "").strip()
        if not voice_id or not name:
            return jsonify({"error": "voice_id 和 name 不能为空"}), 400
        preview_bytes = None
        preview_ext   = "mp3"

    entry = voice_library.add_voice(voice_id, name, description, preview_bytes, preview_ext)
    return jsonify(entry)


@app.route("/api/voices/<path:voice_id>", methods=["DELETE"])
def api_delete_voice(voice_id: str):
    """从音色库删除指定音色（同时删除预览文件）"""
    ok = voice_library.delete_voice(voice_id)
    if ok:
        return jsonify({"message": f"已删除 {voice_id}"})
    return jsonify({"error": "音色不存在"}), 404


@app.route("/api/voices/<path:voice_id>/preview")
def api_voice_preview(voice_id: str):
    """流式返回音色预览音频"""
    path = voice_library.get_preview_path(voice_id)
    if not path:
        return jsonify({"error": "预览文件不存在"}), 404
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime = "audio/mpeg" if ext == "mp3" else f"audio/{ext}"
    return send_file(path, mimetype=mime)


@app.route("/api/assign-voices", methods=["POST"])
def api_assign_voices():
    """
    用 LLM 自动为角色列表匹配音色。
    请求体：{"characters": [{"name": "...", "importance": "...", "lines_count": N}, ...]}
    返回：{"voice_map": {"角色名": "voice_id"}}
    """
    data       = request.get_json(silent=True) or {}
    characters = data.get("characters", [])
    if not characters:
        return jsonify({"voice_map": {}}), 200
    try:
        voice_map = voice_library.assign_voices(characters)
        return jsonify({"voice_map": voice_map})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# 设置：读取 / 保存 API Key
# ─────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def api_get_settings():
    return jsonify({k: os.environ.get(k, "") for k in SETTINGS_KEYS})


@app.route("/api/settings", methods=["POST"])
def api_save_settings():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "请求体必须是 JSON"}), 400

    import config
    import services.claude_service as cs

    for key in SETTINGS_KEYS:
        if key in data:
            value = str(data[key]).strip()
            # 写入 .env 文件
            set_key(str(ENV_FILE), key, value)
            # 热更新当前进程环境变量和 config 模块
            os.environ[key] = value
            if hasattr(config, key):
                setattr(config, key, value)

    # 重建 Anthropic 客户端（Key / Base URL / Model 可能刚更新）
    # 用 try-except 兜底：即使 Anthropic Key 为空（DeepSeek 模式）也不影响保存成功
    try:
        cs.client = cs._make_client()
    except Exception as e:
        print(f"[Settings] Anthropic 客户端重建失败（可忽略）: {e}")

    return jsonify({"success": True})


@app.route("/api/download/<path:filename>")
def api_download(filename: str):
    file_path      = os.path.abspath(os.path.join(OUTPUT_DIR, filename))
    output_dir_abs = os.path.abspath(OUTPUT_DIR)
    # 必须以 output_dir + 分隔符开头，防止 /output 前缀被 /output2 这类路径绕过
    if not file_path.startswith(output_dir_abs + os.sep):
        return jsonify({"error": "非法路径"}), 400
    if not os.path.exists(file_path):
        return jsonify({"error": "文件不存在"}), 404
    return send_file(file_path, as_attachment=True)


# ─────────────────────────────────────────────
# 后台生成流程
# ─────────────────────────────────────────────

def _push(q: queue.Queue, **kwargs):
    q.put(kwargs)


def _run_generation(
    task_id:      str,
    story_name:   str,
    episode_name: str,
    script:       list[dict],
    voice_map:    dict[str, str],
    q:            queue.Queue,
    sfx_prompts:  dict | None = None,
    bgm_prompts:  dict | None = None,
    sfx_paths:    dict        = None,   # step 4 已匹配的库文件路径 {name: path}
    bgm_paths:    dict        = None,
):
    try:
        ep_id      = task_id[:8]
        ep_dir     = os.path.join(OUTPUT_DIR, ep_id)
        os.makedirs(ep_dir, exist_ok=True)

        sfx_list = list({
            item["name"] for item in script if item["type"] == "sfx"
        })
        bgm_list = list({
            item["name"] for item in script
            if item["type"] == "bgm" and item.get("action") == "start"
        })

        # ── 阶段1：生成音效/BGM提示词（若已在 step 4 生成则跳过）──────
        if sfx_prompts is not None and bgm_prompts is not None:
            # 使用 step 4 传入的提示词，无需再调 Claude
            _push(q, stage="prompt", status="done",
                  sfx_count=len(sfx_prompts), bgm_count=len(bgm_prompts),
                  message="使用已生成的提示词")
        elif sfx_list or bgm_list:
            _push(q, stage="prompt", status="generating",
                  message=f"正在生成 {len(sfx_list)} 个音效、{len(bgm_list)} 首BGM的提示词...")
            media_prompts = generate_media_prompts(
                story_name, episode_name, sfx_list, bgm_list
            )
            sfx_prompts = media_prompts.get("sfx_prompts", {})
            bgm_prompts = media_prompts.get("bgm_prompts", {})
            _push(q, stage="prompt", status="done",
                  sfx_count=len(sfx_prompts), bgm_count=len(bgm_prompts))
        else:
            sfx_prompts = {}
            bgm_prompts = {}
            _push(q, stage="prompt", status="done",
                  sfx_count=0, bgm_count=0, message="无需生成音效/BGM提示词")

        # ── 阶段2：音效生成 ──────────────────────────────
        # sfx_paths 由 step 4 已完成库匹配，直接复用；其余调用 ElevenLabs 生成
        sfx_file_map = {}
        if sfx_prompts:
            reused_sfx   = {n: p for n, p in (sfx_paths or {}).items()
                            if p and os.path.exists(p)}
            generate_sfx = {n: sfx_prompts[n] for n in sfx_prompts if n not in reused_sfx}

            if reused_sfx:
                _push(q, stage="sfx_library", status="done",
                      message=f"复用库中音效 {len(reused_sfx)} 个，新生成 {len(generate_sfx)} 个")

            def sfx_cb(name, status, idx, total):
                _push(q, stage="sfx", item=name, status=status,
                      progress=idx, total=total)

            new_sfx = generate_all_sfx(generate_sfx, progress_callback=sfx_cb) if generate_sfx else {}

            # 新生成的入库
            for name, path in new_sfx.items():
                asset_library.add_entry("sfx", name, sfx_prompts[name], path)

            sfx_file_map = {**reused_sfx, **new_sfx}

        # ── 阶段3：BGM 生成 ────────────────────────────
        # bgm_paths 由 step 4 已完成库匹配，直接复用；其余调用 MiniMax 生成
        bgm_file_map = {}
        if bgm_prompts:
            reused_bgm   = {n: p for n, p in (bgm_paths or {}).items()
                            if p and os.path.exists(p)}
            generate_bgm = {n: bgm_prompts[n] for n in bgm_prompts if n not in reused_bgm}

            if reused_bgm:
                _push(q, stage="bgm_library", status="done",
                      message=f"复用库中 BGM {len(reused_bgm)} 首，新生成 {len(generate_bgm)} 首")

            def bgm_cb(name, status, idx, total):
                _push(q, stage="bgm", item=name, status=status,
                      progress=idx, total=total)

            new_bgm = generate_all_bgm(generate_bgm, progress_callback=bgm_cb) if generate_bgm else {}

            # 新生成的入库
            for name, path in new_bgm.items():
                asset_library.add_entry("bgm", name, bgm_prompts[name], path)

            bgm_file_map = {**reused_bgm, **new_bgm}

        # ── 阶段4：豆包 TTS 生成台词 ───────────────────
        tts_items = [i for i in script if i["type"] == "tts"]
        _push(q, stage="tts", status="start", total=len(tts_items))

        def tts_cb(seq, speaker, status, total):
            _push(q, stage="tts", item=speaker, status=status,
                  progress=seq, total=total)

        tts_file_map = generate_episode_tts(
            script, voice_map, ep_dir, progress_callback=tts_cb
        )

        _push(q, stage="tts", status="done",
              success=len(tts_file_map), total=len(tts_items))

        # ── 阶段5：混音合成 ─────────────────────────────
        _push(q, stage="mix", status="start", message="开始混音合成...")

        output_filename = f"{ep_id}_mix.mp3"
        output_path     = os.path.join(ep_dir, output_filename)

        def mix_cb(stage, detail):
            _push(q, stage="mix", status="progress", message=detail)

        result_path = mix_episode(
            script, tts_file_map, sfx_file_map, bgm_file_map,
            output_path, progress_callback=mix_cb
        )

        if result_path:
            download_url = f"/api/download/{ep_id}/{output_filename}"
            _push(q, stage="mix",  status="done", message="混音合成完成")
            _push(q, stage="done", status="done",
                  download_url=download_url,
                  message="音频剧生成完成！")
        else:
            _push(q, stage="mix",  status="error", message="混音失败")
            _push(q, stage="error", status="error", message="混音失败")

    except Exception as e:
        import traceback
        _push(q, stage="error", status="error",
              message=str(e), traceback=traceback.format_exc())
    finally:
        # 清理队列引用
        _task_queues.pop(task_id, None)


if __name__ == "__main__":
    # 启动时将磁盘上已有的 BGM/音效文件同步进素材库
    asset_library.sync_from_disk()
    # SSE 需要 threaded=True；use_reloader=False 避免 reloader 子进程丢失队列状态
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True, use_reloader=False)
