import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from services.llm_provider import create_provider
from services.prompt_templates import DEFAULT_MEETING_MINUTES_PROMPT
from db.database import get_db, get_setting

router = APIRouter()


class SummarizeRequest(BaseModel):
    meeting_id: str
    transcript: str
    provider: str = "claude"
    model: str = ""
    custom_prompt: str = ""


@router.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            action = data.get("action")

            if action == "summarize":
                await _handle_summarize(websocket, data)
            elif action == "chat":
                await _handle_chat(websocket, data)
            else:
                await websocket.send_json({"type": "error", "message": f"未知操作: {action}"})

    except WebSocketDisconnect:
        pass


async def _handle_summarize(websocket: WebSocket, data: dict):
    transcript = data.get("transcript", "")
    provider_name = data.get("provider", "claude")
    model = data.get("model", "")
    custom_prompt = data.get("custom_prompt", "")
    meeting_id = data.get("meeting_id", "")

    api_key = await get_setting(f"apikey_{provider_name}", "")
    if not api_key and provider_name != "ollama":
        await websocket.send_json({"type": "error", "message": f"请先配置 {provider_name} 的 API Key"})
        return

    prompt_template = custom_prompt or await get_setting("prompt_template", DEFAULT_MEETING_MINUTES_PROMPT)
    prompt = prompt_template.replace("{transcript}", transcript)

    messages = [
        {"role": "system", "content": "你是一位专业的会议纪要撰写助手，擅长从语音转录文本中提取关键信息并生成结构化的会议纪要。"},
        {"role": "user", "content": prompt},
    ]

    try:
        provider = create_provider(provider_name, api_key)
        full_response = ""

        await websocket.send_json({"type": "start", "action": "summarize"})

        async for chunk in provider.stream_chat(messages, model or None):
            full_response += chunk
            await websocket.send_json({"type": "chunk", "content": chunk})

        await websocket.send_json({"type": "done", "full_content": full_response})

        if meeting_id:
            db = await get_db()
            await db.execute("UPDATE meetings SET minutes = ? WHERE id = ?", (full_response, meeting_id))
            await db.execute(
                "INSERT INTO chat_history (meeting_id, role, content) VALUES (?, ?, ?)",
                (meeting_id, "assistant", full_response),
            )
            await db.commit()
            await db.close()

    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


async def _handle_chat(websocket: WebSocket, data: dict):
    message = data.get("message", "")
    history = data.get("history", [])
    provider_name = data.get("provider", "claude")
    model = data.get("model", "")
    meeting_id = data.get("meeting_id", "")

    api_key = await get_setting(f"apikey_{provider_name}", "")
    if not api_key and provider_name != "ollama":
        await websocket.send_json({"type": "error", "message": f"请先配置 {provider_name} 的 API Key"})
        return

    messages = [
        {"role": "system", "content": "你是一位专业的会议纪要撰写助手。用户可能会要求你修改、补充或调整之前生成的会议纪要。请根据用户的要求进行调整。"},
    ] + history + [
        {"role": "user", "content": message},
    ]

    try:
        provider = create_provider(provider_name, api_key)
        full_response = ""

        await websocket.send_json({"type": "start", "action": "chat"})

        async for chunk in provider.stream_chat(messages, model or None):
            full_response += chunk
            await websocket.send_json({"type": "chunk", "content": chunk})

        await websocket.send_json({"type": "done", "full_content": full_response})

        if meeting_id:
            db = await get_db()
            await db.execute(
                "INSERT INTO chat_history (meeting_id, role, content) VALUES (?, ?, ?)",
                (meeting_id, "user", message),
            )
            await db.execute(
                "INSERT INTO chat_history (meeting_id, role, content) VALUES (?, ?, ?)",
                (meeting_id, "assistant", full_response),
            )
            await db.commit()
            await db.close()

    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
