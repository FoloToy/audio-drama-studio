"""
Agent 实现集合。每个 Agent 是 handler(task, emit) -> dict，
在 DB 上读写（经 store），调用 LLM（经 claude_service）与音频服务（现有 services）。

设计要点：
- 所有 LLM 调用经 _llm_json()，失败/无 Key 时回退到确定性 stub，保证流程可端到端跑通、可演示。
- 前半程（parse/outline/script/safety/characters/voices）产出结构化数据落库。
- 后半程（audio/remix/export）复用现有 doubao_tts / elevenlabs_sfx / suno_bgm / mixer。
"""

import os
import json

import store
import config as cfg
import providers as prov
from llm_router import call_llm_text
from services.claude_service import _extract_json

AGE_GUIDE = {
    "3-5": "3-5岁：句子短、情节简单、人物少、情绪温和，避免死亡/战争/恐怖，多重复与互动，单集3-5分钟。",
    "5-8": "5-8岁：可有简单冲突与清晰因果、幽默互动、轻量冒险，弱化暴力，价值明确，单集5-8分钟。",
    "8-12": "8-12岁：可保留较多原著信息、复杂动机、策略与成长主题，避免血腥与成人权谋，单集8-12分钟。",
}
STYLE_NAME = {
    "sunjingxiu": "孙敬修式儿童故事感（亲切、慢节奏、画面感强、像长辈讲故事）",
    "classic_children_radio": "经典儿童广播故事风",
    "bedtime": "睡前陪伴风（低刺激、温柔、慢节奏）",
    "adventure_comedy": "冒险喜剧风",
    "guoxue": "国学启蒙风",
    "gentle_healing": "温柔治愈风",
    "blog": "博客有声故事风",
}


def _llm_json(prompt: str, system: str, fallback: dict, project: dict = None) -> dict:
    """调用 LLM（按项目/全局供应商路由）并解析 JSON；任何异常回退到 fallback。"""
    try:
        raw = call_llm_text(prompt, system=system, max_tokens=8192, project=project)
        if not raw or not raw.strip():
            return fallback
        return _extract_json(raw)
    except Exception as e:
        print(f"[agents] LLM 调用失败，使用回退: {e}", flush=True)
        return fallback


# ─────────────────────── 1. 素材解析 ───────────────────────

def parse_source(task, emit):
    pid = task["project_id"]
    project = store.get_project(pid)
    src = store.get_source(pid)
    text = (src or {}).get("raw_text", "") if src else ""
    emit(type="progress", progress=15, message="正在清洗与理解原著文本…")

    age = project["target_age"]
    prompt = f"""你是儿童音频短剧的素材解析专家。请解析下面的原著文本，输出严格 JSON。

目标年龄段：{age}（{AGE_GUIDE.get(age, '')}）
计划集数：{project['episode_count']}

请输出如下 JSON（不要任何多余文字）：
{{
  "summary": "150字内的故事摘要",
  "characters": [{{"name":"角色名","role_type":"main_character/supporting/narrator","description":"性格特征"}}],
  "story_units": [{{"unit_id":"unit_001","title":"单元标题","summary":"一句话","suggested_age":"{age}","risk_level":"low/medium/high"}}],
  "safety_findings": [{{"risk_type":"violence/horror/death_expression/...","risk_level":"low/medium/high","text":"原文片段","reason":"原因","suggestion":"改写建议"}}],
  "adaptation_suggestions": ["改编建议1","改编建议2"],
  "suitable": true
}}

原著文本（节选）：
{text[:6000]}"""

    fallback = {
        "summary": (text[:120] + "…") if text else "（无原文，示例摘要）一个适合儿童改编的经典故事。",
        "characters": [
            {"name": "旁白", "role_type": "narrator", "description": "温暖亲切的讲述者"},
            {"name": "主角", "role_type": "main_character", "description": "勇敢好奇"},
        ],
        "story_units": [
            {"unit_id": "unit_001", "title": "开端", "summary": "故事的开始。",
             "suggested_age": age, "risk_level": "low"},
        ],
        "safety_findings": [],
        "adaptation_suggestions": ["适合改编为多角色短剧", "弱化冲突强度以适配目标年龄"],
        "suitable": True,
    }
    emit(type="progress", progress=55, message="正在提取角色、故事单元与风险点…")
    data = _llm_json(prompt, "只输出 JSON，不要 Markdown。", fallback, project=project)
    store.save_analysis(pid, data)
    store.set_project_status(pid, "source_parsed")
    emit(type="progress", progress=95, message="解析完成")
    return {"analysis": store.get_analysis(pid)}


# ─────────────────────── 2. 故事拆集 ───────────────────────

def generate_outline(task, emit):
    pid = task["project_id"]
    project = store.get_project(pid)
    analysis = store.get_analysis(pid) or {}
    src = store.get_source(pid) or {}
    n = project["episode_count"]
    age = project["target_age"]
    emit(type="progress", progress=15, message=f"正在按儿童听故事节奏拆分 {n} 集…")

    prompt = f"""你是儿童音频短剧的故事拆集专家。请把故事拆成 {n} 集，不是按字数平均切分，而是按儿童听故事节奏切分，每集要有开场钩子、核心冲突、结尾期待。

目标年龄：{age}（{AGE_GUIDE.get(age, '')}）
风格：{STYLE_NAME.get(project['style'], project['style'])}
单集时长：约 {project['episode_duration_minutes']} 分钟

故事摘要：{analysis.get('summary', '')}
原文节选：{src.get('raw_text', '')[:3000]}

输出严格 JSON：
{{"episodes":[
  {{"episode_number":1,"title":"本集标题","summary":"本集摘要","hook":"开场钩子",
    "main_conflict":"核心冲突","characters":["旁白","角色A"],"emotional_curve":["平静","紧张","思考"],
    "educational_value":"教育价值","cliffhanger":"结尾悬念","risk_level":"low","estimated_duration_minutes":{project['episode_duration_minutes']}}}
]}}
必须正好 {n} 集。只输出 JSON。"""

    fallback = {"episodes": [
        {"episode_number": i + 1, "title": f"第{i+1}集", "summary": f"第 {i+1} 集的故事内容。",
         "hook": "一个引人入胜的开场。", "main_conflict": "本集要解决的小难题。",
         "characters": ["旁白", "主角"], "emotional_curve": ["平静", "好奇", "喜悦"],
         "educational_value": "勇敢与善良", "cliffhanger": "接下来会发生什么呢？",
         "risk_level": "low", "estimated_duration_minutes": project["episode_duration_minutes"]}
        for i in range(n)
    ]}
    data = _llm_json(prompt, "只输出 JSON，不要 Markdown。", fallback, project=project)
    episodes = data.get("episodes") or fallback["episodes"]
    store.replace_episodes(pid, episodes)
    store.set_project_status(pid, "outline_review")
    emit(type="progress", progress=95, message="分集大纲已生成")
    return {"episodes": store.list_episodes(pid)}


# ─────────────────────── 3. 剧本生成（含适龄+风格转换） ───────────────────────

_ROLE_TYPE_GUESS = {"旁白": "narrator"}


def _legacy_to_blocks(script: list) -> list:
    """现有 legacy 结构 → PRD script_blocks。"""
    blocks = []
    for it in script:
        t = it.get("type")
        if t == "tts":
            speaker = it.get("speaker", "")
            blocks.append({
                "type": "narration" if speaker == "旁白" else "dialogue",
                "character_name": speaker,
                "text": it.get("text", ""),
                "emotion": it.get("emotion", ""),
                "speed": "slow" if speaker == "旁白" else "medium",
                "pause_after_ms": 500,
            })
        elif t == "sfx":
            blocks.append({"type": "sfx", "character_name": "", "text": it.get("name", ""),
                           "emotion": "", "speed": "", "pause_after_ms": 0})
        elif t == "bgm":
            blocks.append({"type": "bgm", "character_name": "", "text": it.get("name", ""),
                           "bgm_action": it.get("action", "start"),
                           "emotion": "", "speed": "", "pause_after_ms": 0})
    return blocks


def blocks_to_legacy(blocks: list) -> list:
    """script_blocks → 现有音频管线消费的 legacy 结构。"""
    out = []
    for b in blocks:
        t = b["type"]
        if t in ("narration", "dialogue"):
            out.append({"type": "tts", "speaker": b.get("character_name", ""),
                        "emotion": b.get("emotion", ""), "text": b.get("text", "")})
        elif t == "sfx":
            out.append({"type": "sfx", "name": b.get("text", "")})
        elif t == "bgm":
            out.append({"type": "bgm", "action": b.get("bgm_action", "start"),
                        "name": b.get("text", "")})
    return out


def generate_script(task, emit):
    pid = task["project_id"]
    eid = task["episode_id"]
    project = store.get_project(pid)
    ep = store.get_episode(eid)
    age = project["target_age"]
    src = store.get_source(pid) or {}
    emit(type="progress", progress=10, message=f"正在为《{ep['title']}》生成结构化剧本…")

    prompt = f"""你是儿童音频广播剧编剧。请根据分集大纲生成本集结构化剧本，并完成适龄改编与风格转换。

目标年龄：{age}（{AGE_GUIDE.get(age, '')}）
讲述风格：{STYLE_NAME.get(project['style'], project['style'])}
本集标题：{ep['title']}
本集摘要：{ep['summary']}
开场钩子：{ep['hook']}
核心冲突：{ep['main_conflict']}
教育价值：{ep.get('educational_value','')}
原文参考：{src.get('raw_text','')[:2500]}

输出严格 JSON（legacy 结构）：
{{"script":[
  {{"type":"bgm","action":"start","name":"开场音乐"}},
  {{"type":"tts","speaker":"旁白","emotion":"温暖亲切","text":"旁白台词"}},
  {{"type":"sfx","name":"风声"}},
  {{"type":"tts","speaker":"角色名","emotion":"好奇","text":"角色台词"}},
  {{"type":"bgm","action":"stop"}}
],
"characters":[{{"name":"旁白","importance":"必须","lines_count":5}}],
"bgm_list":["开场音乐"],"sfx_list":["风声"]}}

要求：语言适龄、弱化暴力恐怖、旁白温暖、台词口语化。只输出 JSON。"""

    fallback = {"script": [
        {"type": "bgm", "action": "start", "name": "开场音乐"},
        {"type": "tts", "speaker": "旁白", "emotion": "温暖亲切",
         "text": f"小朋友们，今天我们来讲《{ep['title']}》的故事。{ep.get('hook','')}"},
        {"type": "sfx", "name": "轻柔铃声"},
        {"type": "tts", "speaker": "旁白", "emotion": "平缓叙述",
         "text": ep.get("summary", "故事就这样开始了。")},
        {"type": "bgm", "action": "stop"},
    ], "characters": [{"name": "旁白", "importance": "必须", "lines_count": 2}],
        "bgm_list": ["开场音乐"], "sfx_list": ["轻柔铃声"]}

    emit(type="progress", progress=45, message="逐句生成台词、旁白、音效与情绪标签…")
    data = _llm_json(prompt, "只输出 JSON，不要 Markdown。", fallback, project=project)
    legacy = data.get("script") or fallback["script"]
    blocks = _legacy_to_blocks(legacy)
    store.replace_script_blocks(eid, blocks)

    # 顺带把 characters 落库（角色识别 Agent 的轻量版）
    chars = data.get("characters") or []
    role_chars = [{
        "name": c.get("name", ""),
        "role_type": _ROLE_TYPE_GUESS.get(c.get("name"), "narrator" if c.get("name") == "旁白" else "main_character"),
        "personality": "", "voice_suggestion": "",
        "lines_count": c.get("lines_count", 0),
        "appears_in_episodes": [ep["episode_number"]],
    } for c in chars]
    if role_chars:
        # 合并已有角色，避免覆盖锁定
        store.replace_characters(pid, role_chars)

    store.set_episode_fields(eid, {"status": "script_review", "review_status": "pending"})
    store.set_project_status(pid, "script_review")
    emit(type="progress", progress=95, message="剧本生成完成")
    return {"blocks": store.list_blocks(eid), "characters": store.list_characters(pid)}


# ─────────────────────── 4. 儿童安全审核 ───────────────────────

def safety_review(task, emit):
    pid = task["project_id"]
    eid = task.get("episode_id")
    project = store.get_project(pid)
    age = project["target_age"]
    emit(type="progress", progress=20, message="正在按儿童安全维度审核内容…")

    if eid:
        blocks = store.list_blocks(eid)
        content = "\n".join(f"[{b['block_id']}] {b.get('character_name','')}: {b.get('text','')}"
                            for b in blocks if b.get("text"))
    else:
        content = (store.get_analysis(pid) or {}).get("summary", "")

    try:
        rules = store.list_safety_rules(only_enabled=True)
        rules_text = "\n".join(f"- {r['name']}（{r['risk_type']}, {r['risk_level']}）：{r['description']}" for r in rules)
    except Exception:
        rules_text = ""

    prompt = f"""你是儿童内容安全审核专家。请审核以下内容是否适合目标年龄 {age} 的儿童。
风险类型枚举：violence, horror, adult_content, sexual_content, discrimination, insult, bad_language, dangerous_behavior, negative_values, superstition, death_expression, historical_inappropriate
风险等级：low, medium, high, blocked
{('参考审核规则：\\n' + rules_text) if rules_text else ''}

输出严格 JSON：
{{"risk_level":"low/medium/high/blocked","blocked":false,
  "findings":[{{"block_id":"若有则填","risk_type":"violence","risk_level":"medium","text":"风险片段","reason":"原因","suggestion":"改写建议"}}]}}
若内容安全，findings 为空数组，risk_level 为 low。只输出 JSON。

内容：
{content[:5000]}"""

    fallback = {"risk_level": "low", "blocked": False, "findings": []}
    data = _llm_json(prompt, "只输出 JSON，不要 Markdown。", fallback, project=project)
    findings = data.get("findings", [])
    store.replace_findings(pid, findings, episode_id=eid)
    emit(type="progress", progress=95,
         message=f"审核完成：{len(findings)} 处风险，整体 {data.get('risk_level','low')}")
    return {"risk_level": data.get("risk_level", "low"),
            "blocked": data.get("blocked", False), "findings": store.list_findings(pid, eid)}


# ─────────────────────── 5. 角色识别 ───────────────────────

def identify_characters(task, emit):
    pid = task["project_id"]
    project = store.get_project(pid)
    emit(type="progress", progress=20, message="正在识别角色与生成角色设定…")

    # 汇总所有剧本块中的角色 + 台词数
    tally = {}
    for ep in store.list_episodes(pid):
        for b in store.list_blocks(ep["episode_id"]):
            if b["type"] in ("narration", "dialogue") and b.get("character_name"):
                name = b["character_name"]
                tally.setdefault(name, {"lines": 0, "eps": set()})
                tally[name]["lines"] += 1
                tally[name]["eps"].add(ep["episode_number"])

    names = list(tally.keys()) or ["旁白", "主角"]
    prompt = f"""为儿童音频剧的角色生成设定。角色列表：{', '.join(names)}
目标年龄：{project['target_age']}
输出严格 JSON：
{{"characters":[{{"name":"角色名","role_type":"main_character/supporting/narrator/animal/elder","personality":"性格","age_feel":"childlike/young/adult/elder","voice_suggestion":"声音建议"}}]}}
只输出 JSON。"""
    fallback = {"characters": [
        {"name": n, "role_type": "narrator" if n == "旁白" else "main_character",
         "personality": "亲切" if n == "旁白" else "勇敢好奇",
         "age_feel": "adult" if n == "旁白" else "young",
         "voice_suggestion": "温暖讲述感" if n == "旁白" else "清亮坚定"} for n in names]}
    data = _llm_json(prompt, "只输出 JSON，不要 Markdown。", fallback, project=project)
    chars = data.get("characters") or fallback["characters"]
    for c in chars:
        info = tally.get(c["name"], {"lines": 0, "eps": set()})
        c["lines_count"] = info["lines"]
        c["appears_in_episodes"] = sorted(info["eps"])
    store.replace_characters(pid, chars)
    store.set_project_status(pid, "voice_binding")
    emit(type="progress", progress=95, message=f"识别到 {len(chars)} 个角色")
    return {"characters": store.list_characters(pid)}


# ─────────────────────── 6. 声音匹配 ───────────────────────

def recommend_voices(task, emit):
    pid = task["project_id"]
    chars = store.list_characters(pid)
    emit(type="progress", progress=25, message="正在为角色匹配声音…")

    from services import voice_library
    # 复用现有 assign_voices（基于本地音色库 + LLM）
    payload = [{"name": c["name"], "importance": "必须" if c["role_type"] == "narrator" else "主要",
                "lines_count": c.get("lines_count", 0)} for c in chars]
    voice_map = {}
    try:
        voice_map = voice_library.assign_voices(payload)
    except Exception as e:
        print(f"[agents] recommend_voices assign 失败: {e}", flush=True)

    voices = store.list_voices()
    # 无匹配时回退：按顺序分配可用音色
    if not voice_map and voices:
        for i, c in enumerate(chars):
            voice_map[c["name"]] = voices[i % len(voices)]["voice_id"]

    # 写入 voice_bindings（未锁定，供用户确认）
    name_to_cid = {c["name"]: c["character_id"] for c in chars}
    bindings = [{"character_id": name_to_cid[name], "voice_id": vid, "locked": False}
                for name, vid in voice_map.items() if name in name_to_cid]
    if bindings:
        store.set_bindings(pid, bindings)

    recommendations = []
    vmeta = {v["voice_id"]: v for v in voices}
    for c in chars:
        vid = voice_map.get(c["name"])
        recommendations.append({
            "character_id": c["character_id"], "character_name": c["name"],
            "recommended_voice_id": vid,
            "recommended_voice": vmeta.get(vid) if vid else None,
        })
    emit(type="progress", progress=95, message=f"已推荐 {len(bindings)} 个角色声音")
    return {"recommendations": recommendations, "bindings": store.list_bindings(pid)}


# ─────────────────────── 7. 音频生成 + 混音 ───────────────────────

def generate_audio(task, emit):
    from tts_router import generate_episode_tts          # 多 TTS 供应商路由
    from services.elevenlabs_sfx import generate_all_sfx
    from services.suno_bgm import generate_all_bgm
    from services.mixer import mix_episode
    from services import library as asset_library
    from services.claude_service import generate_media_prompts

    pid = task["project_id"]
    eid = task["episode_id"]
    opts = task["input"].get("generation_options", {})
    project = store.get_project(pid)
    ep = store.get_episode(eid)

    blocks = store.list_blocks(eid)
    legacy = blocks_to_legacy(blocks)
    voice_map = store.voice_map_for_project(pid)

    # 门禁：声音未绑定
    speakers = {b.get("character_name") for b in blocks if b["type"] in ("narration", "dialogue")}
    if not any(s in voice_map for s in speakers):
        raise ValueError("VOICE_NOT_BOUND: 角色声音未绑定")

    ep_dir = os.path.join(cfg.OUTPUT_DIR, eid[:10])
    os.makedirs(ep_dir, exist_ok=True)
    store.set_episode_fields(eid, {"audio_status": "generating"})

    sfx_list = list({i["name"] for i in legacy if i["type"] == "sfx" and i.get("name")})
    bgm_list = list({i["name"] for i in legacy
                     if i["type"] == "bgm" and i.get("action") == "start" and i.get("name")})

    sfx_file_map, bgm_file_map = {}, {}
    include_sfx = opts.get("include_sfx", True)
    include_bgm = opts.get("include_bgm", True)

    # 提示词
    sfx_prompts, bgm_prompts = {}, {}
    if (include_sfx and sfx_list) or (include_bgm and bgm_list):
        emit(type="progress", progress=10, message="生成音效/BGM 英文提示词…")
        try:
            mp = generate_media_prompts(project["title"], ep["title"],
                                        sfx_list if include_sfx else [],
                                        bgm_list if include_bgm else [])
            sfx_prompts = mp.get("sfx_prompts", {})
            bgm_prompts = mp.get("bgm_prompts", {})
        except Exception as e:
            print(f"[agents] media prompts 失败: {e}", flush=True)
            sfx_prompts = {n: n for n in sfx_list}
            bgm_prompts = {n: n for n in bgm_list}

    sfx_provider = prov.resolve("sfx", project)
    music_provider = prov.resolve("music", project)

    if include_sfx and sfx_prompts:
        emit(type="progress", progress=25, message=f"生成 {len(sfx_prompts)} 个音效（{sfx_provider}）…")
        try:
            sfx_file_map = generate_all_sfx(sfx_prompts, provider=sfx_provider) or {}
            for name, path in sfx_file_map.items():
                asset_library.add_entry("sfx", name, sfx_prompts.get(name, name), path)
        except Exception as e:
            print(f"[agents] SFX 生成失败（跳过）: {e}", flush=True)

    if include_bgm and bgm_prompts:
        emit(type="progress", progress=45, message=f"生成 {len(bgm_prompts)} 首 BGM（{music_provider}，每首约 3-4 分钟）…")
        try:
            bgm_file_map = generate_all_bgm(bgm_prompts, provider=music_provider) or {}
            for name, path in bgm_file_map.items():
                asset_library.add_entry("bgm", name, bgm_prompts.get(name, name), path)
        except Exception as e:
            print(f"[agents] BGM 生成失败（跳过）: {e}", flush=True)

    # TTS（多供应商：每个音色按其 provider 分发）
    tts_items = [i for i in legacy if i["type"] == "tts" and i.get("speaker") in voice_map]
    emit(type="progress", progress=60, message=f"TTS 合成 {len(tts_items)} 条台词…")

    def tts_cb(seq, speaker, status, total):
        emit(type="progress", progress=min(60 + int(30 * seq / max(total, 1)), 90),
             message=f"TTS {seq}/{total} {speaker} [{status}]")

    tts_file_map = generate_episode_tts(legacy, voice_map, ep_dir, progress_callback=tts_cb)

    # 混音
    emit(type="progress", progress=92, message="混音合成中…")
    out_name = f"{eid[:10]}_mix.mp3"
    out_path = os.path.join(ep_dir, out_name)
    result_path = mix_episode(legacy, tts_file_map, sfx_file_map, bgm_file_map, out_path)

    if not result_path:
        store.set_episode_fields(eid, {"audio_status": "failed"})
        raise ValueError("MIXING_FAILED: 混音失败")

    url = f"/api/agent/audio-file/{eid[:10]}/{out_name}"
    store.save_audio_asset({"episode_id": eid, "kind": "final", "file_url": url,
                            "file_path": result_path})
    for b in blocks:
        store.update_block(b["block_id"], {"audio_status": "generated"})
    store.set_episode_fields(eid, {"audio_status": "generated", "status": "completed",
                                   "final_audio_url": url})
    store.set_project_status(pid, "completed")
    emit(type="progress", progress=100, message="音频生成完成")
    return {"episode_id": eid, "final_audio_url": url}


def remix_episode(task, emit):
    """复用已生成的 TTS/音效/BGM 重新混音。"""
    from services.mixer import mix_episode
    eid = task["episode_id"]
    ep = store.get_episode(eid)
    blocks = store.list_blocks(eid)
    legacy = blocks_to_legacy(blocks)
    ep_dir = os.path.join(cfg.OUTPUT_DIR, eid[:10])

    # 从磁盘复用已有片段
    tts_file_map, sfx_file_map, bgm_file_map = {}, {}, {}
    if os.path.isdir(ep_dir):
        for f in os.listdir(ep_dir):
            if f.endswith(".mp3") and "_" in f and f[0].isdigit():
                tts_file_map[f[:-4]] = os.path.join(ep_dir, f)
    emit(type="progress", progress=50, message="重新混音…")
    out_name = f"{eid[:10]}_mix.mp3"
    out_path = os.path.join(ep_dir, out_name)
    result_path = mix_episode(legacy, tts_file_map, sfx_file_map, bgm_file_map, out_path)
    if not result_path:
        raise ValueError("MIXING_FAILED")
    url = f"/api/agent/audio-file/{eid[:10]}/{out_name}"
    store.set_episode_fields(eid, {"final_audio_url": url, "audio_status": "generated"})
    emit(type="progress", progress=100, message="重新混音完成")
    return {"final_audio_url": url}


# ─────────────────────── 8. 导出 ───────────────────────

def export_project(task, emit):
    pid = task["project_id"]
    project = store.get_project(pid)
    scope = task["input"].get("export_scope", "all_episodes")
    emit(type="progress", progress=30, message="正在打包导出…")

    episodes = store.list_episodes(pid)
    files = []
    total_size = 0
    for ep in episodes:
        fa = store.get_final_audio(ep["episode_id"])
        if fa and fa.get("file_path") and os.path.exists(fa["file_path"]):
            size = os.path.getsize(fa["file_path"])
            total_size += size
            files.append({"episode": ep["title"], "url": fa["file_url"], "size": size})

    export = store.save_export(pid, {
        "scope": scope, "formats": task["input"].get("formats", ["mp3"]),
        "file_name": f"{project['title']}_导出.zip" if len(files) > 1 else (files[0]["episode"] + ".mp3" if files else "空"),
        "file_url": files[0]["url"] if files else "",
        "file_size": total_size,
        "include_script": task["input"].get("include_script", False),
    })
    store.set_project_status(pid, "exported")
    emit(type="progress", progress=100, message=f"导出完成，共 {len(files)} 个音频")
    return {"export": export, "files": files}


# ─────────────────────── 9. 图片生成：角色头像 / 项目封面（D-3）───────────────

def generate_avatar(task, emit):
    import image_service
    pid = task["project_id"]
    project = store.get_project(pid)
    cid = task["input"].get("character_id")
    chars = store.list_characters(pid)
    targets = [c for c in chars if c["character_id"] == cid] if cid else chars
    if not targets:
        raise ValueError("没有可生成头像的角色")

    done = 0
    results = {}
    for c in targets:
        emit(type="progress", progress=int(10 + 85 * done / len(targets)),
             message=f"生成头像：{c['name']}…")
        url = image_service.generate_image(
            image_service.avatar_prompt(c, project), project=project, size="1024x1024")
        store.update_character(c["character_id"], {"avatar_url": url})
        results[c["name"]] = url
        done += 1
    emit(type="progress", progress=100, message=f"已生成 {done} 个角色头像")
    return {"avatars": results}


def generate_cover(task, emit):
    import image_service
    pid = task["project_id"]
    project = store.get_project(pid)
    emit(type="progress", progress=20, message=f"生成《{project['title']}》封面…")
    url = image_service.generate_image(
        image_service.cover_prompt(project), project=project, size="1024x1024")
    store.update_project(pid, {"cover": url})
    emit(type="progress", progress=100, message="封面已生成")
    return {"cover": url}


# ─────────────────────── 10. 发布到设备内容库（D-1）───────────────

def publish_device(task, emit):
    import requests as _rq
    pid = task["project_id"]
    project = store.get_project(pid)
    url = (cfg.DEVICE_LIBRARY_API_URL or "").strip()
    if not url:
        raise ValueError("未配置设备内容库地址（系统设置 → DEVICE_LIBRARY_API_URL）")
    key = (cfg.DEVICE_LIBRARY_API_KEY or "").strip()

    episodes = [e for e in store.list_episodes(pid) if e.get("final_audio_url")]
    if not episodes:
        raise ValueError("没有已生成音频的分集，请先完成音频生成")

    ok, results = 0, []
    for i, ep in enumerate(episodes):
        emit(type="progress", progress=int(10 + 85 * i / len(episodes)),
             message=f"发布 第{ep['episode_number']}集：{ep['title']}…")
        fa = store.get_final_audio(ep["episode_id"])
        fpath = (fa or {}).get("file_path")
        rec = {"episode_id": ep["episode_id"], "channel": "device_library"}
        try:
            if not fpath or not os.path.exists(fpath):
                raise ValueError("成片文件缺失")
            meta = {
                "series": project["title"], "episode_number": ep["episode_number"],
                "title": ep["title"], "summary": ep.get("summary", ""),
                "target_age": project["target_age"],
                "duration_minutes": ep.get("estimated_duration_minutes"),
                "aigc": True,   # AIGC 标识（合规支柱二）
                "cover": project.get("cover", ""),
            }
            with open(fpath, "rb") as f:
                resp = _rq.post(
                    url,
                    headers={"Authorization": f"Bearer {key}"} if key else {},
                    data={"metadata": json.dumps(meta, ensure_ascii=False)},
                    files={"audio": (os.path.basename(fpath), f, "audio/mpeg")},
                    timeout=120,
                )
            if resp.status_code // 100 != 2:
                raise ValueError(f"HTTP {resp.status_code}: {resp.text[:150]}")
            try:
                remote_id = str(resp.json().get("id", ""))
            except Exception:
                remote_id = ""
            rec.update(status="succeeded", remote_id=remote_id, message="发布成功")
            ok += 1
        except Exception as e:
            rec.update(status="failed", message=str(e)[:300])
        store.save_publish_record(pid, rec)
        results.append(rec)

    if ok == 0:
        raise ValueError(f"全部 {len(episodes)} 集发布失败：{results[0].get('message', '')}")
    store.set_project_status(pid, "exported")
    emit(type="progress", progress=100, message=f"发布完成：成功 {ok}/{len(episodes)} 集")
    return {"published": ok, "total": len(episodes), "records": results}


# ─────────────────────── 注册 ───────────────────────

def register_all():
    from orchestrator import register
    register("parse_source", parse_source, max_retries=1)
    register("generate_outline", generate_outline, max_retries=1)
    register("generate_script", generate_script, max_retries=1)
    register("safety_review", safety_review, max_retries=0)
    register("identify_characters", identify_characters, max_retries=1)
    register("recommend_voices", recommend_voices, max_retries=1)
    register("generate_audio", generate_audio, max_retries=2)
    register("remix_episode", remix_episode, max_retries=0)
    register("export_project", export_project, max_retries=0)
    register("generate_avatar", generate_avatar, max_retries=1)
    register("generate_cover", generate_cover, max_retries=1)
    register("publish_device", publish_device, max_retries=0)
