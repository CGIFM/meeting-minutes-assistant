import uuid
import asyncio
import shutil
import logging
import traceback
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from services.asr_engine import get_engine
from services.audio_processor import convert_to_wav, is_supported, get_audio_duration
from db.database import get_db, get_setting

router = APIRouter()
logger = logging.getLogger("meeting-minutes.transcribe")

DATA_DIR = Path.home() / "Library" / "Application Support" / "meeting-minutes-assistant" / "audio"
DATA_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict[str, dict] = {}


@router.get("/audio")
async def get_audio_file(job_id: str, filename: str):
    """提供原始音频文件用于播放"""
    audio_dir = DATA_DIR / job_id
    if not audio_dir.exists():
        raise HTTPException(status_code=404, detail="会议不存在")
    file_path = audio_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(str(file_path))


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """删除会议：数据库记录 + 聊天记录 + 音频文件"""
    db = await get_db()
    await db.execute("DELETE FROM chat_history WHERE meeting_id = ?", (meeting_id,))
    await db.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
    await db.commit()
    await db.close()
    audio_dir = DATA_DIR / meeting_id
    if audio_dir.exists():
        shutil.rmtree(audio_dir, ignore_errors=True)
    _jobs.pop(meeting_id, None)
    return {"success": True}


@router.patch("/meetings/{meeting_id}")
async def rename_meeting(meeting_id: str, payload: dict = {}):
    """重命名会议（更新 filename 字段）"""
    new_name = (payload.get("filename") or "").strip()
    if not new_name:
        return {"success": False, "message": "文件名不能为空"}
    db = await get_db()
    cursor = await db.execute("SELECT id, filename FROM meetings WHERE id = ?", (meeting_id,))
    row = await cursor.fetchone()
    if not row:
        await db.close()
        return {"success": False, "message": "会议不存在"}
    old_filename = row["filename"] or ""
    # 没显式给扩展名时，沿用旧扩展名
    if "." not in Path(new_name).name and "." in old_filename:
        new_name = new_name + Path(old_filename).suffix
    await db.execute("UPDATE meetings SET filename = ?, updated_at = datetime('now') WHERE id = ?", (new_name, meeting_id))
    await db.commit()
    await db.close()
    return {"success": True, "filename": new_name}


@router.delete("/meetings/{meeting_id}/chat")
async def clear_chat(meeting_id: str):
    """清空某次会议的对话历史（用于"重生成"前重置）"""
    db = await get_db()
    await db.execute("DELETE FROM chat_history WHERE meeting_id = ?", (meeting_id,))
    await db.commit()
    await db.close()
    return {"success": True}


@router.put("/meetings/{meeting_id}/state")
async def update_meeting_state(meeting_id: str, payload: dict = {}):
    """通用保存：segments / transcript / minutes 任意组合。
    segments 接收数组，存为 JSON 字符串。
    """
    db = await get_db()
    cursor = await db.execute("SELECT id FROM meetings WHERE id = ?", (meeting_id,))
    if not await cursor.fetchone():
        await db.close()
        return {"success": False, "message": "会议不存在"}

    import json as _json
    sets: list[str] = []
    params: list = []
    if "segments" in payload:
        sets.append("segments = ?")
        params.append(_json.dumps(payload["segments"], ensure_ascii=False))
    if "transcript" in payload:
        sets.append("transcript = ?")
        params.append(payload["transcript"])
    if "minutes" in payload:
        sets.append("minutes = ?")
        params.append(payload["minutes"])
    if not sets:
        await db.close()
        return {"success": False, "message": "无可更新字段"}

    sets.append("updated_at = datetime('now')")
    params.append(meeting_id)
    await db.execute(f"UPDATE meetings SET {', '.join(sets)} WHERE id = ?", params)
    await db.commit()
    await db.close()
    return {"success": True}


@router.post("/transcribe")
async def start_transcription(file: UploadFile = File(...), asr_model: str = "sensevoice"):
    if not is_supported(file.filename):
        return {"error": f"不支持的格式: {file.filename}"}

    job_id = str(uuid.uuid4())
    audio_dir = DATA_DIR / job_id
    audio_dir.mkdir(parents=True, exist_ok=True)

    original_path = audio_dir / file.filename
    with open(original_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "filename": file.filename,
        "audio_path": str(original_path),
        "result": None,
        "error": None,
        "segments_so_far": [],
        "asr_model": asr_model,
    }

    asyncio.create_task(_run_transcription(job_id, str(original_path), asr_model))

    return {"job_id": job_id, "filename": file.filename}


@router.get("/asr-models")
async def list_asr_models():
    """返回可用的 ASR 模型列表"""
    from services.asr_engine import ASR_MODELS
    return {"models": [{"id": k, "name": v["name"]} for k, v in ASR_MODELS.items()]}


@router.get("/transcribe/{job_id}")
async def get_transcription(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        return {"error": "任务不存在"}
    return job


@router.websocket("/ws/transcribe/{job_id}")
async def ws_transcribe(websocket: WebSocket, job_id: str):
    await websocket.accept()
    sent_segments = 0
    try:
        while True:
            job = _jobs.get(job_id)
            if not job:
                await websocket.send_json({"type": "error", "message": "任务不存在"})
                break

            # 流式发送新识别的片段
            current_segments = job.get("segments_so_far", [])
            if len(current_segments) > sent_segments:
                for seg in current_segments[sent_segments:]:
                    await websocket.send_json({"type": "segment", "segment": seg})
                sent_segments = len(current_segments)

            if job["status"] == "processing":
                await websocket.send_json({"type": "progress", "progress": job["progress"]})
            elif job["status"] == "completed":
                await websocket.send_json({"type": "complete", "result": job["result"]})
                break
            elif job["status"] == "error":
                await websocket.send_json({"type": "error", "message": job["error"]})
                break

            await asyncio.sleep(0.3)
    except WebSocketDisconnect:
        pass


async def _run_transcription(job_id: str, audio_path: str, asr_model: str = "sensevoice"):
    logger.info("开始转录 job=%s file=%s model=%s", job_id, audio_path, asr_model)
    job = _jobs[job_id]
    job["status"] = "processing"
    job["progress"] = 0.1

    try:
        job["progress"] = 0.2
        wav_path = await asyncio.to_thread(convert_to_wav, audio_path)
        logger.info("ffmpeg 转码完成 job=%s -> %s", job_id, wav_path)

        job["progress"] = 0.3
        duration = await asyncio.to_thread(get_audio_duration, audio_path)

        hotwords = await get_setting("hotwords", "")
        hotwords_str = " ".join(hotwords.split("\n")) if hotwords else ""

        engine = get_engine()

        job["progress"] = 0.4

        def on_segment(segment, idx, total):
            job["segments_so_far"].append(segment)
            job["progress"] = 0.4 + 0.55 * ((idx + 1) / total)

        result = await asyncio.to_thread(engine.transcribe, wav_path, hotwords_str, on_segment, asr_model)
        logger.info("ASR 完成 job=%s, segments=%d, chars=%d", job_id, len(result.get("segments", [])), len(result.get("full_text", "")))

        job["status"] = "completed"
        job["progress"] = 1.0
        job["result"] = result

        import json as _json
        db = await get_db()
        await db.execute(
            "INSERT INTO meetings (id, filename, audio_path, transcript, segments, duration) VALUES (?, ?, ?, ?, ?, ?)",
            (job_id, job["filename"], audio_path, result["full_text"], _json.dumps(result.get("segments", [])), duration),
        )
        await db.commit()
        await db.close()

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        logger.error("转录失败 job=%s file=%s: %s", job_id, job.get("filename", "?"), e)
        logger.error(traceback.format_exc())
