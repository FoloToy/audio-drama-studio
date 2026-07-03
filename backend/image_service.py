"""
图片生成服务（D-3）：角色头像、故事集封面等。
两个供应商共用 OpenAI 兼容的 /images/generations 协议：
- openai：OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_IMAGE_MODEL（gpt-image / DALL·E 及兼容代理）
- ark：  火山方舟 ARK_BASE_URL + ARK_API_KEY + ARK_IMAGE_MODEL（豆包 Seedream）
生成结果落盘 assets/images/，经 /api/images/<file> 访问。
"""

import os
import uuid
import base64
import requests

import config
import providers as prov


def _endpoint(provider: str) -> tuple[str, str, str]:
    """→ (url, key, model)；未配置时抛出带引导的错误。"""
    if provider == "ark":
        key = (config.ARK_API_KEY or "").strip()
        if not key:
            raise ValueError("火山方舟未配置 ARK_API_KEY（系统设置 → 图片生成）")
        return (config.ARK_BASE_URL.rstrip("/") + "/images/generations", key,
                config.ARK_IMAGE_MODEL)
    key = (config.OPENAI_API_KEY or "").strip()
    if not key:
        raise ValueError("OpenAI 兼容供应商未配置 OPENAI_API_KEY（系统设置 → 图片生成）")
    return (config.OPENAI_BASE_URL.rstrip("/") + "/images/generations", key,
            config.OPENAI_IMAGE_MODEL)


def generate_image(prompt: str, provider: str = None, size: str = "1024x1024",
                   project: dict = None) -> str:
    """生成图片，返回可访问的相对 URL（/api/images/xxx.png）。失败抛异常。"""
    pid = provider or prov.resolve("image", project)
    url, key, model = _endpoint(pid)
    print(f"[IMAGE] provider={pid} model={model}", flush=True)

    body = {"model": model, "prompt": prompt, "size": size, "n": 1,
            "response_format": "b64_json"}
    resp = requests.post(url, headers={"Authorization": f"Bearer {key}",
                                       "Content-Type": "application/json"},
                         json=body, timeout=120)
    if resp.status_code != 200:
        raise ValueError(f"图片生成失败 HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json().get("data") or []
    if not data:
        raise ValueError("图片生成返回空结果")

    item = data[0]
    if item.get("b64_json"):
        img_bytes = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        dl = requests.get(item["url"], timeout=60)
        dl.raise_for_status()
        img_bytes = dl.content
    else:
        raise ValueError("图片生成返回格式异常")

    fname = f"{uuid.uuid4().hex[:16]}.png"
    fpath = os.path.join(config.IMAGES_DIR, fname)
    with open(fpath, "wb") as f:
        f.write(img_bytes)
    print(f"[IMAGE] 已保存 {fname} ({len(img_bytes)//1024}KB)", flush=True)
    return f"/api/images/{fname}"


# ── 领域提示词模板 ─────────────────────────────────────────────

def avatar_prompt(character: dict, project: dict = None) -> str:
    name = character.get("name", "角色")
    personality = character.get("personality", "")
    age_feel = {"childlike": "儿童", "young": "少年", "adult": "成年", "elder": "年长"}.get(
        character.get("age_feel", ""), "")
    story = (project or {}).get("title", "")
    return (f"儿童绘本风格的角色头像插画：{name}，{age_feel}{('，' + personality) if personality else ''}。"
            f"{('出自故事《' + story + '》。') if story else ''}"
            "圆形头像构图，居中正面半身像，明亮温暖的色彩，柔和光线，可爱亲切，"
            "干净的纯色背景，高质量儿童插画，无文字无水印")


def cover_prompt(project: dict) -> str:
    title = project.get("title", "儿童故事")
    desc = project.get("description", "")
    age = project.get("target_age", "")
    return (f"儿童音频故事专辑封面插画：《{title}》。{desc}"
            f"{('适合 ' + age + ' 岁儿童。') if age else ''}"
            "儿童绘本风格，构图饱满有故事感，明亮鲜艳的色彩，温暖治愈，"
            "适合作为故事集封面，高质量插画，无文字无水印")
