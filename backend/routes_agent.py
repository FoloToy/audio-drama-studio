"""
Agent 平台 API（FastAPI APIRouter，前缀 /api 由 main.py include 时添加）。
对齐 PRD §4 + V2.1：projects / source / agent-tasks / outline / scripts / safety /
characters / voices / audio / exports / admin / providers / images / publish / 账号。
统一错误结构 {error:{code,message,detail}}。

端点默认使用同步 def —— FastAPI 会放入线程池执行，避免 LLM/TTS 等
同步阻塞调用卡住事件循环；SSE 用 StreamingResponse 包装同步生成器。
"""

import os
import json

from fastapi import APIRouter, Body, File, Form, UploadFile
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse

import store
import orchestrator as orch

router = APIRouter()


def err(code, message, status=400, detail=None):
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message, "detail": detail or {}}})


# ─────────────────────── 账号（开发模式：邮箱即登录）───────────────────

@router.post("/login")
def login(data: dict = Body(default={})):
    email = (data.get("email") or "").strip()
    if not email or "@" not in email:
        return err("INVALID_INPUT", "请输入有效邮箱")
    return store.upsert_user(email, data.get("name", ""))


# ─────────────────────── Projects ───────────────────────

@router.get("/projects")
def list_projects(status: str = "", keyword: str = ""):
    return {"projects": store.list_projects(status, keyword)}


@router.post("/projects")
def create_project(data: dict = Body(default={})):
    if not (data.get("title") or "").strip():
        return err("INVALID_INPUT", "项目名称不能为空")
    return store.create_project(data)


@router.get("/projects/{pid}")
def get_project(pid: str):
    p = store.get_project(pid)
    if not p:
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    p["source"] = store.get_source(pid)
    p["analysis"] = store.get_analysis(pid)
    p["episodes"] = store.list_episodes(pid)
    p["characters"] = store.list_characters(pid)
    p["bindings"] = store.list_bindings(pid)
    p["findings"] = store.list_findings(pid)
    return p


@router.patch("/projects/{pid}")
def update_project(pid: str, data: dict = Body(default={})):
    if not store.get_project(pid):
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    return store.update_project(pid, data)


@router.delete("/projects/{pid}")
def delete_project(pid: str):
    store.delete_project(pid)
    return {"message": "已删除"}


@router.post("/projects/{pid}/duplicate")
def duplicate_project(pid: str):
    p = store.duplicate_project(pid)
    if not p:
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    return p


# ─────────────────────── Source ───────────────────────

@router.post("/projects/{pid}/source")
def save_source(pid: str, data: dict = Body(default={})):
    if not store.get_project(pid):
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    src = store.save_source(pid, data)
    store.update_project(pid, {"source_type": data.get("source_type", "text")})
    return src


@router.post("/projects/{pid}/source-file")
def upload_source_file(pid: str, file: UploadFile = File(...),
                       selection_mode: str = Form("whole"), chapter_range: str = Form("")):
    if not store.get_project(pid):
        return err("PROJECT_NOT_FOUND", "项目不存在", 404)
    raw = file.file.read().decode("utf-8", errors="replace")
    return store.save_source(pid, {"title": file.filename, "raw_text": raw,
                                   "selection_mode": selection_mode,
                                   "chapter_range": chapter_range})


@router.get("/projects/{pid}/source-analysis")
def get_analysis(pid: str):
    a = store.get_analysis(pid)
    if not a:
        return err("SOURCE_NOT_FOUND", "尚无解析结果", 404)
    return a


# ─────────────────────── Agent Tasks ───────────────────────

VALID_TASKS = {"parse_source", "generate_outline", "generate_script", "safety_review",
               "identify_characters", "recommend_voices", "generate_audio",
               "remix_episode", "export_project",
               "generate_avatar", "generate_cover", "publish_device"}


@router.post("/agent-tasks")
def create_task(data: dict = Body(default={})):
    tt = data.get("task_type")
    if tt not in VALID_TASKS:
        return err("INVALID_INPUT", f"未知任务类型 {tt}")
    task = orch.submit(tt, project_id=data.get("project_id"),
                       episode_id=data.get("episode_id"),
                       input_data=data.get("input", {}))
    return {"task_id": task["task_id"], "status": task["status"]}


@router.get("/agent-tasks")
def list_tasks(project_id: str = None):
    return {"tasks": store.list_tasks(project_id)}


@router.get("/agent-tasks/{tid}")
def get_task(tid: str):
    t = store.get_task(tid)
    if not t:
        return err("TASK_NOT_FOUND", "任务不存在", 404)
    return t


@router.get("/agent-tasks/{tid}/stream")
def stream_task(tid: str):
    if not store.get_task(tid):
        return err("TASK_NOT_FOUND", "任务不存在", 404)
    return StreamingResponse(orch.sse_stream(tid), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/agent-tasks/{tid}/cancel")
def cancel_task(tid: str):
    orch.cancel(tid)
    return {"message": "已取消"}


# ─────────────────────── Outline ───────────────────────

@router.get("/projects/{pid}/outline")
def get_outline(pid: str):
    return {"episodes": store.list_episodes(pid)}


@router.put("/projects/{pid}/outline")
def save_outline(pid: str, data: dict = Body(default={})):
    for ep in data.get("episodes", []):
        if ep.get("episode_id"):
            store.set_episode_fields(ep["episode_id"], ep)
        else:
            store.upsert_episode(pid, ep)
    return {"episodes": store.list_episodes(pid)}


@router.post("/projects/{pid}/outline/approve")
def approve_outline(pid: str):
    project = store.get_project(pid)
    episodes = store.list_episodes(pid)
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
    return {"status": "outline_approved"}


@router.post("/projects/{pid}/outline/episode")
def add_episode(pid: str):
    eps = store.list_episodes(pid)
    return store.upsert_episode(pid, {
        "episode_number": len(eps) + 1, "title": "新增一集", "summary": "",
        "hook": "", "main_conflict": "", "risk_level": "low",
        "estimated_duration_minutes": store.get_project(pid)["episode_duration_minutes"]})


@router.delete("/episodes/{eid}")
def delete_episode(eid: str):
    store._exec("DELETE FROM script_blocks WHERE episode_id=?", (eid,))
    store._exec("DELETE FROM episodes WHERE episode_id=?", (eid,))
    return {"message": "已删除"}


@router.patch("/episodes/{eid}")
def patch_episode(eid: str, data: dict = Body(default={})):
    store.set_episode_fields(eid, data)
    return store.get_episode(eid)


# ─────────────────────── Scripts ───────────────────────

@router.get("/episodes/{eid}/script")
def get_script(eid: str):
    return {"episode": store.get_episode(eid), "blocks": store.list_blocks(eid)}


@router.put("/episodes/{eid}/script")
def save_script(eid: str, data: dict = Body(default={})):
    blocks = data.get("script_blocks") or data.get("blocks") or []
    if data.get("replace"):
        store.replace_script_blocks(eid, blocks)
    else:
        for b in blocks:
            if b.get("block_id"):
                store.update_block(b["block_id"], b)
    return {"blocks": store.list_blocks(eid)}


@router.post("/script-blocks/{bid}/rewrite")
def rewrite_block(bid: str, data: dict = Body(default={})):
    from llm_router import call_llm_text
    block = store.get_block(bid)
    if not block:
        return err("TASK_NOT_FOUND", "剧本块不存在", 404)
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
    return {"block": store.get_block(bid)}


@router.post("/episodes/{eid}/script/approve")
def approve_script(eid: str):
    ep = store.get_episode(eid)
    if not ep:
        return err("PROJECT_NOT_FOUND", "分集不存在", 404)
    findings = store.list_findings(ep["project_id"], eid)
    if any(f["risk_level"] in ("high", "blocked") and not f["resolved"] for f in findings):
        return err("SAFETY_RISK_BLOCKED", "存在未处理的高风险内容，不能通过审核")
    for b in store.list_blocks(eid):
        store.update_block(b["block_id"], {"review_status": "approved"})
    store.set_episode_fields(eid, {"status": "script_approved", "review_status": "approved"})
    all_eps = store.list_episodes(ep["project_id"])
    if all(e["review_status"] == "approved" for e in all_eps):
        store.set_project_status(ep["project_id"], "script_approved")
    else:
        store.set_project_status(ep["project_id"], "script_review")
    approved = sum(1 for e in all_eps if e["review_status"] == "approved")
    return {"status": "script_approved", "approved_episodes": approved,
            "total_episodes": len(all_eps)}


@router.post("/episodes/{eid}/blocks/{bid}/regenerate")
def regenerate_block(eid: str, bid: str):
    import re as _re
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
        fp = os.path.join(cfg.OUTPUT_DIR, eid[:10], f"{idx + 1:03d}_{speaker}.mp3")
        if os.path.exists(fp):
            os.remove(fp)
        store.update_block(bid, {"audio_status": "generating"})
    task = orch.submit("generate_audio", project_id=ep["project_id"], episode_id=eid,
                       input_data={"generation_options": {"include_sfx": False, "include_bgm": False}})
    return {"task_id": task["task_id"]}


# ─────────────────────── Safety ───────────────────────

@router.post("/safety/rewrite")
def safety_rewrite(data: dict = Body(default={})):
    from llm_router import call_llm_text
    original = data.get("original_text", "")
    goal = data.get("rewrite_goal", "弱化风险，使其适合儿童")
    prompt = f"请把下面内容改写得适合儿童，目标：{goal}。只输出改写后的文本。\n\n{original}"
    try:
        new_text = call_llm_text(prompt, max_tokens=512).strip()
    except Exception:
        new_text = original
    if data.get("finding_id"):
        store.resolve_finding(data["finding_id"])
    if data.get("block_id"):
        store.update_block(data["block_id"], {"text": new_text, "audio_status": "stale"})
    return {"rewritten_text": new_text}


@router.post("/safety/findings/{fid}/resolve")
def resolve_finding(fid: str):
    store.resolve_finding(fid)
    return {"message": "已标记处理"}


# ─────────────────────── Characters ───────────────────────

@router.get("/projects/{pid}/characters")
def list_characters(pid: str):
    return {"characters": store.list_characters(pid)}


@router.patch("/characters/{cid}")
def update_character(cid: str, data: dict = Body(default={})):
    store.update_character(cid, data)
    return {"message": "ok"}


@router.post("/characters/{cid}/lock")
def lock_character(cid: str):
    store.update_character(cid, {"locked": True})
    return {"message": "已锁定"}


# ─────────────────────── Voices ───────────────────────

@router.get("/agent/voices")
def list_voices():
    return {"voices": store.list_voices()}


@router.get("/projects/{pid}/voice-bindings")
def get_bindings(pid: str):
    return {"bindings": store.list_bindings(pid)}


@router.post("/projects/{pid}/voice-bindings")
def set_bindings(pid: str, data: dict = Body(default={})):
    bindings = data.get("bindings", [])
    for b in bindings:
        if not store.get_voice(b.get("voice_id", "")):
            return err("VOICE_NOT_AUTHORIZED", f"声音 {b.get('voice_id')} 不可用")
    store.set_bindings(pid, bindings)
    return {"bindings": store.list_bindings(pid)}


@router.post("/projects/{pid}/voices/confirm")
def confirm_voices(pid: str):
    chars = store.list_characters(pid)
    bound = {b["character_id"] for b in store.list_bindings(pid)}
    missing = [c["name"] for c in chars if c["character_id"] not in bound]
    if missing:
        return err("VOICE_NOT_BOUND", f"以下角色未绑定声音：{', '.join(missing)}")
    store.set_project_status(pid, "voice_confirmed")
    return {"status": "voice_confirmed"}


@router.get("/voices/{voice_id:path}/preview")
def voice_preview(voice_id: str):
    from services import voice_library
    path = voice_library.get_preview_path(voice_id)
    if not path:
        return err("SOURCE_NOT_FOUND", "预览不存在", 404)
    return FileResponse(path, media_type="audio/mpeg")


# ─────────────────────── Audio & Exports ───────────────────────

@router.get("/episodes/{eid}/audio")
def get_audio(eid: str):
    return {"final": store.get_final_audio(eid), "episode": store.get_episode(eid)}


@router.get("/agent/audio-file/{subpath:path}")
def audio_file(subpath: str):
    import config as cfg
    fp = os.path.abspath(os.path.join(cfg.OUTPUT_DIR, subpath))
    base = os.path.abspath(cfg.OUTPUT_DIR)
    if not fp.startswith(base + os.sep) or not os.path.exists(fp):
        return err("SOURCE_NOT_FOUND", "文件不存在", 404)
    return FileResponse(fp, media_type="audio/mpeg")


@router.get("/projects/{pid}/exports")
def list_exports(pid: str):
    return {"exports": store.list_exports(pid)}


# ─────────────────────── 管理后台：声音库 ───────────────────────

@router.get("/admin/voices")
def admin_list_voices():
    return {"voices": store.list_all_voices()}


@router.post("/admin/voices")
def admin_upsert_voice(data: dict = Body(default={})):
    return store.upsert_voice(data)


@router.patch("/admin/voices/{vid:path}")
def admin_patch_voice(vid: str, data: dict = Body(default={})):
    cur = store.get_voice(vid) or {}
    cur.update(data)
    cur["voice_id"] = vid
    return store.upsert_voice(cur)


@router.delete("/admin/voices/{vid:path}")
def admin_delete_voice(vid: str):
    store.delete_voice(vid)
    return {"message": "已删除"}


# ─────────────────────── 管理后台：风格模板 ───────────────────────

@router.get("/admin/styles")
def admin_list_styles():
    return {"styles": store.list_styles()}


@router.post("/admin/styles")
def admin_upsert_style(data: dict = Body(default={})):
    return store.upsert_style(data)


@router.delete("/admin/styles/{sid:path}")
def admin_delete_style(sid: str):
    store.delete_style(sid)
    return {"message": "已删除"}


# ─────────────────────── 管理后台：安全规则 ───────────────────────

@router.get("/admin/safety-rules")
def admin_list_rules():
    return {"rules": store.list_safety_rules()}


@router.post("/admin/safety-rules")
def admin_upsert_rule(data: dict = Body(default={})):
    return store.upsert_safety_rule(data)


@router.delete("/admin/safety-rules/{rid:path}")
def admin_delete_rule(rid: str):
    store.delete_safety_rule(rid)
    return {"message": "已删除"}


# ─────────────────────── 素材库 / 任务中心 ───────────────────────

@router.get("/materials")
def list_materials():
    return {"materials": store.list_all_sources()}


@router.get("/admin/tasks")
def admin_list_tasks(project_id: str = None):
    return {"tasks": store.list_tasks(project_id, limit=100)}


# ─────────────────────── 供应商（D-2）───────────────────────

@router.get("/providers")
def get_providers():
    import providers as prov
    return prov.list_providers()


@router.post("/providers/defaults")
def set_provider_defaults(data: dict = Body(default={})):
    import providers as prov
    for cap in prov.CAPABILITIES:
        if cap in data:
            try:
                prov.set_default(cap, data[cap])
            except ValueError as e:
                return err("INVALID_INPUT", str(e))
    return prov.list_providers()


# ─────────────────────── 系统设置（配置存 DB，D-2 数据库化）───────────────

@router.get("/settings")
def get_settings():
    import config as cfg
    return {k: getattr(cfg, k, "") or "" for k in cfg.CONFIG_KEYS}


@router.post("/settings")
def save_settings(data: dict = Body(default={})):
    import config as cfg
    import db as _db
    for k in cfg.CONFIG_KEYS:
        if k in data:
            _db.set_config(k, str(data[k]).strip())
    # Anthropic 客户端依赖 Key/Base，配置变更后重建
    try:
        import services.claude_service as cs
        cs.client = cs._make_client()
    except Exception as e:
        print(f"[settings] Anthropic 客户端重建失败（可忽略）: {e}", flush=True)
    return {"success": True}


# ─────────────────────── 图片（D-3）───────────────────────

@router.get("/images/{fname:path}")
def serve_image(fname: str):
    import config as cfg
    fp = os.path.abspath(os.path.join(cfg.IMAGES_DIR, fname))
    base = os.path.abspath(cfg.IMAGES_DIR)
    if not fp.startswith(base + os.sep) or not os.path.exists(fp):
        return err("SOURCE_NOT_FOUND", "图片不存在", 404)
    return FileResponse(fp, media_type="image/png")


# ─────────────────────── 发布记录（D-1）/ 我的资源 ───────────────────────

@router.get("/projects/{pid}/publish-records")
def list_publish_records(pid: str):
    return {"records": store.list_publish_records(pid)}


@router.get("/my-resources")
def my_resources():
    import config as cfg
    images = []
    if os.path.isdir(cfg.IMAGES_DIR):
        files = [f for f in os.listdir(cfg.IMAGES_DIR) if f.endswith(".png")]
        files.sort(key=lambda f: os.path.getmtime(os.path.join(cfg.IMAGES_DIR, f)), reverse=True)
        for f in files[:60]:
            fp = os.path.join(cfg.IMAGES_DIR, f)
            images.append({"url": f"/api/images/{f}", "size": os.path.getsize(fp)})
    return {
        "images": images,
        "finals": store.list_all_finals(),
        "exports": store.list_all_exports(),
        "publishes": store.list_all_publishes(),
    }
