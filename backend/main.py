import socket
import asyncio
import uvicorn
import logging
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import transcribe, llm, settings, export, record
from db.database import init_db

# 日志：同时输出到 stdout 和文件，方便 app 模式下排查
_LOG_PATH = Path.home() / "Library" / "Logs" / "meeting-minutes-assistant" / "backend.log"
_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

# 手动配置 root logger（basicConfig 在 fastapi/uvicorn 抢先配置后会失效）
_root = logging.getLogger()
_root.setLevel(logging.INFO)
_root.handlers.clear()
_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
_fh = logging.FileHandler(str(_LOG_PATH), encoding="utf-8")
_fh.setFormatter(_formatter)
_sh = logging.StreamHandler(sys.stdout)
_sh.setFormatter(_formatter)
_root.addHandler(_fh)
_root.addHandler(_sh)

logger = logging.getLogger("meeting-minutes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # 启动时强制使用 CC switch 本地路由（CC switch 切换 provider 时本应用自动跟随）
    try:
        import httpx
        from db.database import set_setting
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.post("http://127.0.0.1:15721/v1/messages", json={
                "model": "claude-sonnet-4-20250514", "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            }, headers={"x-api-key": "test", "anthropic-version": "2023-06-01"})
            if resp.status_code in (200, 201):
                await set_setting("baseurl_claude", "http://127.0.0.1:15721")
                await set_setting("apikey_claude", "cc-switch-local")
                print("✓ 已连接 CC switch ���地路由 (15721) - CC switch 切换 provider 时自动跟随", flush=True)
            else:
                print(f"CC switch 本地路由响应 {resp.status_code}，未启用", flush=True)
    except Exception as e:
        print(f"CC switch 本地路由不可用: {e}", flush=True)

    # 后台预热 ASR 模型，避免首次录音时等 30 秒
    async def _warmup_asr():
        try:
            import asyncio
            from services.asr_engine import get_engine
            await asyncio.to_thread(lambda: get_engine().load(model_key="sensevoice"))
            print("✓ ASR 模型预热完成", flush=True)
        except Exception as e:
            print(f"ASR 模型预热失败（不影响后续使用）: {e}", flush=True)

    asyncio.create_task(_warmup_asr())
    yield


app = FastAPI(title="会议纪要助手 Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcribe.router, prefix="/api")
app.include_router(llm.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(record.router, prefix="/api")

# 静态文件：前端构建产物
dist_dir = Path(__file__).parent.parent / "dist"
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="static")


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    port = find_free_port()
    print(f"PORT={port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
