"""
Agent 平台 API（Flask Blueprint，前缀 /api）。
对齐 PRD §4：projects / source / agent-tasks / outline / scripts / safety /
characters / voices / audio / exports。统一错误结构 {error:{code,message}}。
"""

import os
from flask import Blueprint, request, jsonify, Response, send_file

import store
import orchestrator as orch

bp = Blueprint("agent", __name__)


def err(code, message, status=400, detail=None):
    return jsonify({"error": {"code": code, "message": message, "detail": detail or {}}}), status


# ─────────────────────── 账号（开发模式：邮箱即登录，不校验密码）───────────────

@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    if not email or "@" not in email:
        return err("INVALID_INPUT", "请输入有效邮箱")
    u = store.upsert_user(email, data.get("name", ""))
    return jsonify(u)


# ─────────────────────── Projects ───────────────────────

@bp.route("/projects", methods=["GET"])
def list_projects():
    status = request.args.get("status", "")
    keyword = request.args.get("keyword", "")
    return jsonify({"projects": store.list_projects(status, keyword)})


@bp.route("/projects", methods=["POST"])
def create_project():
    data = request.get_json(silent=True) or {}
    if not data.get("title", "").strip():
        return err("INVALID_INPUT", "项目名称不能为空")
    p = store.create_project(data)
    return jsonify(p)


@bp.route("/projects/<pid>", methods=["GET"])
def get_project(pid):
    p = store.get_project(pid)
    if not p:
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    p["source"] = store.get_source(pid)
    p["analysis"] = store.get_analysis(pid)
    p["episodes"] = store.list_episodes(pid)
    p["characters"] = store.list_characters(pid)
    p["bindings"] = store.list_bindings(pid)
    p["findings"] = store.list_findings(pid)
    return jsonify(p)


@bp.route("/projects/<pid>", methods=["PATCH"])
def update_project(pid):
    if not store.get_project(pid):
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    return jsonify(store.update_project(pid, request.get_json(silent=True) or {}))


@bp.route("/projects/<pid>", methods=["DELETE"])
def delete_project(pid):
    store.delete_project(pid)
    return jsonify({"message": "已删除"})


@bp.route("/projects/<pid>/duplicate", methods=["POST"])
def duplicate_project(pid):
    p = store.duplicate_project(pid)
    if not p:
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    return jsonify(p)


# ─────────────────────── Source ───────────────────────

@bp.route("/projects/<pid>/source", methods=["POST"])
def save_source(pid):
    if not store.get_project(pid):
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    data = request.get_json(silent=True) or {}
    src = store.save_source(pid, data)
    store.update_project(pid, {"source_type": data.get("source_type", "text")})
    return jsonify(src)


@bp.route("/projects/<pid>/source-file", methods=["POST"])
def upload_source_file(pid):
    if not store.get_project(pid):
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    f = request.files.get("file")
    if not f:
        return err("INVALID_INPUT", "缺少文件")
    raw = f.read().decode("utf-8", errors="replace")
    src = store.save_source(pid, {"title": f.filename, "raw_text": raw,
                                  "selection_mode": request.form.get("selection_mode", "whole"),
                                  "chapter_range": request.form.get("chapter_range", "")})
    return jsonify(src)


@bp.route("/projects/<pid>/source-analysis", methods=["GET"])
def get_analysis(pid):
    a = store.get_analysis(pid)
    if not a:
        return err("SOURCE_NOT_FOUND", "尚无解析结果", 404)
    return jsonify(a)


# ─────────────────────── Agent Tasks ───────────────────────

VALID_TASKS = {"parse_source", "generate_outline", "generate_script", "safety_review",
               "identify_characters", "recommend_voices", "generate_audio",
               "remix_episode", "export_project",
               "generate_avatar", "generate_cover", "publish_device"}


@bp.route("/agent-tasks", methods=["POST"])
def create_task():
    data = request.get_json(silent=True) or {}
    tt = data.get("task_type")
    if tt not in VALID_TASKS:
        return err("INVALID_INPUT", f"未知任务类型 {tt}")
    task = orch.submit(tt, project_id=data.get("project_id"),
                       episode_id=data.get("episode_id"),
                       input_data=data.get("input", {}))
    return jsonify({"task_id": task["task_id"], "status": task["status"]})


@bp.route("/agent-tasks/<tid>", methods=["GET"])
def get_task(tid):
    t = store.get_task(tid)
    if not t:
        return err("TASK_NOT_FOUND", "任务不存在", 404)
    return jsonify(t)


@bp.route("/agent-tasks/<tid>/stream")
def stream_task(tid):
    if not store.get_task(tid):
        return err("TASK_NOT_FOUND", "任务不存在", 404)
    return Response(orch.sse_stream(tid), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@bp.route("/agent-tasks/<tid>/cancel", methods=["POST"])
def cancel_task(tid):
    orch.cancel(tid)
    return jsonify({"message": "已取消"})


@bp.route("/agent-tasks", methods=["GET"])
def list_tasks():
    return jsonify({"tasks": store.list_tasks(request.args.get("project_id"))})


# ─────────────────────── Outline ───────────────────────

@bp.route("/projects/<pid>/outline", methods=["GET"])
def get_outline(pid):
    return jsonify({"episodes": store.list_episodes(pid)})


@bp.route("/projects/<pid>/outline", methods=["PUT"])
def save_outline(pid):
    data = request.get_json(silent=True) or {}
    for ep in data.get("episodes", []):
        if ep.get("episode_id"):
            store.set_episode_fields(ep["episode_id"], ep)
        else:
            store.upsert_episode(pid, ep)
    return jsonify({"episodes": store.list_episodes(pid)})


@bp.route("/projects/<pid>/outline/approve", methods=["POST"])
def approve_outline(pid):
    project = store.get_project(pid)
    episodes = store.list_episodes(pid)
    # 门禁校验
    if any(e["risk_level"] in ("high", "blocked") for e in episodes):
        return err("SAFETY_RISK_BLOCKED", "存在高风险分集，请先处理")
    if len(episodes) != project["episode_count"]:
        return err("INVALID_PROJECT_STATUS",
                   f"集数应为 {project['episode_count']}，当前 {len(episodes)}")
    if any(not e["title"] or not e["summary"] for e in episodes):
        return err("INVALID_INPUT", "存在空标题或空摘要")
    for e in episodes:
        store.set_episode_fields(e["episode_id"], {"status": "outline_approved"})
    store.set_project_status(pid, "outline_approved")
    return jsonify({"status": "outline_approved"})


# ─────────────────────── Scripts ───────────────────────

@bp.route("/episodes/<eid>/script", methods=["GET"])
def get_script(eid):
    return jsonify({"episode": store.get_episode(eid), "blocks": store.list_blocks(eid)})


@bp.route("/episodes/<eid>/script", methods=["PUT"])
def save_script(eid):
    data = request.get_json(silent=True) or {}
    blocks = data.get("script_blocks") or data.get("blocks") or []
    # 逐块更新（保留 id），若整体替换则用 replace
    if data.get("replace"):
        store.replace_script_blocks(eid, blocks)
    else:
        for b in blocks:
            if b.get("block_id"):
                store.update_block(b["block_id"], b)
    return jsonify({"blocks": store.list_blocks(eid)})


@bp.route("/script-blocks/<bid>/rewrite", methods=["POST"])
def rewrite_block(bid):
    from llm_router import call_llm_text
    block = store.get_block(bid)
    if not block:
        return err("TASK_NOT_FOUND", "剧本块不存在", 404)
    data = request.get_json(silent=True) or {}
    instruction = data.get("rewrite_instruction", "换一种说法")
    preserve = data.get("preserve_meaning", True)
    prompt = f"""请改写下面这句儿童音频剧台词。
改写要求：{instruction}
{'保留原意，只换表达方式。' if preserve else ''}
只输出改写后的台词文本，不要引号、不要解释。

原台词：{block['text']}"""
    try:
        new_text = call_llm_text(prompt, max_tokens=512).strip().strip('"').strip("「」")
    except Exception:
        new_text = block["text"]
    store.update_block(bid, {"text": new_text, "audio_status": "stale"})
    return jsonify({"block": store.get_block(bid)})


@bp.route("/episodes/<eid>/script/approve", methods=["POST"])
def approve_script(eid):
    ep = store.get_episode(eid)
    if not ep:
        return err("PROJECT_NOT_FOUND", "分集不存在", 404)
    # 门禁：高风险未处理
    findings = store.list_findings(ep["project_id"], eid)
    if any(f["risk_level"] in ("high", "blocked") and not f["resolved"] for f in findings):
        return err("SAFETY_RISK_BLOCKED", "存在未处理的高风险内容，不能通过审核")
    for b in store.list_blocks(eid):
        store.update_block(b["block_id"], {"review_status": "approved"})
    store.set_episode_fields(eid, {"status": "script_approved", "review_status": "approved"})
    # 状态聚合：全部分集都已审核 → 项目 script_approved；否则保持 script_review
    all_eps = store.list_episodes(ep["project_id"])
    if all(e["review_status"] == "approved" for e in all_eps):
        store.set_project_status(ep["project_id"], "script_approved")
    else:
        store.set_project_status(ep["project_id"], "script_review")
    approved = sum(1 for e in all_eps if e["review_status"] == "approved")
    return jsonify({"status": "script_approved", "approved_episodes": approved,
                    "total_episodes": len(all_eps)})


# ─────────────────────── Safety ───────────────────────

@bp.route("/safety/rewrite", methods=["POST"])
def safety_rewrite():
    from llm_router import call_llm_text
    data = request.get_json(silent=True) or {}
    original = data.get("original_text", "")
    goal = data.get("rewrite_goal", "弱化风险，使其适合儿童")
    prompt = f"请把下面内容改写得适合儿童，目标：{goal}。只输出改写后的文本。\n\n{original}"
    try:
        new_text = call_llm_text(prompt, max_tokens=512).strip()
    except Exception:
        new_text = original
    fid = data.get("finding_id")
    if fid:
        store.resolve_finding(fid)
    bid = data.get("block_id")
    if bid:
        store.update_block(bid, {"text": new_text, "audio_status": "stale"})
    return jsonify({"rewritten_text": new_text})


@bp.route("/safety/findings/<fid>/resolve", methods=["POST"])
def resolve_finding(fid):
    store.resolve_finding(fid)
    return jsonify({"message": "已标记处理"})


# ─────────────────────── Characters ───────────────────────

@bp.route("/projects/<pid>/characters", methods=["GET"])
def list_characters(pid):
    return jsonify({"characters": store.list_characters(pid)})


@bp.route("/characters/<cid>", methods=["PATCH"])
def update_character(cid):
    store.update_character(cid, request.get_json(silent=True) or {})
    return jsonify({"message": "ok"})


@bp.route("/characters/<cid>/lock", methods=["POST"])
def lock_character(cid):
    store.update_character(cid, {"locked": True})
    return jsonify({"message": "已锁定"})


# ─────────────────────── Voices ───────────────────────

@bp.route("/agent/voices", methods=["GET"])
def list_voices():
    return jsonify({"voices": store.list_voices()})


@bp.route("/projects/<pid>/voice-bindings", methods=["GET"])
def get_bindings(pid):
    return jsonify({"bindings": store.list_bindings(pid)})


@bp.route("/projects/<pid>/voice-bindings", methods=["POST"])
def set_bindings(pid):
    data = request.get_json(silent=True) or {}
    bindings = data.get("bindings", [])
    # 校验：声音授权可用
    for b in bindings:
        v = store.get_voice(b.get("voice_id", ""))
        if not v:
            return err("VOICE_NOT_AUTHORIZED", f"声音 {b.get('voice_id')} 不可用")
    store.set_bindings(pid, bindings)
    return jsonify({"bindings": store.list_bindings(pid)})


@bp.route("/projects/<pid>/voices/confirm", methods=["POST"])
def confirm_voices(pid):
    chars = store.list_characters(pid)
    bound = {b["character_id"] for b in store.list_bindings(pid)}
    missing = [c["name"] for c in chars if c["character_id"] not in bound]
    if missing:
        return err("VOICE_NOT_BOUND", f"以下角色未绑定声音：{', '.join(missing)}")
    store.set_project_status(pid, "voice_confirmed")
    return jsonify({"status": "voice_confirmed"})


# ─────────────────────── Audio & Exports ───────────────────────

@bp.route("/episodes/<eid>/audio", methods=["GET"])
def get_audio(eid):
    return jsonify({"final": store.get_final_audio(eid), "episode": store.get_episode(eid)})


@bp.route("/agent/audio-file/<path:subpath>")
def audio_file(subpath):
    import config as cfg
    fp = os.path.abspath(os.path.join(cfg.OUTPUT_DIR, subpath))
    base = os.path.abspath(cfg.OUTPUT_DIR)
    if not fp.startswith(base + os.sep) or not os.path.exists(fp):
        return err("SOURCE_NOT_FOUND", "文件不存在", 404)
    return send_file(fp, mimetype="audio/mpeg")


@bp.route("/voices/<path:voice_id>/preview")
def voice_preview(voice_id):
    from services import voice_library
    path = voice_library.get_preview_path(voice_id)
    if not path:
        return err("SOURCE_NOT_FOUND", "预览不存在", 404)
    return send_file(path, mimetype="audio/mpeg")


@bp.route("/projects/<pid>/exports", methods=["GET"])
def list_exports(pid):
    return jsonify({"exports": store.list_exports(pid)})


@bp.route("/episodes/<eid>/blocks/<bid>/regenerate", methods=["POST"])
def regenerate_block(eid, bid):
    """单句重生成：删除该块旧 TTS 文件 → 重新生成整集音频（复用其余片段）。"""
    import os as _os, re as _re
    import config as cfg
    ep = store.get_episode(eid)
    if not ep:
        return err("PROJECT_NOT_FOUND", "分集不存在", 404)
    blocks = store.list_blocks(eid)
    idx = next((i for i, b in enumerate(blocks) if b["block_id"] == bid), None)
    if idx is None:
        return err("TASK_NOT_FOUND", "剧本块不存在", 404)
    b = blocks[idx]
    if b["type"] in ("narration", "dialogue"):
        speaker = _re.sub(r'[/\\:*?"<>|]', '_', b.get("character_name", ""))
        fname = f"{idx + 1:03d}_{speaker}.mp3"
        fp = _os.path.join(cfg.OUTPUT_DIR, eid[:10], fname)
        if _os.path.exists(fp):
            _os.remove(fp)
        store.update_block(bid, {"audio_status": "generating"})
    task = orch.submit("generate_audio", project_id=ep["project_id"], episode_id=eid,
                       input_data={"generation_options": {"include_sfx": False, "include_bgm": False}})
    return jsonify({"task_id": task["task_id"]})


# ─────────────────────── Outline 编辑操作 ───────────────────────

@bp.route("/projects/<pid>/outline/episode", methods=["POST"])
def add_episode(pid):
    """新增一集。"""
    eps = store.list_episodes(pid)
    ep = store.upsert_episode(pid, {
        "episode_number": len(eps) + 1, "title": "新增一集", "summary": "",
        "hook": "", "main_conflict": "", "risk_level": "low",
        "estimated_duration_minutes": store.get_project(pid)["episode_duration_minutes"]})
    return jsonify(ep)


@bp.route("/episodes/<eid>", methods=["DELETE"])
def delete_episode(eid):
    store._exec("DELETE FROM script_blocks WHERE episode_id=?", (eid,))
    store._exec("DELETE FROM episodes WHERE episode_id=?", (eid,))
    return jsonify({"message": "已删除"})


@bp.route("/episodes/<eid>", methods=["PATCH"])
def patch_episode(eid):
    store.set_episode_fields(eid, request.get_json(silent=True) or {})
    return jsonify(store.get_episode(eid))


# ─────────────────────── 管理后台：声音库 ───────────────────────

@bp.route("/admin/voices", methods=["GET"])
def admin_list_voices():
    return jsonify({"voices": store.list_all_voices()})


@bp.route("/admin/voices", methods=["POST"])
def admin_upsert_voice():
    return jsonify(store.upsert_voice(request.get_json(silent=True) or {}))


@bp.route("/admin/voices/<path:vid>", methods=["PATCH"])
def admin_patch_voice(vid):
    data = request.get_json(silent=True) or {}
    data["voice_id"] = vid
    cur = store.get_voice(vid) or {}
    cur.update(data)
    return jsonify(store.upsert_voice(cur))


@bp.route("/admin/voices/<path:vid>", methods=["DELETE"])
def admin_delete_voice(vid):
    store.delete_voice(vid)
    return jsonify({"message": "已删除"})


# ─────────────────────── 管理后台：风格模板 ───────────────────────

@bp.route("/admin/styles", methods=["GET"])
def admin_list_styles():
    return jsonify({"styles": store.list_styles()})


@bp.route("/admin/styles", methods=["POST"])
def admin_upsert_style():
    return jsonify(store.upsert_style(request.get_json(silent=True) or {}))


@bp.route("/admin/styles/<path:sid>", methods=["DELETE"])
def admin_delete_style(sid):
    store.delete_style(sid)
    return jsonify({"message": "已删除"})


# ─────────────────────── 管理后台：安全规则 ───────────────────────

@bp.route("/admin/safety-rules", methods=["GET"])
def admin_list_rules():
    return jsonify({"rules": store.list_safety_rules()})


@bp.route("/admin/safety-rules", methods=["POST"])
def admin_upsert_rule():
    return jsonify(store.upsert_safety_rule(request.get_json(silent=True) or {}))


@bp.route("/admin/safety-rules/<path:rid>", methods=["DELETE"])
def admin_delete_rule(rid):
    store.delete_safety_rule(rid)
    return jsonify({"message": "已删除"})


# ─────────────────────── 素材库 / 任务中心 ───────────────────────

@bp.route("/materials", methods=["GET"])
def list_materials():
    return jsonify({"materials": store.list_all_sources()})


@bp.route("/admin/tasks", methods=["GET"])
def admin_list_tasks():
    return jsonify({"tasks": store.list_tasks(request.args.get("project_id"), limit=100)})


# ─────────────────────── 供应商（D-2）───────────────────────

@bp.route("/providers", methods=["GET"])
def get_providers():
    import providers as prov
    return jsonify(prov.list_providers())


@bp.route("/providers/defaults", methods=["POST"])
def set_provider_defaults():
    """{"llm": "deepseek", "tts": "doubao", ...} 只更新传入的能力。"""
    import providers as prov
    data = request.get_json(silent=True) or {}
    for cap in prov.CAPABILITIES:
        if cap in data:
            try:
                prov.set_default(cap, data[cap])
            except ValueError as e:
                return err("INVALID_INPUT", str(e))
    return jsonify(prov.list_providers())


# ─────────────────────── 图片（D-3）───────────────────────

@bp.route("/images/<path:fname>")
def serve_image(fname):
    import config as cfg
    fp = os.path.abspath(os.path.join(cfg.IMAGES_DIR, fname))
    base = os.path.abspath(cfg.IMAGES_DIR)
    if not fp.startswith(base + os.sep) or not os.path.exists(fp):
        return err("SOURCE_NOT_FOUND", "图片不存在", 404)
    return send_file(fp, mimetype="image/png")


# ─────────────────────── 发布记录（D-1）───────────────────────

@bp.route("/projects/<pid>/publish-records", methods=["GET"])
def list_publish_records(pid):
    return jsonify({"records": store.list_publish_records(pid)})


# ─────────────────────── 我的资源（跨项目生成资产聚合）───────────────────────

@bp.route("/my-resources", methods=["GET"])
def my_resources():
    import config as cfg
    images = []
    if os.path.isdir(cfg.IMAGES_DIR):
        files = [f for f in os.listdir(cfg.IMAGES_DIR) if f.endswith(".png")]
        files.sort(key=lambda f: os.path.getmtime(os.path.join(cfg.IMAGES_DIR, f)), reverse=True)
        for f in files[:60]:
            fp = os.path.join(cfg.IMAGES_DIR, f)
            images.append({"url": f"/api/images/{f}", "size": os.path.getsize(fp)})
    return jsonify({
        "images": images,
        "finals": store.list_all_finals(),
        "exports": store.list_all_exports(),
        "publishes": store.list_all_publishes(),
    })
