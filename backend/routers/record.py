"""实时录音：边录边识别（增量无说话人）+ 停止后完整 ASR + 说话人分离。

前端流程：
  1. POST /api/record/start            → 拿到 job_id
  2. 每 3 秒 POST /api/record/chunk     → 上传 webm 片段，立即跑增量 ASR
                                         → 通过现有 ws/transcribe/{job_id} 推送 segments
  3. POST /api/record/stop             → 标记结束，触发完整流水线（合并→转码→ASR+CAM++）
                                         → 完成后 ws 推送 {type: complete, result: ...}
"""
import uuid
import asyncio
import shutil
import logging
import traceback
import subprocess
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.asr_engine import get_engine
from services.audio_processor import convert_to_wav, get_audio_duration
from db.database import get_db
import json as _json

router = APIRouter()
logger = logging.getLogger("meeting-minutes.record")

DATA_DIR = Path.home() / "Library" / "Application Support" / "meeting-minutes-assistant" / "audio"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 复用 transcribe.py 的 _jobs（同一进程内可见）
# 这里自己维护一个独立的 record_jobs，避免循环导入
_record_jobs: dict[str, dict] = {}


def _get_transcribe_jobs() -> dict:
    """从 transcribe 模块拿 _jobs，让 ws/transcribe 能读到我们的录音 job。"""
    from routers.transcribe import _jobs
    return _jobs


@router.post("/record/start")
async def record_start():
    """开始录音会话：创建 job_id 和目录。"""
    job_id = str(uuid.uuid4())
    audio_dir = DATA_DIR / job_id
    audio_dir.mkdir(parents=True, exist_ok=True)
    (audio_dir / "chunks").mkdir(exist_ok=True)

    _record_jobs[job_id] = {
        "status": "recording",  # recording | stopped
        "chunks": [],           # 已收到的 webm chunk 路径列表
        "filename": f"录音_{job_id[:8]}.webm",
        "asr_model": "sensevoice",
        "started_at": asyncio.get_event_loop().time(),
    }
    # 在 transcribe._jobs 里也挂一份，ws/transcribe 才能推送
    _get_transcribe_jobs()[job_id] = {
        "status": "processing",
        "progress": 0.05,
        "filename": _record_jobs[job_id]["filename"],
        "audio_path": str(audio_dir / "recording.webm"),
        "result": None,
        "error": None,
        "segments_so_far": [],
        "asr_model": "sensevoice",
        "from_recording": True,  # 标记：录音 job
    }
    return {"job_id": job_id}


@router.post("/record/{job_id}/chunk")
async def record_chunk(job_id: str, file: UploadFile = File(...)):
    """接收一个 webm chunk，立即跑增量 ASR（无说话人），segments 推到 ws。"""
    job = _record_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="录音会话不存在")
    if job["status"] != "recording":
        raise HTTPException(status_code=400, detail="录音已停止")

    chunk_index = len(job["chunks"])
    chunk_path = DATA_DIR / job_id / "chunks" / f"chunk_{chunk_index:04d}.webm"
    with open(chunk_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    job["chunks"].append(str(chunk_path))
    logger.info("收到 chunk job=%s idx=%d size=%dKB", job_id, chunk_index, chunk_path.stat().st_size // 1024)

    # 异步跑增量 ASR（不阻塞响应；结果通过 _jobs["segments_so_far"] 推到 ws）
    asyncio.create_task(_run_chunk_asr(job_id, str(chunk_path), chunk_index))
    return {"job_id": job_id, "chunk_index": chunk_index, "queued": True}


async def _run_chunk_asr(job_id: str, chunk_path: str, chunk_index: int):
    """对单个 chunk 跑 ASR（无说话人，临时用），结果 append 到 _jobs[job_id]["segments_so_far"]。
    时间戳基于录音开始累计偏移。
    """
    transcribe_jobs = _get_transcribe_jobs()
    t_job = transcribe_jobs.get(job_id)
    if not t_job:
        logger.warning("chunk ASR 跳过：transcribe._jobs 找不到 job=%s", job_id)
        return

    try:
        # 转码为 wav
        wav_path = await asyncio.to_thread(convert_to_wav, chunk_path)
        engine = get_engine()

        # 录音开始到这个 chunk 的累计秒数（近似：用已收到的 chunk 文件时长累加）
        # 简化：用 chunks 已识别数量 × ~3 秒估算（后面完整流水线会给出真实时间戳）
        offset_sec = chunk_index * 3.0

        result = await asyncio.to_thread(engine.transcribe, wav_path, "", None, "sensevoice")
        segs = result.get("segments", [])
        # 过滤掉空内容段（VAD 有时切出无语音的 chunk）
        segs = [s for s in segs if (s.get("text") or "").strip()]
        logger.info("chunk ASR 完成 job=%s idx=%d segments=%d chars=%d",
                    job_id, chunk_index, len(segs), len(result.get("full_text", "")))

        for seg in segs:
            seg["start"] = seg.get("start", 0) + offset_sec
            seg["end"] = seg.get("end", 0) + offset_sec
            # 标记为实时识别（无说话人）
            seg["speaker"] = "识别中…"
            t_job["segments_so_far"].append(seg)
    except Exception as e:
        logger.warning("chunk ASR 失败 job=%s chunk=%d: %s", job_id, chunk_index, e)
        logger.warning(traceback.format_exc())


@router.post("/record/{job_id}/stop")
async def record_stop(job_id: str):
    """停止录音：合并所有 chunks → 完整 webm → 完整 ASR + 说话人分离。
    返回完整结果。前端通过现有 ws/transcribe/{job_id} 收 complete 事件。
    """
    job = _record_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="录音会话不存在")
    if job["status"] != "recording":
        return {"job_id": job_id, "status": "already_stopped"}

    if not job["chunks"]:
        raise HTTPException(status_code=400, detail="没有录音数据")

    job["status"] = "stopped"

    # 等一小会，让最后几个 chunk 的 ASR 任务排进队列（可选）
    await asyncio.sleep(0.5)

    # 合并所有 chunk 为一个完整 webm
    audio_dir = DATA_DIR / job_id
    full_webm = audio_dir / "recording.webm"
    chunk_dir = audio_dir / "chunks"
    chunk_files = sorted(chunk_dir.glob("chunk_*.webm"))

    # 优先用 ffmpeg concat demuxer（产出有正确 duration tag 的容器），
    # 失败则退回字节拼接（同样的 codec/格式下通常也能播）
    try:
        concat_list = audio_dir / "concat_list.txt"
        with open(concat_list, "w") as f:
            for cf in chunk_files:
                # ffmpeg concat demuxer 要求路径转义：'file' 部分单引号包裹
                f.write(f"file '{cf.absolute()}'\n")
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list), "-c", "copy", str(full_webm),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 or not full_webm.exists() or full_webm.stat().st_size == 0:
            logger.warning("ffmpeg concat 失败，回退到字节拼接: %s", result.stderr[-300:])
            raise RuntimeError("ffmpeg concat failed")
        logger.info("录音合并完成（ffmpeg concat）job=%s size=%dKB",
                    job_id, full_webm.stat().st_size // 1024)
    except Exception as e:
        logger.warning("使用字节拼接合并 webm: %s", e)
        with open(full_webm, "wb") as out:
            for cf in chunk_files:
                with open(cf, "rb") as f:
                    out.write(f.read())

    # 在后台跑完整 ASR + 说话人分离，结果通过 ws 推送
    asyncio.create_task(_run_full_recording(job_id, str(full_webm)))
    return {"job_id": job_id, "status": "processing"}


async def _run_full_recording(job_id: str, webm_path: str):
    """完整流水线：合并 → ffmpeg 转 wav → 完整 ASR（带说话人） → 写 DB → ws 推 complete。"""
    transcribe_jobs = _get_transcribe_jobs()
    t_job = transcribe_jobs.get(job_id)
    if not t_job:
        return

    try:
        t_job["status"] = "processing"
        t_job["progress"] = 0.3

        wav_path = await asyncio.to_thread(convert_to_wav, webm_path)
        logger.info("录音 ffmpeg 转码完成 job=%s", job_id)

        duration = await asyncio.to_thread(get_audio_duration, webm_path)
        t_job["progress"] = 0.5

        engine = get_engine()

        # 清空实时 segments，准备完整结果
        t_job["segments_so_far"] = []

        def on_segment(segment, idx, total):
            t_job["segments_so_far"].append(segment)
            t_job["progress"] = 0.5 + 0.45 * ((idx + 1) / total)

        result = await asyncio.to_thread(engine.transcribe, wav_path, "", on_segment, "sensevoice")

        t_job["status"] = "completed"
        t_job["progress"] = 1.0
        t_job["result"] = result

        # 写 DB
        db = await get_db()
        await db.execute(
            "INSERT INTO meetings (id, filename, audio_path, transcript, segments, duration) VALUES (?, ?, ?, ?, ?, ?)",
            (job_id, t_job["filename"], webm_path, result["full_text"],
             _json.dumps(result.get("segments", [])), duration),
        )
        await db.commit()
        await db.close()

        logger.info("录音完整 ASR 完成 job=%s segments=%d", job_id, len(result.get("segments", [])))

    except Exception as e:
        t_job["status"] = "error"
        t_job["error"] = str(e)
        logger.error("录音完整流水线失败 job=%s: %s", job_id, e)
        logger.error(traceback.format_exc())
