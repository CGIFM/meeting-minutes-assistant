import uuid
import asyncio
import tempfile
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect
from services.asr_engine import get_engine
from services.audio_processor import convert_to_wav, is_supported, get_audio_duration
from db.database import get_db, get_setting

router = APIRouter()

DATA_DIR = Path.home() / "Library" / "Application Support" / "meeting-minutes-assistant" / "audio"
DATA_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict[str, dict] = {}


@router.post("/transcribe")
async def start_transcription(file: UploadFile = File(...)):
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
    }

    asyncio.create_task(_run_transcription(job_id, str(original_path)))

    return {"job_id": job_id, "filename": file.filename}


@router.get("/transcribe/{job_id}")
async def get_transcription(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        return {"error": "任务不存在"}
    return job


@router.websocket("/ws/transcribe/{job_id}")
async def ws_transcribe(websocket: WebSocket, job_id: str):
    await websocket.accept()
    try:
        while True:
            job = _jobs.get(job_id)
            if not job:
                await websocket.send_json({"type": "error", "message": "任务不存在"})
                break

            if job["status"] == "processing":
                await websocket.send_json({"type": "progress", "progress": job["progress"]})
            elif job["status"] == "completed":
                await websocket.send_json({"type": "complete", "result": job["result"]})
                break
            elif job["status"] == "error":
                await websocket.send_json({"type": "error", "message": job["error"]})
                break

            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


async def _run_transcription(job_id: str, audio_path: str):
    job = _jobs[job_id]
    job["status"] = "processing"
    job["progress"] = 0.1

    try:
        job["progress"] = 0.2
        wav_path = await asyncio.to_thread(convert_to_wav, audio_path)

        job["progress"] = 0.3
        duration = await asyncio.to_thread(get_audio_duration, audio_path)

        hotwords = await get_setting("hotwords", "")
        engine = get_engine()

        job["progress"] = 0.4
        result = await asyncio.to_thread(engine.transcribe, wav_path, hotwords)

        job["status"] = "completed"
        job["progress"] = 1.0
        job["result"] = result

        db = await get_db()
        await db.execute(
            "INSERT INTO meetings (id, filename, audio_path, transcript, duration) VALUES (?, ?, ?, ?, ?)",
            (job_id, job["filename"], audio_path, result["full_text"], duration),
        )
        await db.commit()
        await db.close()

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
