import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from db.database import get_db, get_setting, set_setting
from services.prompt_templates import DEFAULT_MEETING_MINUTES_PROMPT

router = APIRouter()


class SettingsUpdate(BaseModel):
    hotwords: Optional[str] = None
    default_provider: Optional[str] = None
    default_model: Optional[str] = None
    prompt_template: Optional[str] = None


class APIKeyUpdate(BaseModel):
    provider: str
    api_key: str


@router.get("/settings")
async def get_settings():
    return {
        "hotwords": await get_setting("hotwords", ""),
        "default_provider": await get_setting("default_provider", "claude"),
        "default_model": await get_setting("default_model", ""),
        "prompt_template": await get_setting("prompt_template", DEFAULT_MEETING_MINUTES_PROMPT),
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
    return {"status": "ok"}


@router.put("/settings/apikey")
async def update_apikey(data: APIKeyUpdate):
    await set_setting(f"apikey_{data.provider}", data.api_key)
    return {"status": "ok"}


@router.get("/settings/apikeys")
async def get_apikeys():
    providers = ["claude", "openai", "gemini", "ollama"]
    result = {}
    for p in providers:
        key = await get_setting(f"apikey_{p}", "")
        result[p] = "***" + key[-4:] if len(key) > 4 else ("已配置" if key else "")
    return result


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

    return {**dict(row), "chat_history": [dict(c) for c in chats]}
