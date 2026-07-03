"""
SQLite 持久化层 —— Agent 平台的地基。
13 张表对齐 PRD §10 / §5 数据模型。单文件零运维，后续可平滑迁移 Postgres。
"""

import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).parent / "agent_platform.db"

# 写操作串行化，避免 SQLite "database is locked"
_write_lock = threading.Lock()
_local = threading.local()


def get_conn() -> sqlite3.Connection:
    """每线程一个连接（SQLite 连接不可跨线程共享）。"""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id     TEXT PRIMARY KEY,
    email       TEXT UNIQUE,
    name        TEXT,
    role        TEXT DEFAULT 'user',        -- user | admin
    created_at  TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    project_id                TEXT PRIMARY KEY,
    title                     TEXT NOT NULL,
    description               TEXT,
    project_type              TEXT,           -- adaptation | single_story | original_theme | knowledge
    source_type               TEXT,           -- text | file | topic
    target_age                TEXT,           -- 3-5 | 5-8 | 8-12
    episode_count             INTEGER DEFAULT 3,
    episode_duration_minutes  INTEGER DEFAULT 5,
    style                     TEXT,
    format                    TEXT,           -- single_narrator | narrator_plus_roles | audio_drama | bedtime_story
    faithfulness              TEXT DEFAULT 'medium',
    status                    TEXT DEFAULT 'draft',
    cover                     TEXT,
    created_by                TEXT DEFAULT 'user_001',
    created_at                TEXT,
    updated_at                TEXT
);

CREATE TABLE IF NOT EXISTS source_materials (
    source_id       TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    title           TEXT,
    raw_text        TEXT,
    selection_mode  TEXT DEFAULT 'whole',    -- whole | chapters | custom_text
    chapter_range   TEXT,                    -- e.g. "第27回-第27回"
    word_count      INTEGER DEFAULT 0,
    created_at      TEXT
);

CREATE TABLE IF NOT EXISTS source_analyses (
    analysis_id   TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    summary       TEXT,
    characters    TEXT,      -- JSON
    story_units   TEXT,      -- JSON
    safety_findings TEXT,    -- JSON
    adaptation_suggestions TEXT, -- JSON
    suitable      INTEGER DEFAULT 1,
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS episodes (
    episode_id                TEXT PRIMARY KEY,
    project_id                TEXT NOT NULL,
    episode_number            INTEGER,
    title                     TEXT,
    summary                   TEXT,
    hook                      TEXT,
    main_conflict             TEXT,
    characters                TEXT,      -- JSON array of names
    emotional_curve           TEXT,      -- JSON
    educational_value         TEXT,
    cliffhanger               TEXT,
    risk_level                TEXT DEFAULT 'low',
    estimated_duration_minutes INTEGER DEFAULT 5,
    locked                    INTEGER DEFAULT 0,
    status                    TEXT DEFAULT 'outline_review',
    review_status             TEXT DEFAULT 'pending',   -- pending | approved
    audio_status              TEXT DEFAULT 'none',
    final_audio_url           TEXT,
    created_at                TEXT,
    updated_at                TEXT
);

CREATE TABLE IF NOT EXISTS characters (
    character_id  TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    name          TEXT,
    role_type     TEXT,       -- main_character | supporting | narrator | animal | elder
    personality   TEXT,
    age_feel      TEXT,
    voice_suggestion TEXT,
    appears_in_episodes TEXT, -- JSON
    lines_count   INTEGER DEFAULT 0,
    locked        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS script_blocks (
    block_id       TEXT PRIMARY KEY,
    episode_id     TEXT NOT NULL,
    "order"        INTEGER,
    type           TEXT,       -- narration | dialogue | sfx | bgm | pause | transition
    character_id   TEXT,
    character_name TEXT,       -- 冗余存名字，便于前端与 TTS
    text           TEXT,
    emotion        TEXT,
    speed          TEXT,       -- slow | medium | fast
    pause_after_ms INTEGER DEFAULT 0,
    voice_id       TEXT,
    sfx_id         TEXT,
    bgm_id         TEXT,
    bgm_action     TEXT,       -- start | stop（仅 type=bgm）
    duration_ms    INTEGER,
    review_status  TEXT DEFAULT 'pending',
    audio_status   TEXT DEFAULT 'none',      -- none | generating | generated | stale | failed
    locked         INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS safety_findings (
    finding_id    TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    episode_id    TEXT,
    block_id      TEXT,
    risk_type     TEXT,
    risk_level    TEXT,        -- low | medium | high | blocked
    text          TEXT,
    reason        TEXT,
    suggestion    TEXT,
    resolved      INTEGER DEFAULT 0,
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS voices (
    voice_id           TEXT PRIMARY KEY,
    name               TEXT,
    gender_feel        TEXT,   -- male | female | neutral
    age_feel           TEXT,   -- childlike | young | adult | elder
    tone               TEXT,
    style_tags         TEXT,   -- JSON
    supported_emotions TEXT,   -- JSON
    license_status     TEXT DEFAULT 'system_authorized',
    commercial_use     INTEGER DEFAULT 1,
    sample_url         TEXT,
    enabled            INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS voice_bindings (
    binding_id    TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    character_id  TEXT NOT NULL,
    voice_id      TEXT NOT NULL,
    locked        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audio_assets (
    audio_id     TEXT PRIMARY KEY,
    episode_id   TEXT NOT NULL,
    block_id     TEXT,
    file_url     TEXT,
    file_path    TEXT,
    duration_ms  INTEGER,
    kind         TEXT,       -- block | final
    status       TEXT DEFAULT 'completed',
    created_at   TEXT
);

CREATE TABLE IF NOT EXISTS exports (
    export_id    TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    scope        TEXT,
    formats      TEXT,       -- JSON
    file_name    TEXT,
    file_url     TEXT,
    file_size    INTEGER,
    duration_ms  INTEGER,
    include_script INTEGER DEFAULT 0,
    created_at   TEXT
);

CREATE TABLE IF NOT EXISTS agent_tasks (
    task_id      TEXT PRIMARY KEY,
    project_id   TEXT,
    episode_id   TEXT,
    task_type    TEXT,
    status       TEXT DEFAULT 'pending',   -- pending | running | succeeded | failed | cancelled
    progress     INTEGER DEFAULT 0,
    message      TEXT,
    input        TEXT,       -- JSON
    result       TEXT,       -- JSON
    error        TEXT,       -- JSON
    created_at   TEXT,
    updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS style_templates (
    style_id      TEXT PRIMARY KEY,
    name          TEXT,
    description   TEXT,
    suitable_age  TEXT,
    language_feat TEXT,
    pace_feat     TEXT,
    narration_ratio TEXT,
    dialogue_ratio  TEXT,
    forbidden     TEXT,      -- JSON
    sample        TEXT,
    enabled       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS safety_rules (
    rule_id       TEXT PRIMARY KEY,
    name          TEXT,
    risk_type     TEXT,
    suitable_age  TEXT,
    risk_level    TEXT,
    description   TEXT,
    sample_text   TEXT,
    suggestion    TEXT,
    enabled       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT
);

CREATE TABLE IF NOT EXISTS publish_records (
    publish_id   TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    episode_id   TEXT,
    channel      TEXT DEFAULT 'device_library',
    status       TEXT DEFAULT 'pending',   -- pending | succeeded | failed
    remote_id    TEXT,
    message      TEXT,
    created_at   TEXT
);
"""

# 需要增量迁移的列：{表: [(列名, 列定义)]}
_MIGRATIONS = {
    "voices": [("provider", "TEXT DEFAULT 'doubao'")],
    "characters": [("avatar_url", "TEXT")],
    "projects": [
        ("llm_provider", "TEXT"), ("tts_provider", "TEXT"),
        ("music_provider", "TEXT"), ("sfx_provider", "TEXT"), ("image_provider", "TEXT"),
    ],
}


def _migrate(conn):
    for table, cols in _MIGRATIONS.items():
        existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for col, ddl in cols:
            if col not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                print(f"[db] 迁移: {table}.{col} 已添加", flush=True)
    conn.commit()


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
    _migrate(conn)
    _seed()
    apply_settings_overlay()


# ─────────────────────── 配置存储（DB 为准，.env 仅首次播种）───────────────────

def set_config(key: str, value: str):
    """写入 DB 并热更新 config 模块 + 环境变量。"""
    import config as _cfg
    conn = get_conn()
    with _write_lock:
        conn.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)",
                     (f"cfg_{key}", value))
        conn.commit()
    setattr(_cfg, key, value)
    import os as _os
    _os.environ[key] = value or ""


def apply_settings_overlay():
    """
    启动时执行：
    - DB 已有该键 → 用 DB 值覆盖 config（DB 是配置的唯一事实来源）
    - DB 没有该键 → 把 .env/默认值播种进 DB（仅首次）
    """
    import os as _os
    import config as _cfg
    conn = get_conn()
    seeded, loaded = 0, 0
    for k in _cfg.CONFIG_KEYS:
        r = conn.execute("SELECT value FROM app_settings WHERE key=?", (f"cfg_{k}",)).fetchone()
        if r is None:
            v = getattr(_cfg, k, "") or ""
            with _write_lock:
                conn.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)",
                             (f"cfg_{k}", v))
                conn.commit()
            seeded += 1
        else:
            v = r["value"] or ""
            setattr(_cfg, k, v)
            _os.environ[k] = v
            loaded += 1
    print(f"[db] 配置 overlay：DB 加载 {loaded} 项，播种 {seeded} 项", flush=True)


def _seed():
    """种子数据：默认用户 + 从现有音色库导入 voices 表。"""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    with _write_lock:
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id,email,name,role,created_at) VALUES(?,?,?,?,?)",
            ("user_001", "creator@example.com", "创作者小明", "admin", now),
        )
        # 若 voices 表为空，从 assets/voices.json 导入
        cur = conn.execute("SELECT COUNT(*) AS c FROM voices").fetchone()
        if cur["c"] == 0:
            try:
                from services import voice_library
                for v in voice_library.get_voices():
                    desc = v.get("description", "")
                    gender = "female" if "女" in desc or "female" in v["voice_id"] else (
                        "male" if "男" in desc or "male" in v["voice_id"] else "neutral")
                    age = "childlike" if ("童" in desc or "儿" in desc or "少儿" in v["voice_id"]) else (
                        "elder" if "老" in desc else "adult")
                    conn.execute(
                        """INSERT OR IGNORE INTO voices
                           (voice_id,name,gender_feel,age_feel,tone,style_tags,supported_emotions,
                            license_status,commercial_use,sample_url,enabled)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                        (v["voice_id"], v["name"], gender, age, desc, "[]",
                         '["neutral","warm","happy"]', "system_authorized", 1,
                         f"/api/voices/{v['voice_id']}/preview" if v.get("has_preview") else "", 1),
                    )
            except Exception as e:
                print(f"[db] voices 导入跳过: {e}", flush=True)

        # 种子：MiniMax / ElevenLabs 预置音色（voice = provider + provider_voice_id，D-2）
        # 仅当该 provider 尚无音色时插入；实际可用性取决于对应 API Key 是否已配置
        _PRESET_VOICES = [
            # (voice_id, name, gender, age, tone, provider)
            ("clever_boy",         "聪明男童",   "male",   "childlike", "机灵活泼的小男孩声，适合儿童主角",       "minimax"),
            ("lovely_girl",        "可爱女孩",   "female", "childlike", "甜美可爱的小女孩声，适合儿童角色",       "minimax"),
            ("audiobook_female_1", "有声书女声", "female", "adult",     "温暖沉稳的讲述女声，适合旁白",           "minimax"),
            ("audiobook_male_1",   "有声书男声", "male",   "adult",     "浑厚清晰的讲述男声，适合旁白/长者",      "minimax"),
            ("21m00Tcm4TlvDq8ikWAM", "Rachel",  "female", "adult",     "Warm multilingual female voice",        "elevenlabs"),
            ("pNInz6obpgDQGcFmaJgB", "Adam",    "male",   "adult",     "Deep multilingual male voice",          "elevenlabs"),
        ]
        for vid, name, g, a, tone, prov in _PRESET_VOICES:
            exists = conn.execute("SELECT 1 FROM voices WHERE voice_id=?", (vid,)).fetchone()
            if not exists:
                conn.execute(
                    """INSERT INTO voices(voice_id,name,gender_feel,age_feel,tone,style_tags,
                       supported_emotions,license_status,commercial_use,sample_url,enabled,provider)
                       VALUES(?,?,?,?,?,'[]','["neutral","warm","happy"]','system_authorized',1,'',1,?)""",
                    (vid, name, g, a, tone, prov))

        # 种子：风格模板
        if conn.execute("SELECT COUNT(*) AS c FROM style_templates").fetchone()["c"] == 0:
            styles = [
                ("sunjingxiu", "孙敬修风格", "亲切生动，口语化讲述，像长辈讲故事", "5-12", "亲切、画面感强", "慢，有停顿", "高", "中", '["夸张吵闹","成人化表达"]', "小朋友们，今天我们来讲一个有趣的故事……"),
                ("classic_children_radio", "经典儿童广播故事风", "标准广播剧质感，旁白清晰，角色分明", "5-12", "标准、清晰", "适中", "中", "高", '["血腥","恐怖"]', "在很久很久以前……"),
                ("bedtime", "睡前陪伴风", "低刺激、温柔、慢节奏，帮助入睡", "3-8", "轻柔、简单", "很慢", "高", "低", '["紧张刺激","突然的声响"]', "闭上眼睛，让我们一起进入梦乡……"),
                ("adventure_comedy", "冒险喜剧风", "活泼幽默、节奏明快、充满冒险张力", "5-12", "活泼、幽默", "快", "中", "高", '["粗俗玩笑"]', "哇！前面有一座神秘的大山！"),
                ("guoxue", "国学启蒙风", "典雅从容，富有文化韵味，寓教于乐", "6-12", "典雅、有韵味", "适中", "中", "中", '["晦涩难懂"]', "子曰：学而时习之，不亦说乎？"),
                ("gentle_healing", "温柔治愈风", "温暖抚慰、情绪正向，传递善意与勇气", "3-10", "温暖、正向", "慢", "高", "中", '["消极价值观"]', "没关系的，每个人都会慢慢长大……"),
            ]
            for s in styles:
                conn.execute("""INSERT OR IGNORE INTO style_templates
                    (style_id,name,description,suitable_age,language_feat,pace_feat,narration_ratio,dialogue_ratio,forbidden,sample,enabled)
                    VALUES(?,?,?,?,?,?,?,?,?,?,1)""", s)

        # 种子：儿童安全规则（对齐 PRD §8.1 风险类型）
        if conn.execute("SELECT COUNT(*) AS c FROM safety_rules").fetchone()["c"] == 0:
            rules = [
                ("暴力描写", "violence", "3-12", "high", "打斗、伤害、战争等暴力内容", "打得头破血流", "改为：大家遇到了很大的困难"),
                ("恐怖惊吓", "horror", "3-12", "high", "恐怖、惊悚、吓人的描写", "鬼影在黑暗中扑来", "改为：夜里有点黑，但很快就亮了"),
                ("死亡表达", "death_expression", "3-8", "medium", "不适合低龄儿童的死亡描写", "他死了", "改为：他永远地睡着了/离开了"),
                ("成人化内容", "adult_content", "3-12", "high", "成人化、权谋、复杂阴谋", "尔虞我诈的权力斗争", "改为：大家在想办法解决问题"),
                ("粗口脏话", "bad_language", "3-12", "medium", "粗俗、脏话、辱骂用语", "你这个混蛋", "改为：你怎么可以这样呢"),
                ("危险行为", "dangerous_behavior", "3-12", "high", "鼓励模仿的危险行为", "他爬上高压电塔", "改为：这样做很危险，我们不要模仿"),
                ("消极价值观", "negative_values", "3-12", "medium", "消极、负面的价值导向", "努力也没用", "改为：只要不放弃，就有希望"),
                ("过度迷信", "superstition", "6-12", "low", "过度迷信、封建糟粕", "烧香就能保平安", "弱化处理，突出智慧与勇气"),
            ]
            for r in rules:
                conn.execute("""INSERT OR IGNORE INTO safety_rules
                    (rule_id,name,risk_type,suitable_age,risk_level,description,sample_text,suggestion,enabled)
                    VALUES(?,?,?,?,?,?,?,?,1)""", (f"rule_{r[1]}", *r))

        conn.commit()
    print("[db] SQLite 初始化完成:", DB_PATH, flush=True)
