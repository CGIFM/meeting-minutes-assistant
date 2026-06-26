import json
from pathlib import Path as _Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from services.llm_provider import create_provider
from services.prompt_templates import DEFAULT_MEETING_MINUTES_PROMPT
from db.database import get_db, get_setting

router = APIRouter()


async def _collect_stream(provider, messages, model) -> str:
    parts: list[str] = []
    async for chunk in provider.stream_chat(messages, model):
        parts.append(chunk)
    return "".join(parts)


async def _generate_title(provider, transcript: str, model: str) -> str:
    """让 LLM 根据转录内容生成简短中文标题（≤25 字，无标点装饰）。"""
    sample = (transcript or "").strip()[:2500]
    if not sample:
        return ""
    messages = [
        {"role": "system", "content": "你是会议标题生成器。根据用户给的会议转录，输出一个简短的中文会议标题。要求：不超过 25 个汉字；不要书名号、引号、emoji；不要换行；只输出标题本身。"},
        {"role": "user", "content": sample},
    ]
    raw = await _collect_stream(provider, messages, model or None)
    title = raw.strip().splitlines()[0].strip() if raw else ""
    # 去掉常见装饰
    for ch in ['《', '》', '"', '"', '"', "'", "'", "'", "**", "#"]:
        title = title.replace(ch, "")
    return title[:25]


def normalize_messages(messages: list[dict]) -> list[dict]:
    """合并连续相同 role 的消息，确保 role 交替（Claude/GLM API 要求）"""
    if not messages:
        return messages
    result = [messages[0].copy()]
    for msg in messages[1:]:
        if msg.get("role") == result[-1].get("role"):
            # 合并到上一条
            prev = result[-1].get("content", "")
            cur = msg.get("content", "")
            sep = "\n\n" if prev and cur else ""
            result[-1]["content"] = f"{prev}{sep}{cur}"
        else:
            result.append(msg.copy())
    # 确保第一条不是 assistant（API 要求 user 开头或 system 后接 user）
    while result and result[0].get("role") == "assistant":
        result.pop(0)
    # 去除空内容消息
    result = [m for m in result if m.get("content", "").strip()]
    return result


class SummarizeRequest(BaseModel):
    meeting_id: str
    transcript: str
    provider: str = "claude"
    model: str = ""
    custom_prompt: str = ""


class GenerateTitleRequest(BaseModel):
    meeting_id: str
    provider: str = "claude"
    model: str = ""
    force: bool = False  # 强制重生（即使已有标题）


def _looks_default_filename(filename: str) -> bool:
    """判断文件名是否像默认值（录音_xxx / UUID / 纯标识符）—— 不像就保留用户起的名"""
    base = _Path(filename or "").stem
    if not base:
        return True
    return (
        base.startswith("录音_")
        or base.startswith("test_")
        or base.startswith("audio_")
        or len(base) >= 32  # UUID 长度
        or base.replace("_", "").replace("-", "").isalnum()  # 纯标识符
    )


@router.post("/generate-title")
async def generate_title_api(req: GenerateTitleRequest):
    """根据转录内容让 LLM 起一个简短标题。
    force=False 时，如果文件名看起来已是用户起的具体名字，跳过。
    """
    db = await get_db()
    cur = await db.execute("SELECT transcript, filename FROM meetings WHERE id = ?", (req.meeting_id,))
    row = await cur.fetchone()
    await db.close()
    if not row:
        raise HTTPException(status_code=404, detail="会议不存在")

    transcript = row["transcript"] or ""
    filename = row["filename"] or ""

    if not req.force and not _looks_default_filename(filename):
        return {"title": filename, "skipped": True, "reason": "已有自定义标题"}

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="转录内容为空")

    api_key = await get_setting(f"apikey_{req.provider}", "")
    base_url = await get_setting(f"baseurl_{req.provider}", "")
    if not api_key and req.provider != "ollama":
        raise HTTPException(status_code=400, detail=f"请先配置 {req.provider} 的 API Key")

    try:
        provider = create_provider(req.provider, api_key, base_url)
        title = await _generate_title(provider, transcript, req.model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"标题生成失败: {e}")

    if not title:
        return {"title": filename, "skipped": True, "reason": "生成结果为空"}

    ext = _Path(filename).suffix
    new_filename = f"{title}{ext}"
    db = await get_db()
    await db.execute(
        "UPDATE meetings SET filename = ?, updated_at = datetime('now') WHERE id = ?",
        (new_filename, req.meeting_id),
    )
    await db.commit()
    await db.close()
    return {"title": new_filename, "applied": True}


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
            elif action == "fix_transcript":
                await _handle_fix_transcript(websocket, data)
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
    base_url = await get_setting(f"baseurl_{provider_name}", "")
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
        provider = create_provider(provider_name, api_key, base_url)
        full_response = ""

        await websocket.send_json({"type": "start", "action": "summarize"})

        async for chunk in provider.stream_chat(messages, model or None):
            full_response += chunk
            await websocket.send_json({"type": "chunk", "content": chunk})

        await websocket.send_json({"type": "done", "full_content": full_response})

        if meeting_id:
            db = await get_db()
            await db.execute("UPDATE meetings SET minutes = ?, updated_at = datetime('now') WHERE id = ?", (full_response, meeting_id))
            # 把用户提示词作为 user 消息存到对话历史（方便之后查看/复用）
            user_display = (custom_prompt or "").strip() if (custom_prompt or "").strip() else "（使用默认提示词生成）"
            await db.execute(
                "INSERT INTO chat_history (meeting_id, role, content) VALUES (?, ?, ?)",
                (meeting_id, "user", f"【生成提示词】\n{user_display}"),
            )
            await db.execute(
                "INSERT INTO chat_history (meeting_id, role, content) VALUES (?, ?, ?)",
                (meeting_id, "assistant", full_response),
            )
            await db.commit()
            await db.close()

        # 自动生成会议标题（保留扩展名，避免破坏用户已改过的文件名主体）
        try:
            title = await _generate_title(provider, transcript, model)
            if title and meeting_id:
                db = await get_db()
                cur = await db.execute("SELECT filename FROM meetings WHERE id = ?", (meeting_id,))
                row = await cur.fetchone()
                if row and row["filename"]:
                    ext = _Path(row["filename"]).suffix
                    base = _Path(row["filename"]).stem
                    # 仅在文件名看起来是默认值（录音_、test_、UUID、纯日期等）时才替换
                    looks_default = (
                        base.startswith("录音_") or
                        base.startswith("test_") or
                        base.startswith("audio_") or
                        len(base) >= 32 or  # UUID 长度
                        base.replace("_", "").replace("-", "").isalnum()  # 纯标识符
                    )
                else:
                    looks_default, ext = True, ""
                new_filename = (title + ext) if looks_default else (row["filename"] if row and row["filename"] else title)
                if looks_default:
                    await db.execute("UPDATE meetings SET filename = ?, updated_at = datetime('now') WHERE id = ?", (new_filename, meeting_id))
                    await db.commit()
                await db.close()
                await websocket.send_json({"type": "title", "title": new_filename, "auto_applied": looks_default})
        except Exception as e:
            # 标题失败不影响主流程
            print(f"title generation failed: {e}", flush=True)

    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


async def _handle_chat(websocket: WebSocket, data: dict):
    message = data.get("message", "")
    history = data.get("history", [])
    provider_name = data.get("provider", "claude")
    model = data.get("model", "")
    meeting_id = data.get("meeting_id", "")

    api_key = await get_setting(f"apikey_{provider_name}", "")
    base_url = await get_setting(f"baseurl_{provider_name}", "")
    if not api_key and provider_name != "ollama":
        await websocket.send_json({"type": "error", "message": f"请先配置 {provider_name} 的 API Key"})
        return

    chat_system = (
        "你是一位专业的会议纪要撰写助手。用户正在已生成的会议纪要基础上提出修改/补充要求。\n\n"
        "## 必须遵守的准则\n"
        "1. **严格忠实原文，禁止编造**：你的所有回答都必须基于已生成的会议纪要和（如附带）转录原文。\n"
        "   - 严禁基于零散词汇脑补技术细节、流程描述、操作步骤\n"
        "   - 严禁补充未在原文中明确出现的背景、定义、解释\n"
        "   - 严禁根据常识或领域知识发挥；你是记录者，不是专家\n"
        "   - 用户要求修改时，只调整被要求的部分，不要扩展其他内容\n\n"
        "2. **格式清晰**：输出多字段时必须每个字段独立一行或独立段落，禁止把多个字段（如参会人、会议重点、议题）用空格/破折号挤在一行。\n\n"
        "3. **不确定就标注**：信息不完整或转录不清时，标注[转录不清]或[待核实]，不要编造合理化解释。\n\n"
        "4. **数字、人名、专有名词**严格保留原样，不要替换为同义词。\n\n"
        "5. 仅输出用户要求的内容，不要主动添加前言、总结或备注。"
    )

    messages = normalize_messages([
        {"role": "system", "content": chat_system},
    ] + history + [
        {"role": "user", "content": message},
    ])

    try:
        provider = create_provider(provider_name, api_key, base_url)
        full_response = ""

        await websocket.send_json({"type": "start", "action": "chat"})

        async for chunk in provider.stream_chat(messages, model or None):
            full_response += chunk
            try:
                await websocket.send_json({"type": "chunk", "content": chunk})
            except Exception:
                break

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
            # 如果对话看起来是新版完整纪要（超过 200 字），同步更新 minutes 字段
            if len(full_response) > 200:
                await db.execute("UPDATE meetings SET minutes = ?, updated_at = datetime('now') WHERE id = ?", (full_response, meeting_id))
            await db.commit()
            await db.close()

    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


async def _handle_fix_transcript(websocket, data: dict):
    """AI 修正转录文本：保留时间戳和说话人，仅修改每段文本内容。流式返回修正后的完整 MD。"""
    transcript_md = data.get("transcript", "")
    user_request = data.get("user_request", "") or ""
    provider_name = data.get("provider", "claude")
    model = data.get("model", "")
    meeting_id = data.get("meeting_id", "")

    api_key = await get_setting(f"apikey_{provider_name}", "")
    base_url = await get_setting(f"baseurl_{provider_name}", "")
    if not api_key and provider_name != "ollama":
        await websocket.send_json({"type": "error", "message": f"请先配置 {provider_name} 的 API Key"})
        return

    # 读取热词，提示 AI 优先纠正
    hotwords = await get_setting("hotwords", "")
    hotwords_hint = ""
    if hotwords.strip():
        hotwords_hint = f"\n\n【参考热词表（优先纠正为这些词）】\n{hotwords.strip()}"

    system = (
        "你是专业的语音转录文稿修正助手。基于用户的修改要求，对转录文本进行修正：\n"
        "1. 修正 ASR 识别错误（同音字、专业术语、专有名词等）\n"
        "2. 优化措辞，使语句通顺自然\n"
        "3. 应用用户指定的替换规则\n\n"
        "严格约束（违反任一条都算失败）：\n"
        "- 必须保留每段的时间戳，格式 [mm:ss] 或 [h:mm:ss]，与输入完全一致\n"
        "- 必须保留每段的说话人名\n"
        "- 必须使用与输入完全一致的格式输出每一段：**[mm:ss] 说话人:** 文本\n"
        "- 不要新增、合并、删除、重排段落；段落数量必须与输入一致\n"
        "- 不要输出任何解释、前言、总结；不要用 ```markdown 代码块包装\n"
        "- 直接输出修正后的完整文档"
    )

    default_request = "请进行初步修正：修正 ASR 识别错误，优化措辞，参考热词表纠正专有名词。保持原意不变。"
    user_msg = f"【原始转录文档】\n{transcript_md}{hotwords_hint}\n\n【我的修正要求】\n{user_request.strip() or default_request}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]

    try:
        provider = create_provider(provider_name, api_key, base_url)
        full_response = ""
        await websocket.send_json({"type": "start", "action": "fix_transcript"})
        async for chunk in provider.stream_chat(messages, model or None):
            full_response += chunk
            try:
                await websocket.send_json({"type": "chunk", "content": chunk})
            except Exception:
                break
        await websocket.send_json({"type": "done", "full_content": full_response})
        # 不写 chat_history：这是工具调用，不是会议对话
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
