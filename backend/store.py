"""
仓储层：对 13 张表的 CRUD。所有写操作走 db._write_lock 串行化。
JSON 字段（characters/story_units/...）在存取时自动 dumps/loads。
"""

import json
import uuid
from datetime import datetime, timezone

from db import get_conn, _write_lock


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _row(r):
    return dict(r) if r else None


def _rows(rs):
    return [dict(r) for r in rs]


def _j(v, default):
    """JSON 字符串 → python；容错。"""
    if v is None or v == "":
        return default
    try:
        return json.loads(v)
    except Exception:
        return default


def _exec(sql, params=()):
    conn = get_conn()
    with _write_lock:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur


# ─────────────────────── Projects ───────────────────────

def create_project(data: dict) -> dict:
    pid = _id("project")
    now = _now()
    _exec(
        """INSERT INTO projects
           (project_id,title,description,project_type,source_type,target_age,episode_count,
            episode_duration_minutes,style,format,faithfulness,status,cover,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, data.get("title", "未命名项目"), data.get("description", ""),
         data.get("project_type", "adaptation"), data.get("source_type", "text"),
         data.get("target_age", "8-12"), int(data.get("episode_count", 3)),
         int(data.get("episode_duration_minutes", 5)), data.get("style", "sunjingxiu"),
         data.get("format", "narrator_plus_roles"), data.get("faithfulness", "medium"),
         "draft", data.get("cover", ""), data.get("created_by", "user_001"), now, now),
    )
    return get_project(pid)


def get_project(pid: str) -> dict | None:
    return _row(get_conn().execute(
        "SELECT * FROM projects WHERE project_id=?", (pid,)).fetchone())


def list_projects(status: str = "", keyword: str = "") -> list[dict]:
    sql = "SELECT * FROM projects WHERE 1=1"
    params = []
    if status:
        sql += " AND status=?"
        params.append(status)
    if keyword:
        sql += " AND title LIKE ?"
        params.append(f"%{keyword}%")
    sql += " ORDER BY updated_at DESC"
    return _rows(get_conn().execute(sql, params).fetchall())


def update_project(pid: str, fields: dict) -> dict | None:
    allowed = {"title", "description", "project_type", "source_type", "target_age",
               "episode_count", "episode_duration_minutes", "style", "format",
               "faithfulness", "status", "cover",
               "llm_provider", "tts_provider", "music_provider", "sfx_provider", "image_provider"}
    sets, params = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=?")
            params.append(v)
    if sets:
        sets.append("updated_at=?")
        params.append(_now())
        params.append(pid)
        _exec(f"UPDATE projects SET {','.join(sets)} WHERE project_id=?", params)
    return get_project(pid)


def set_project_status(pid: str, status: str):
    _exec("UPDATE projects SET status=?,updated_at=? WHERE project_id=?", (status, _now(), pid))


def delete_project(pid: str):
    for t in ("script_blocks",):
        _exec(f'DELETE FROM {t} WHERE episode_id IN (SELECT episode_id FROM episodes WHERE project_id=?)', (pid,))
    for t in ("source_materials", "source_analyses", "episodes", "characters",
              "safety_findings", "voice_bindings", "exports", "agent_tasks"):
        _exec(f"DELETE FROM {t} WHERE project_id=?", (pid,))
    _exec("DELETE FROM projects WHERE project_id=?", (pid,))


# ─────────────────────── Source ───────────────────────

def save_source(pid: str, data: dict) -> dict:
    sid = _id("source")
    raw = data.get("raw_text", "")
    _exec("DELETE FROM source_materials WHERE project_id=?", (pid,))
    _exec(
        """INSERT INTO source_materials
           (source_id,project_id,title,raw_text,selection_mode,chapter_range,word_count,created_at)
           VALUES(?,?,?,?,?,?,?,?)""",
        (sid, pid, data.get("title", ""), raw, data.get("selection_mode", "whole"),
         data.get("chapter_range", ""), len(raw), _now()),
    )
    return get_source(pid)


def get_source(pid: str) -> dict | None:
    return _row(get_conn().execute(
        "SELECT * FROM source_materials WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
        (pid,)).fetchone())


def save_analysis(pid: str, a: dict) -> dict:
    aid = _id("analysis")
    _exec("DELETE FROM source_analyses WHERE project_id=?", (pid,))
    _exec(
        """INSERT INTO source_analyses
           (analysis_id,project_id,summary,characters,story_units,safety_findings,
            adaptation_suggestions,suitable,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (aid, pid, a.get("summary", ""), json.dumps(a.get("characters", []), ensure_ascii=False),
         json.dumps(a.get("story_units", []), ensure_ascii=False),
         json.dumps(a.get("safety_findings", []), ensure_ascii=False),
         json.dumps(a.get("adaptation_suggestions", []), ensure_ascii=False),
         1 if a.get("suitable", True) else 0, _now()),
    )
    return get_analysis(pid)


def get_analysis(pid: str) -> dict | None:
    r = _row(get_conn().execute(
        "SELECT * FROM source_analyses WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
        (pid,)).fetchone())
    if r:
        r["characters"] = _j(r["characters"], [])
        r["story_units"] = _j(r["story_units"], [])
        r["safety_findings"] = _j(r["safety_findings"], [])
        r["adaptation_suggestions"] = _j(r["adaptation_suggestions"], [])
        r["suitable"] = bool(r["suitable"])
    return r


# ─────────────────────── Episodes ───────────────────────

def replace_episodes(pid: str, episodes: list[dict]) -> list[dict]:
    """整体替换某项目的分集大纲（保留已锁定集）。"""
    existing = {e["episode_number"]: e for e in list_episodes(pid)}
    _exec("DELETE FROM episodes WHERE project_id=? AND locked=0", (pid,))
    for ep in episodes:
        num = int(ep.get("episode_number", 0))
        if num in existing and existing[num].get("locked"):
            continue
        upsert_episode(pid, ep)
    return list_episodes(pid)


def upsert_episode(pid: str, ep: dict) -> dict:
    eid = ep.get("episode_id") or _id("ep")
    now = _now()
    exists = get_episode(eid)
    chars = json.dumps(ep.get("characters", []), ensure_ascii=False)
    curve = json.dumps(ep.get("emotional_curve", []), ensure_ascii=False)
    if exists:
        _exec(
            """UPDATE episodes SET episode_number=?,title=?,summary=?,hook=?,main_conflict=?,
               characters=?,emotional_curve=?,educational_value=?,cliffhanger=?,risk_level=?,
               estimated_duration_minutes=?,locked=?,updated_at=? WHERE episode_id=?""",
            (ep.get("episode_number"), ep.get("title", ""), ep.get("summary", ""),
             ep.get("hook", ""), ep.get("main_conflict", ""), chars, curve,
             ep.get("educational_value", ""), ep.get("cliffhanger", ""),
             ep.get("risk_level", "low"), ep.get("estimated_duration_minutes", 5),
             1 if ep.get("locked") else 0, now, eid),
        )
    else:
        _exec(
            """INSERT INTO episodes
               (episode_id,project_id,episode_number,title,summary,hook,main_conflict,characters,
                emotional_curve,educational_value,cliffhanger,risk_level,estimated_duration_minutes,
                locked,status,review_status,audio_status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (eid, pid, ep.get("episode_number"), ep.get("title", ""), ep.get("summary", ""),
             ep.get("hook", ""), ep.get("main_conflict", ""), chars, curve,
             ep.get("educational_value", ""), ep.get("cliffhanger", ""),
             ep.get("risk_level", "low"), ep.get("estimated_duration_minutes", 5),
             1 if ep.get("locked") else 0, "outline_review", "pending", "none", now, now),
        )
    return get_episode(eid)


def get_episode(eid: str) -> dict | None:
    r = _row(get_conn().execute("SELECT * FROM episodes WHERE episode_id=?", (eid,)).fetchone())
    if r:
        r["characters"] = _j(r["characters"], [])
        r["emotional_curve"] = _j(r["emotional_curve"], [])
        r["locked"] = bool(r["locked"])
    return r


def list_episodes(pid: str) -> list[dict]:
    rs = _rows(get_conn().execute(
        "SELECT * FROM episodes WHERE project_id=? ORDER BY episode_number", (pid,)).fetchall())
    for r in rs:
        r["characters"] = _j(r["characters"], [])
        r["emotional_curve"] = _j(r["emotional_curve"], [])
        r["locked"] = bool(r["locked"])
    return rs


def set_episode_fields(eid: str, fields: dict):
    allowed = {"title", "summary", "hook", "main_conflict", "educational_value",
               "cliffhanger", "risk_level", "estimated_duration_minutes", "locked",
               "status", "review_status", "audio_status", "final_audio_url"}
    sets, params = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=?")
            params.append(1 if k == "locked" and isinstance(v, bool) else v)
    if sets:
        sets.append("updated_at=?")
        params += [_now(), eid]
        _exec(f"UPDATE episodes SET {','.join(sets)} WHERE episode_id=?", params)


# ─────────────────────── Script blocks ───────────────────────

def replace_script_blocks(eid: str, blocks: list[dict]) -> list[dict]:
    existing = {b["block_id"]: b for b in list_blocks(eid)}
    _exec('DELETE FROM script_blocks WHERE episode_id=? AND locked=0', (eid,))
    for i, b in enumerate(blocks):
        bid = b.get("block_id") or _id("block")
        if bid in existing and existing[bid].get("locked"):
            continue
        _insert_block(eid, bid, i + 1, b)
    return list_blocks(eid)


def _insert_block(eid, bid, order, b):
    _exec(
        """INSERT INTO script_blocks
           (block_id,episode_id,"order",type,character_id,character_name,text,emotion,speed,
            pause_after_ms,voice_id,sfx_id,bgm_id,bgm_action,duration_ms,review_status,audio_status,locked)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (bid, eid, order, b.get("type", "narration"), b.get("character_id"),
         b.get("character_name") or b.get("character", ""), b.get("text", ""),
         b.get("emotion", ""), b.get("speed", "medium"), int(b.get("pause_after_ms", 0) or 0),
         b.get("voice_id"), b.get("sfx_id"), b.get("bgm_id"), b.get("bgm_action"),
         b.get("duration_ms"), b.get("review_status", "pending"),
         b.get("audio_status", "none"), 1 if b.get("locked") else 0),
    )


def get_block(bid: str) -> dict | None:
    r = _row(get_conn().execute("SELECT * FROM script_blocks WHERE block_id=?", (bid,)).fetchone())
    if r:
        r["locked"] = bool(r["locked"])
    return r


def list_blocks(eid: str) -> list[dict]:
    rs = _rows(get_conn().execute(
        'SELECT * FROM script_blocks WHERE episode_id=? ORDER BY "order"', (eid,)).fetchall())
    for r in rs:
        r["locked"] = bool(r["locked"])
    return rs


def update_block(bid: str, fields: dict):
    allowed = {"type", "character_id", "character_name", "text", "emotion", "speed",
               "pause_after_ms", "voice_id", "sfx_id", "bgm_id", "bgm_action",
               "review_status", "audio_status", "locked"}
    sets, params = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=?")
            params.append(1 if k == "locked" and isinstance(v, bool) else v)
    if sets:
        params.append(bid)
        _exec(f'UPDATE script_blocks SET {",".join(sets)} WHERE block_id=?', params)


# ─────────────────────── Characters ───────────────────────

def replace_characters(pid: str, chars: list[dict]) -> list[dict]:
    _exec("DELETE FROM characters WHERE project_id=? AND locked=0", (pid,))
    for c in chars:
        cid = c.get("character_id") or _id("char")
        _exec(
            """INSERT OR REPLACE INTO characters
               (character_id,project_id,name,role_type,personality,age_feel,voice_suggestion,
                appears_in_episodes,lines_count,locked)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (cid, pid, c.get("name", ""), c.get("role_type", "supporting"),
             c.get("personality", ""), c.get("age_feel", ""), c.get("voice_suggestion", ""),
             json.dumps(c.get("appears_in_episodes", []), ensure_ascii=False),
             int(c.get("lines_count", 0)), 1 if c.get("locked") else 0),
        )
    return list_characters(pid)


def list_characters(pid: str) -> list[dict]:
    rs = _rows(get_conn().execute(
        "SELECT * FROM characters WHERE project_id=?", (pid,)).fetchall())
    for r in rs:
        r["appears_in_episodes"] = _j(r["appears_in_episodes"], [])
        r["locked"] = bool(r["locked"])
    return rs


def update_character(cid: str, fields: dict):
    allowed = {"name", "role_type", "personality", "age_feel", "voice_suggestion", "locked", "lines_count", "avatar_url"}
    sets, params = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=?")
            params.append(1 if k == "locked" and isinstance(v, bool) else v)
    if sets:
        params.append(cid)
        _exec(f"UPDATE characters SET {','.join(sets)} WHERE character_id=?", params)


# ─────────────────────── Safety findings ───────────────────────

def replace_findings(pid: str, findings: list[dict], episode_id: str = None):
    if episode_id:
        _exec("DELETE FROM safety_findings WHERE project_id=? AND episode_id=?", (pid, episode_id))
    else:
        _exec("DELETE FROM safety_findings WHERE project_id=?", (pid,))
    for f in findings:
        _exec(
            """INSERT INTO safety_findings
               (finding_id,project_id,episode_id,block_id,risk_type,risk_level,text,reason,suggestion,resolved,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (_id("finding"), pid, episode_id or f.get("episode_id"), f.get("block_id"),
             f.get("risk_type", ""), f.get("risk_level", "low"), f.get("text", ""),
             f.get("reason", ""), f.get("suggestion", ""), 1 if f.get("resolved") else 0, _now()),
        )


def list_findings(pid: str, episode_id: str = None) -> list[dict]:
    if episode_id:
        rs = get_conn().execute(
            "SELECT * FROM safety_findings WHERE project_id=? AND episode_id=?", (pid, episode_id)).fetchall()
    else:
        rs = get_conn().execute("SELECT * FROM safety_findings WHERE project_id=?", (pid,)).fetchall()
    out = _rows(rs)
    for r in out:
        r["resolved"] = bool(r["resolved"])
    return out


def resolve_finding(fid: str):
    _exec("UPDATE safety_findings SET resolved=1 WHERE finding_id=?", (fid,))


# ─────────────────────── Voices ───────────────────────

def list_voices(**filters) -> list[dict]:
    rs = _rows(get_conn().execute("SELECT * FROM voices WHERE enabled=1").fetchall())
    for r in rs:
        r["style_tags"] = _j(r["style_tags"], [])
        r["supported_emotions"] = _j(r["supported_emotions"], [])
        r["commercial_use"] = bool(r["commercial_use"])
        r["enabled"] = bool(r["enabled"])
    return rs


def list_all_voices() -> list[dict]:
    """含停用的全部音色（管理后台用）。"""
    rs = _rows(get_conn().execute("SELECT * FROM voices ORDER BY name").fetchall())
    for r in rs:
        r["style_tags"] = _j(r["style_tags"], [])
        r["supported_emotions"] = _j(r["supported_emotions"], [])
        r["commercial_use"] = bool(r["commercial_use"])
        r["enabled"] = bool(r["enabled"])
    return rs


def get_voice(vid: str) -> dict | None:
    r = _row(get_conn().execute("SELECT * FROM voices WHERE voice_id=?", (vid,)).fetchone())
    if r:
        r["style_tags"] = _j(r["style_tags"], [])
        r["supported_emotions"] = _j(r["supported_emotions"], [])
        r["commercial_use"] = bool(r["commercial_use"])
        r["enabled"] = bool(r["enabled"])
    return r


def upsert_voice(v: dict) -> dict:
    vid = v.get("voice_id") or _id("voice")
    _exec(
        """INSERT OR REPLACE INTO voices
           (voice_id,name,gender_feel,age_feel,tone,style_tags,supported_emotions,
            license_status,commercial_use,sample_url,enabled,provider)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (vid, v.get("name", ""), v.get("gender_feel", "neutral"), v.get("age_feel", "adult"),
         v.get("tone", ""), json.dumps(v.get("style_tags", []), ensure_ascii=False),
         json.dumps(v.get("supported_emotions", []), ensure_ascii=False),
         v.get("license_status", "system_authorized"), 1 if v.get("commercial_use", True) else 0,
         v.get("sample_url", ""), 1 if v.get("enabled", True) else 0,
         v.get("provider", "doubao")),
    )
    return get_voice(vid)


def delete_voice(vid: str):
    _exec("DELETE FROM voices WHERE voice_id=?", (vid,))


# ─────────────────────── Style templates ───────────────────────

def list_styles(only_enabled=False) -> list[dict]:
    sql = "SELECT * FROM style_templates" + (" WHERE enabled=1" if only_enabled else "") + " ORDER BY name"
    rs = _rows(get_conn().execute(sql).fetchall())
    for r in rs:
        r["forbidden"] = _j(r["forbidden"], [])
        r["enabled"] = bool(r["enabled"])
    return rs


def upsert_style(s: dict) -> dict:
    sid = s.get("style_id") or _id("style")
    _exec(
        """INSERT OR REPLACE INTO style_templates
           (style_id,name,description,suitable_age,language_feat,pace_feat,narration_ratio,dialogue_ratio,forbidden,sample,enabled)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (sid, s.get("name", ""), s.get("description", ""), s.get("suitable_age", ""),
         s.get("language_feat", ""), s.get("pace_feat", ""), s.get("narration_ratio", ""),
         s.get("dialogue_ratio", ""), json.dumps(s.get("forbidden", []), ensure_ascii=False),
         s.get("sample", ""), 1 if s.get("enabled", True) else 0),
    )
    return _row(get_conn().execute("SELECT * FROM style_templates WHERE style_id=?", (sid,)).fetchone())


def delete_style(sid: str):
    _exec("DELETE FROM style_templates WHERE style_id=?", (sid,))


# ─────────────────────── Safety rules ───────────────────────

def list_safety_rules(only_enabled=False) -> list[dict]:
    sql = "SELECT * FROM safety_rules" + (" WHERE enabled=1" if only_enabled else "") + " ORDER BY risk_level DESC"
    rs = _rows(get_conn().execute(sql).fetchall())
    for r in rs:
        r["enabled"] = bool(r["enabled"])
    return rs


def upsert_safety_rule(r: dict) -> dict:
    rid = r.get("rule_id") or _id("rule")
    _exec(
        """INSERT OR REPLACE INTO safety_rules
           (rule_id,name,risk_type,suitable_age,risk_level,description,sample_text,suggestion,enabled)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (rid, r.get("name", ""), r.get("risk_type", ""), r.get("suitable_age", ""),
         r.get("risk_level", "medium"), r.get("description", ""), r.get("sample_text", ""),
         r.get("suggestion", ""), 1 if r.get("enabled", True) else 0),
    )
    return _row(get_conn().execute("SELECT * FROM safety_rules WHERE rule_id=?", (rid,)).fetchone())


def delete_safety_rule(rid: str):
    _exec("DELETE FROM safety_rules WHERE rule_id=?", (rid,))


# ─────────────────────── Materials (源素材汇总) ───────────────────────

def list_all_sources() -> list[dict]:
    rows = get_conn().execute(
        """SELECT s.*, p.title AS project_title FROM source_materials s
           LEFT JOIN projects p ON s.project_id=p.project_id ORDER BY s.created_at DESC""").fetchall()
    out = []
    for r in _rows(rows):
        r.pop("raw_text", None)  # 列表不返回全文
        out.append(r)
    return out


# ─────────────────────── Voice bindings ───────────────────────

def set_bindings(pid: str, bindings: list[dict]):
    for b in bindings:
        cid = b["character_id"]
        _exec("DELETE FROM voice_bindings WHERE project_id=? AND character_id=?", (pid, cid))
        _exec(
            "INSERT INTO voice_bindings(binding_id,project_id,character_id,voice_id,locked) VALUES(?,?,?,?,?)",
            (_id("binding"), pid, cid, b["voice_id"], 1 if b.get("locked") else 0),
        )


def list_bindings(pid: str) -> list[dict]:
    return _rows(get_conn().execute(
        "SELECT * FROM voice_bindings WHERE project_id=?", (pid,)).fetchall())


def voice_map_for_project(pid: str) -> dict:
    """{角色名: voice_id}，供 TTS 使用。"""
    rows = get_conn().execute(
        """SELECT c.name AS name, b.voice_id AS voice_id
           FROM voice_bindings b JOIN characters c ON b.character_id=c.character_id
           WHERE b.project_id=?""", (pid,)).fetchall()
    return {r["name"]: r["voice_id"] for r in rows}


# ─────────────────────── Audio assets ───────────────────────

def save_audio_asset(a: dict):
    _exec(
        """INSERT INTO audio_assets(audio_id,episode_id,block_id,file_url,file_path,duration_ms,kind,status,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (_id("audio"), a["episode_id"], a.get("block_id"), a.get("file_url", ""),
         a.get("file_path", ""), a.get("duration_ms"), a.get("kind", "block"),
         a.get("status", "completed"), _now()),
    )


def get_final_audio(eid: str) -> dict | None:
    return _row(get_conn().execute(
        "SELECT * FROM audio_assets WHERE episode_id=? AND kind='final' ORDER BY created_at DESC LIMIT 1",
        (eid,)).fetchone())


# ─────────────────────── Exports ───────────────────────

def save_export(pid: str, e: dict) -> dict:
    xid = _id("export")
    _exec(
        """INSERT INTO exports(export_id,project_id,scope,formats,file_name,file_url,file_size,
           duration_ms,include_script,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (xid, pid, e.get("scope", "all_episodes"),
         json.dumps(e.get("formats", ["mp3"]), ensure_ascii=False),
         e.get("file_name", ""), e.get("file_url", ""), e.get("file_size", 0),
         e.get("duration_ms", 0), 1 if e.get("include_script") else 0, _now()),
    )
    return _row(get_conn().execute("SELECT * FROM exports WHERE export_id=?", (xid,)).fetchone())


def list_exports(pid: str) -> list[dict]:
    rs = _rows(get_conn().execute(
        "SELECT * FROM exports WHERE project_id=? ORDER BY created_at DESC", (pid,)).fetchall())
    for r in rs:
        r["formats"] = _j(r["formats"], [])
    return rs


# ─────────────────────── Users（账号闭环）───────────────────────

def upsert_user(email: str, name: str = "") -> dict:
    """按邮箱登录：存在则返回，不存在则创建（开发模式不校验密码）。"""
    r = _row(get_conn().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone())
    if r:
        return r
    uid = _id("user")
    _exec("INSERT INTO users(user_id,email,name,role,created_at) VALUES(?,?,?,?,?)",
          (uid, email, name or email.split("@")[0], "user", _now()))
    return _row(get_conn().execute("SELECT * FROM users WHERE user_id=?", (uid,)).fetchone())


# ─────────────────────── 项目复制 ───────────────────────

def duplicate_project(pid: str) -> dict | None:
    """复制项目：配置 + 素材 + 解析 + 分集/剧本块 + 角色 + 声音绑定。音频不复制。"""
    src = get_project(pid)
    if not src:
        return None
    fields = {k: src[k] for k in ("description", "project_type", "source_type", "target_age",
                                  "episode_count", "episode_duration_minutes", "style", "format",
                                  "faithfulness", "cover") if src.get(k) is not None}
    fields["title"] = src["title"] + "（副本）"
    fields["created_by"] = src.get("created_by", "user_001")
    new = create_project(fields)
    npid = new["project_id"]
    prov_fields = {k: src.get(k) for k in ("llm_provider", "tts_provider", "music_provider",
                                           "sfx_provider", "image_provider") if src.get(k)}
    if prov_fields:
        update_project(npid, prov_fields)
    s = get_source(pid)
    if s:
        save_source(npid, s)
    a = get_analysis(pid)
    if a:
        save_analysis(npid, a)
    # 角色（重建 id）→ 按名字映射声音绑定
    chars = list_characters(pid)
    new_chars = replace_characters(npid, [{**c, "character_id": None} for c in chars])
    old_name = {c["character_id"]: c["name"] for c in chars}
    name_new = {c["name"]: c["character_id"] for c in new_chars}
    binds = []
    for b in list_bindings(pid):
        nm = old_name.get(b["character_id"])
        if nm in name_new:
            binds.append({"character_id": name_new[nm], "voice_id": b["voice_id"],
                          "locked": bool(b["locked"])})
    if binds:
        set_bindings(npid, binds)
    # 分集 + 剧本块（音频状态重置）
    for ep in list_episodes(pid):
        blocks = list_blocks(ep["episode_id"])
        nep = upsert_episode(npid, {**ep, "episode_id": None})
        set_episode_fields(nep["episode_id"], {"status": ep["status"],
                                               "review_status": ep["review_status"]})
        replace_script_blocks(nep["episode_id"],
                              [{**b, "block_id": None, "audio_status": "none"} for b in blocks])
    # 项目状态跟随源（生成中的状态回退到已审）
    status = src["status"] if src["status"] not in ("audio_generating",) else "script_approved"
    set_project_status(npid, status)
    return get_project(npid)


# ─────────────────────── 我的资源（跨项目聚合）───────────────────────

def list_all_finals() -> list[dict]:
    rows = get_conn().execute(
        """SELECT a.audio_id, a.file_url, a.duration_ms, a.created_at,
                  e.title AS episode_title, e.episode_number, p.title AS project_title
           FROM audio_assets a
           LEFT JOIN episodes e ON a.episode_id=e.episode_id
           LEFT JOIN projects p ON e.project_id=p.project_id
           WHERE a.kind='final' ORDER BY a.created_at DESC LIMIT 50""").fetchall()
    return _rows(rows)


def list_all_exports() -> list[dict]:
    rows = get_conn().execute(
        """SELECT e.*, p.title AS project_title FROM exports e
           LEFT JOIN projects p ON e.project_id=p.project_id
           ORDER BY e.created_at DESC LIMIT 50""").fetchall()
    out = _rows(rows)
    for r in out:
        r["formats"] = _j(r["formats"], [])
    return out


def list_all_publishes() -> list[dict]:
    rows = get_conn().execute(
        """SELECT r.*, p.title AS project_title, e.title AS episode_title
           FROM publish_records r
           LEFT JOIN projects p ON r.project_id=p.project_id
           LEFT JOIN episodes e ON r.episode_id=e.episode_id
           ORDER BY r.created_at DESC LIMIT 50""").fetchall()
    return _rows(rows)


# ─────────────────────── Publish records（设备内容库发布，D-1）───────────────

def save_publish_record(pid: str, r: dict) -> dict:
    xid = _id("publish")
    _exec(
        """INSERT INTO publish_records(publish_id,project_id,episode_id,channel,status,remote_id,message,created_at)
           VALUES(?,?,?,?,?,?,?,?)""",
        (xid, pid, r.get("episode_id"), r.get("channel", "device_library"),
         r.get("status", "pending"), r.get("remote_id", ""), r.get("message", ""), _now()),
    )
    return _row(get_conn().execute("SELECT * FROM publish_records WHERE publish_id=?", (xid,)).fetchone())


def list_publish_records(pid: str) -> list[dict]:
    return _rows(get_conn().execute(
        "SELECT * FROM publish_records WHERE project_id=? ORDER BY created_at DESC", (pid,)).fetchall())


# ─────────────────────── Agent tasks ───────────────────────

def create_task(task_type: str, project_id: str = None, episode_id: str = None,
                input_data: dict = None) -> dict:
    tid = _id("task")
    now = _now()
    _exec(
        """INSERT INTO agent_tasks(task_id,project_id,episode_id,task_type,status,progress,message,input,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (tid, project_id, episode_id, task_type, "pending", 0, "",
         json.dumps(input_data or {}, ensure_ascii=False), now, now),
    )
    return get_task(tid)


def get_task(tid: str) -> dict | None:
    r = _row(get_conn().execute("SELECT * FROM agent_tasks WHERE task_id=?", (tid,)).fetchone())
    if r:
        r["input"] = _j(r["input"], {})
        r["result"] = _j(r["result"], None)
        r["error"] = _j(r["error"], None)
    return r


def update_task(tid: str, **fields):
    cols = {"status", "progress", "message"}
    sets, params = [], []
    for k, v in fields.items():
        if k in cols:
            sets.append(f"{k}=?")
            params.append(v)
        elif k in ("result", "error"):
            sets.append(f"{k}=?")
            params.append(json.dumps(v, ensure_ascii=False) if v is not None else None)
    sets.append("updated_at=?")
    params += [_now(), tid]
    _exec(f"UPDATE agent_tasks SET {','.join(sets)} WHERE task_id=?", params)


def list_tasks(project_id: str = None, limit: int = 50) -> list[dict]:
    if project_id:
        rs = get_conn().execute(
            "SELECT * FROM agent_tasks WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
            (project_id, limit)).fetchall()
    else:
        rs = get_conn().execute(
            "SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    out = _rows(rs)
    for r in out:
        r["input"] = _j(r["input"], {})
        r["result"] = _j(r["result"], None)
        r["error"] = _j(r["error"], None)
    return out
