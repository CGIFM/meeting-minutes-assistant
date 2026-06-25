import json
import os
import re
import sqlite3
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import httpx
from db.database import get_db, get_setting, set_setting
from services.prompt_templates import DEFAULT_MEETING_MINUTES_PROMPT

router = APIRouter()


def find_cc_switch_config() -> dict:
    """从 CC switch 数据库读取当前激活的 Claude provider 配置"""
    home = Path.home()
    db_path = home / ".cc-switch" / "cc-switch.db"
    if not db_path.exists():
        return {}

    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        # 优先取 claude 应用类型里 is_current=1 的
        cur.execute(
            "SELECT settings_config FROM providers WHERE app_type='claude' AND is_current=1 LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                "SELECT settings_config FROM providers WHERE app_type='claude' ORDER BY created_at DESC LIMIT 1"
            )
            row = cur.fetchone()
        conn.close()

        if row and row[0]:
            config = json.loads(row[0])
            env = config.get("env", {}) or {}
            token = env.get("ANTHROPIC_AUTH_TOKEN", "") or env.get("ANTHROPIC_API_KEY", "")
            base_url = env.get("ANTHROPIC_BASE_URL", "")
            if token and token != "PROXY_MANAGED":
                return {"api_key": token, "base_url": base_url}
    except Exception:
        pass
    return {}


def find_claude_code_api_key() -> str:
    """从环境变量或 CC switch 读取 API Key"""
    env_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
    if env_key and env_key != "PROXY_MANAGED":
        return env_key
    cc = find_cc_switch_config()
    return cc.get("api_key", "")


class SettingsUpdate(BaseModel):
    hotwords: Optional[str] = None
    default_provider: Optional[str] = None
    default_model: Optional[str] = None
    prompt_template: Optional[str] = None
    obsidian_dir: Optional[str] = None
    export_dir: Optional[str] = None


class APIKeyUpdate(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = ""


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str = ""
    base_url: str = ""


@router.get("/settings")
async def get_settings():
    return {
        "hotwords": await get_setting("hotwords", ""),
        "default_provider": await get_setting("default_provider", "claude"),
        "default_model": await get_setting("default_model", ""),
        "prompt_template": await get_setting("prompt_template", DEFAULT_MEETING_MINUTES_PROMPT),
        "obsidian_dir": await get_setting("obsidian_dir", ""),
        "export_dir": await get_setting("export_dir", ""),
    }


@router.put("/settings")
async def update_settings(data: SettingsUpdate):
    if data.hotwords is not None:
        await set_setting("hotwords", data.hotwords)
    if data.default_provider is not None:
        await set_setting("default_provider", data.default_provider)
    if data.default_model is not None:
        await set_setting("default_model", data.default_model)
    if data.prompt_template is not None:
        await set_setting("prompt_template", data.prompt_template)
    if data.obsidian_dir is not None:
        await set_setting("obsidian_dir", data.obsidian_dir)
    if data.export_dir is not None:
        await set_setting("export_dir", data.export_dir)
    return {"status": "ok"}


@router.put("/settings/apikey")
async def update_apikey(data: APIKeyUpdate):
    await set_setting(f"apikey_{data.provider}", data.api_key)
    if data.base_url:
        await set_setting(f"baseurl_{data.provider}", data.base_url)
    return {"status": "ok"}


@router.get("/settings/apikeys")
async def get_apikeys():
    providers = ["claude", "openai", "gemini", "ollama"]
    result = {}
    for p in providers:
        key = await get_setting(f"apikey_{p}", "")
        base_url = await get_setting(f"baseurl_{p}", "")
        result[p] = {
            "configured": "***" + key[-4:] if len(key) > 4 else ("已配置" if key else ""),
            "base_url": base_url,
        }
    cc = find_cc_switch_config()
    result["claude_code_available"] = bool(cc.get("api_key"))
    result["claude_code_base_url"] = cc.get("base_url", "")
    return result


@router.post("/settings/import-claude-code-key")
async def import_claude_code_key():
    """从 CC switch 导入当前激活的 Claude 配置"""
    cc = find_cc_switch_config()
    if cc.get("api_key"):
        await set_setting("apikey_claude", cc["api_key"])
        if cc.get("base_url"):
            await set_setting("baseurl_claude", cc["base_url"])
        msg = "已导入 CC switch 的 Claude API Key"
        if cc.get("base_url"):
            msg += f"（地址: {cc['base_url']}）"
        return {"success": True, "message": msg, "base_url": cc.get("base_url", "")}
    return {"success": False, "message": "未检测到 CC switch 的 Claude 配置"}


@router.post("/settings/use-local-ccswitch")
async def use_local_ccswitch():
    """使用 CC switch 本地路由 (127.0.0.1:15721)"""
    test_url = "http://127.0.0.1:15721/v1/messages"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(test_url, json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            }, headers={"x-api-key": "cc-switch-local", "anthropic-version": "2023-06-01", "content-type": "application/json"})
            if resp.status_code in (200, 201):
                await set_setting("baseurl_claude", "http://127.0.0.1:15721")
                await set_setting("apikey_claude", "cc-switch-local")
                return {"success": True, "message": "已切换到 CC switch 本地路由 (15721)"}
            return {"success": False, "message": f"本地路由响应 {resp.status_code}"}
    except Exception as e:
        return {"success": False, "message": f"无法连接 15721: {e}"}


@router.get("/settings/check-local-ccswitch")
async def check_local_ccswitch():
    """检测 CC switch 本地路由是否可用"""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.post("http://127.0.0.1:15721/v1/messages", json={
                "model": "claude-sonnet-4-20250514", "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            }, headers={"x-api-key": "test", "anthropic-version": "2023-06-01"})
            return {"available": resp.status_code in (200, 201)}
    except Exception:
        return {"available": False}


@router.post("/settings/test-connection")
async def test_connection(data: TestConnectionRequest):
    """测试 LLM 连接是否正常"""
    api_key = data.api_key or await get_setting(f"apikey_{data.provider}", "")
    base_url = data.base_url or await get_setting(f"baseurl_{data.provider}", "")

    if not api_key and data.provider != "ollama":
        return {"success": False, "message": "未配置 API Key"}

    try:
        if data.provider == "claude":
            url = (base_url or "https://api.anthropic.com").rstrip("/") + "/v1/messages"
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
            body = {"model": "claude-sonnet-4-20250514", "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}]}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=body, headers=headers)
                if resp.status_code in (200, 201):
                    return {"success": True, "message": "连接成功"}
                elif resp.status_code == 401:
                    return {"success": False, "message": "API Key 无效"}
                else:
                    return {"success": False, "message": f"HTTP {resp.status_code}"}

        elif data.provider == "openai":
            url = (base_url or "https://api.openai.com/v1") + "/models"
            headers = {"Authorization": f"Bearer {api_key}"}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    return {"success": True, "message": "连接成功"}
                elif resp.status_code == 401:
                    return {"success": False, "message": "API Key 无效"}
                else:
                    return {"success": False, "message": f"HTTP {resp.status_code}"}

        elif data.provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return {"success": True, "message": "连接成功"}
                else:
                    return {"success": False, "message": f"HTTP {resp.status_code}"}

        elif data.provider == "ollama":
            url = (base_url or "http://localhost:11434") + "/api/tags"
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return {"success": True, "message": "连接成功"}
                else:
                    return {"success": False, "message": f"HTTP {resp.status_code}"}

    except httpx.ConnectError:
        return {"success": False, "message": "无法连接到服务"}
    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.post("/settings/list-models")
async def list_models(data: TestConnectionRequest):
    """获取可用模型列表"""
    api_key = data.api_key or await get_setting(f"apikey_{data.provider}", "")
    base_url = data.base_url or await get_setting(f"baseurl_{data.provider}", "")

    try:
        if data.provider == "claude":
            return {"models": [
                "claude-sonnet-4-20250514",
                "claude-opus-4-20250514",
                "claude-haiku-4-5-20251001",
                "claude-3-5-sonnet-20241022",
            ]}

        elif data.provider == "openai":
            url = (base_url or "https://api.openai.com/v1") + "/models"
            headers = {"Authorization": f"Bearer {api_key}"}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data_resp = resp.json()
                    models = sorted([m["id"] for m in data_resp.get("data", [])])
                    chat_models = [m for m in models if any(k in m for k in ["gpt", "o1", "o3", "chatgpt"])]
                    return {"models": chat_models[:20] if chat_models else models[:20]}
                return {"models": []}

        elif data.provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data_resp = resp.json()
                    models = [m["name"].replace("models/", "") for m in data_resp.get("models", []) if "generateContent" in str(m.get("supportedGenerationMethods", []))]
                    return {"models": models[:20]}
                return {"models": []}

        elif data.provider == "ollama":
            url = (base_url or "http://localhost:11434") + "/api/tags"
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data_resp = resp.json()
                    models = [m["name"] for m in data_resp.get("models", [])]
                    return {"models": models}
                return {"models": []}

    except Exception:
        return {"models": []}


@router.get("/meetings")
async def list_meetings():
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, filename, duration, created_at FROM meetings ORDER BY created_at DESC LIMIT 50"
    )
    rows = await cursor.fetchall()
    await db.close()
    return [dict(row) for row in rows]


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
    row = await cursor.fetchone()

    chat_cursor = await db.execute(
        "SELECT role, content, created_at FROM chat_history WHERE meeting_id = ? ORDER BY created_at",
        (meeting_id,),
    )
    chats = await chat_cursor.fetchall()
    await db.close()

    if not row:
        return {"error": "会议不存在"}

    import json as _json
    data = dict(row)
    # segments 存的是 JSON 字符串，反序列化为数组
    seg_str = data.get("segments")
    segments: list = []
    if isinstance(seg_str, str) and seg_str:
        try:
            segments = _json.loads(seg_str)
        except Exception:
            segments = []

    # 历史数据兜底：segments 为空但 transcript 有内容时，从 transcript 反解析
    if not segments and data.get("transcript"):
        segments = _parse_segments_from_transcript(data["transcript"])
        if segments:
            # 写回 DB，下次直接命中
            try:
                dbw = await get_db()
                await dbw.execute(
                    "UPDATE meetings SET segments = ?, updated_at = datetime('now') WHERE id = ?",
                    (_json.dumps(segments, ensure_ascii=False), meeting_id),
                )
                await dbw.commit()
                await dbw.close()
            except Exception:
                pass

    data["segments"] = segments
    return {**data, "chat_history": [dict(c) for c in chats]}


def _parse_segments_from_transcript(text: str) -> list:
    """从 '[mm:ss] 说话人N: 文本' 格式的转录文本解析 segments。
    支持 [m:ss] / [mm:ss] / [h:mm:ss]。
    """
    out = []
    pat = re.compile(r"\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([^:\n]+?)\s*:\s*(.+)")
    for line in (text or "").splitlines():
        m = pat.match(line.strip())
        if not m:
            continue
        a, b, c, speaker, body = m.groups()
        if c is not None:
            seconds = int(a) * 3600 + int(b) * 60 + int(c)
        elif int(a) >= 60:
            seconds = int(a) * 60 + int(b)
        else:
            seconds = int(a) * 60 + int(b)
        out.append({
            "start": seconds,
            "end": seconds,
            "speaker": speaker.strip(),
            "text": body.strip(),
        })
    return out
